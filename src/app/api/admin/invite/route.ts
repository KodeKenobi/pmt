import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  getUserFromRequest,
  isInternalStaffEmail,
} from "@/lib/auth";
import { sendAdminInviteEmail } from "@/lib/email-service";
import { Role } from "@/lib/db-types";
import { randomBytes } from "node:crypto";
import { createUser, findUserByEmail } from "@/lib/user-store";
import { resolveAppBaseUrl } from "@/lib/app-url";

const ALLOWED_INVITE_ROLES = new Set<Role>([
  Role.USER,
  Role.SUPER_ADMIN,
  Role.CLIENT,
]);

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user || user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Only super admins can invite new admins" },
        { status: 403 },
      );
    }

    const { email, name, teamId, role } = await request.json();
    const selectedRole: Role = ALLOWED_INVITE_ROLES.has(role)
      ? role
      : Role.USER;

    if (!email || !name) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 },
      );
    }

    if (selectedRole === Role.USER && !isInternalStaffEmail(email)) {
      return NextResponse.json(
        {
          error:
            "Staff invites must use @lighthousemediagroup.com email addresses.",
        },
        { status: 400 },
      );
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 },
      );
    }

    let team: { id: string; name: string } | null = null;
    if (selectedRole !== Role.CLIENT) {
      if (!teamId) {
        return NextResponse.json(
          { error: "teamId is required for admin and super admin invites" },
          { status: 400 },
        );
      }

      const resolvedTeam = await db.team.findUnique({ where: { id: teamId } });
      if (!resolvedTeam) {
        return NextResponse.json(
          { error: "Invalid team selected" },
          { status: 400 },
        );
      }
      team = resolvedTeam;
    }

    const temporaryPasswordHash = await hashPassword(
      randomBytes(24).toString("hex"),
    );

    const newAdmin = await createUser({
      email,
      name,
      password: temporaryPasswordHash,
      role: selectedRole,
      teamId: team?.id ?? null,
    });

    if (selectedRole === Role.CLIENT) {
      const existingClient = await db.client.findUnique({ where: { email } });
      if (existingClient) {
        await db.client.update({
          where: { id: existingClient.id },
          data: {
            name,
            isInvited: true,
          },
        });
      } else {
        await db.client.create({
          data: {
            name,
            email,
            isInvited: true,
          },
        });
      }
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.passwordReset.create({
      data: {
        token,
        userId: newAdmin.id,
        expiresAt,
      },
    });

    const appBaseUrl = resolveAppBaseUrl(request.url);

    const inviteLink =
      selectedRole === Role.CLIENT
        ? "/auth/invite?token="
        : `/auth/login?email=${encodeURIComponent(email)}&inviteToken=`;

    // Use the invite HTML template for the admin invite and point the CTA to the correct entry flow
    await sendAdminInviteEmail(
      email,
      token,
      name,
      team?.name,
      inviteLink,
      appBaseUrl,
      selectedRole === Role.CLIENT ? "CLIENT" : "STAFF",
    );

    return NextResponse.json({
      message: "Invite sent successfully",
      user: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Error inviting admin:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}
