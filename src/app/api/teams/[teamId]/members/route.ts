import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import {
  getUserFromRequest,
  hashPassword,
  isInternalStaffEmail,
} from "@/lib/auth";
import { getUserWithTeamAccess, canAccessTeam } from "@/lib/access";
import { writeAuditLog } from "@/lib/audit";
import { sendAdminInviteEmail } from "@/lib/email-service";
import { resolveAppBaseUrl } from "@/lib/app-url";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
} from "@/lib/user-store";
import { randomBytes } from "node:crypto";

async function requireSuperAdmin(request: NextRequest) {
  const sessionUser = await getUserFromRequest(request);
  if (!sessionUser) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (sessionUser.role !== Role.SUPER_ADMIN) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { sessionUser };
}

function inferNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const inferredName = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  return inferredName || localPart || "New Team Member";
}

type InvitationStatus =
  | "INVITED_NOT_CONFIRMED"
  | "INVITE_EXPIRED"
  | "ACTIVATED";

type InviteTokenSummary = {
  used: boolean;
  expiresAt: string | Date;
};

const ALLOWED_TEAM_MEMBER_ROLES = new Set<Role>([Role.USER, Role.SUPER_ADMIN]);

async function getInvitationStatusForUser(
  userId: string,
): Promise<InvitationStatus> {
  const inviteTokens = (await db.passwordReset.findMany({
    where: { userId },
    select: {
      used: true,
      expiresAt: true,
    },
  })) as InviteTokenSummary[];

  if (inviteTokens.length === 0) {
    return "ACTIVATED";
  }

  const latestInviteToken = inviteTokens.reduce(
    (latest: InviteTokenSummary, current: InviteTokenSummary) => {
      return new Date(current.expiresAt) > new Date(latest.expiresAt)
        ? current
        : latest;
    },
    inviteTokens[0],
  );

  if (latestInviteToken.used) {
    return "ACTIVATED";
  }

  if (new Date() > new Date(latestInviteToken.expiresAt)) {
    return "INVITE_EXPIRED";
  }

  return "INVITED_NOT_CONFIRMED";
}

/** GET — list members (super admin only) */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const sessionUser = await getUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserWithTeamAccess(sessionUser.id);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== Role.SUPER_ADMIN && !canAccessTeam(user, teamId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const memberships = await db.teamMembership.findMany({
      where: { teamId },
    });

    const hydratedMembers = await Promise.all(
      memberships.map(async (membership: { id: string; userId: string }) => {
        const memberUser = await findUserById(membership.userId);
        if (!memberUser) {
          return null;
        }

        let invitationStatus: InvitationStatus = "ACTIVATED";
        try {
          invitationStatus = await getInvitationStatusForUser(memberUser.id);
        } catch (statusError) {
          console.warn("Failed to resolve team member invite status", {
            userId: memberUser.id,
            statusError,
          });
        }

        return {
          membershipId: membership.id,
          userId: memberUser.id,
          name: memberUser.name,
          email: memberUser.email,
          phone: memberUser.phone,
          role: memberUser.role,
          invitationStatus,
        };
      }),
    );

    const members = hydratedMembers
      .filter(
        (
          member,
        ): member is {
          membershipId: string;
          userId: string;
          name: string;
          email: string;
          phone: string | null;
          role: Role;
          invitationStatus: InvitationStatus;
        } => member !== null,
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Get team members error:", error);
    return NextResponse.json(
      { error: "Failed to load team members" },
      { status: 500 },
    );
  }
}

/** POST — add member by email (super admin only; internal staff only) */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireSuperAdmin(request);
  if ("error" in auth) return auth.error;
  const { sessionUser } = auth;

  const { teamId } = await context.params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const rawEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  const rawRole = typeof body.role === "string" ? body.role : "";
  const selectedRole: Role = ALLOWED_TEAM_MEMBER_ROLES.has(rawRole as Role)
    ? (rawRole as Role)
    : Role.USER;
  if (!rawEmail) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  let target = await findUserByEmail(rawEmail);
  let invited = false;
  let inviteEmailSent: boolean | null = null;
  let warning: string | null = null;

  if (!target) {
    if (selectedRole === Role.USER && !isInternalStaffEmail(rawEmail)) {
      return NextResponse.json(
        {
          error:
            "Staff invites must use @lighthousemediagroup.com email addresses.",
        },
        { status: 400 },
      );
    }

    const temporaryPasswordHash = await hashPassword(
      randomBytes(24).toString("hex"),
    );

    target = await createUser({
      email: rawEmail,
      name: rawName || inferNameFromEmail(rawEmail),
      password: temporaryPasswordHash,
      role: selectedRole,
      teamId,
    });

    invited = true;
  }

  if (target.role === Role.CLIENT) {
    return NextResponse.json(
      { error: "Client accounts cannot be added to internal teams." },
      { status: 400 },
    );
  }

  if (target.role !== selectedRole) {
    await db.user.update({
      where: { id: target.id },
      data: { role: selectedRole },
    });
    target = { ...target, role: selectedRole };
  }

  try {
    await db.teamMembership.create({
      data: { userId: target.id, teamId },
    });
  } catch {
    return NextResponse.json(
      { error: "That user is already on this team." },
      { status: 409 },
    );
  }

  if (target.teamId === null) {
    await updateUser(target.id, { teamId });
  }

  const inviteToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.passwordReset.create({
    data: {
      token: inviteToken,
      userId: target.id,
      expiresAt,
    },
  });

  try {
    const appBaseUrl = resolveAppBaseUrl(request.url);
    const loginLink = `/auth/login?email=${encodeURIComponent(target.email)}&inviteToken=`;
    console.log("[Team Add] sending invite email", {
      teamId,
      teamName: team.name,
      userId: target.id,
      email: target.email,
      invited,
      selectedRole,
      endpoint: "/api/teams/[teamId]/members",
      provider:
        process.env.EMAIL_PROVIDER ||
        (process.env.RESEND_API_KEY ? "resend" : "smtp"),
      inviteToken: `${inviteToken.slice(0, 6)}...`,
      loginLink,
    });

    const emailResult = await sendAdminInviteEmail(
      target.email,
      inviteToken,
      target.name,
      team.name,
      loginLink,
      appBaseUrl,
    );

    console.log("[Team Add] invite email sent", {
      teamId,
      teamName: team.name,
      userId: target.id,
      email: target.email,
      result: emailResult,
    });
    inviteEmailSent = true;
  } catch (error) {
    console.error("[Team Add] invite email failed", {
      teamId,
      teamName: team.name,
      userId: target.id,
      email: target.email,
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    inviteEmailSent = false;
    warning =
      "Member added, but invitation email failed to send. Check the email provider configuration and resend invite.";
  }

  await writeAuditLog({
    actorId: sessionUser.id,
    action: "TEAM_MEMBER_ADD",
    entityType: "TeamMembership",
    entityId: teamId,
    metadata: {
      teamName: team.name,
      userId: target.id,
      email: target.email,
      invited,
      inviteEmailSent,
      selectedRole,
    },
  });

  const invitationStatus = await getInvitationStatusForUser(target.id);

  return NextResponse.json({
    ok: true,
    invited,
    inviteEmailSent,
    warning,
    member: {
      userId: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      invitationStatus,
    },
  });
}

/** DELETE — remove member ?userId= (super admin only) */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireSuperAdmin(request);
  if ("error" in auth) return auth.error;
  const { sessionUser } = auth;

  const { teamId } = await context.params;
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === sessionUser.id) {
    return NextResponse.json(
      { error: "You cannot remove your own account from the team." },
      { status: 400 },
    );
  }

  const deleted = await db.teamMembership.deleteMany({
    where: { teamId, userId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ ok: true, removed: false, deletedCount: 0 });
  }

  // Removing a team member should also remove their account and invite tokens.
  await db.teamMembership.deleteMany({ where: { userId } });
  await db.passwordReset.deleteMany({ where: { userId } });

  const existingUser = await findUserById(userId);
  if (!existingUser) {
    return NextResponse.json({ ok: true, removed: true, deletedUser: false });
  }

  try {
    await db.user.delete({ where: { id: userId } });
  } catch (error) {
    console.error("TEAM_MEMBER_REMOVE user delete failed", {
      teamId,
      userId,
      error,
    });
    return NextResponse.json(
      {
        error:
          "Team membership was removed, but user account could not be deleted because it is linked to other records.",
      },
      { status: 409 },
    );
  }

  await writeAuditLog({
    actorId: sessionUser.id,
    action: "TEAM_MEMBER_REMOVE",
    entityType: "TeamMembership",
    entityId: teamId,
    metadata: { teamName: team.name, userId },
  });

  return NextResponse.json({
    ok: true,
    removed: true,
    deletedUser: true,
    deletedCount: deleted.count,
  });
}
