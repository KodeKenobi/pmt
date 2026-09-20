import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { sendAdminInviteEmail } from "@/lib/email-service";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { resolveAppBaseUrl } from "@/lib/app-url";
import crypto from "node:crypto";

function isInternalStaff(role: Role) {
  return role === Role.USER || role === Role.SUPER_ADMIN;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isInternalStaff(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const clients = await db.client.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    const projects = await db.project.findMany({
      select: {
        clientId: true,
      },
    });

    const authByEmail = new Map<
      string,
      {
        emailConfirmed: boolean;
        hasSignedIn: boolean;
      }
    >();

    try {
      const supabaseAdmin = createSupabaseAdminClient();
      let page = 1;
      const perPage = 200;

      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

        if (error) {
          throw error;
        }

        const users = data?.users ?? [];
        for (const authUser of users) {
          const email = authUser.email?.toLowerCase();
          if (!email) continue;
          authByEmail.set(email, {
            emailConfirmed: Boolean(authUser.email_confirmed_at),
            hasSignedIn: Boolean(authUser.last_sign_in_at),
          });
        }

        if (users.length < perPage) {
          break;
        }
        page += 1;
      }
    } catch (authError) {
      console.warn(
        "Could not load Supabase auth users for client activation status",
        authError,
      );
    }

    const projectCountByClient = new Map<string, number>();
    for (const project of projects as Array<{ clientId?: string | null }>) {
      if (!project.clientId) continue;
      projectCountByClient.set(
        project.clientId,
        (projectCountByClient.get(project.clientId) ?? 0) + 1,
      );
    }

    const clientsWithCounts = clients.map((client: any) => ({
      ...client,
      projectCount: projectCountByClient.get(client.id) ?? 0,
      invitationStatus: !client.isInvited
        ? "NOT_INVITED"
        : authByEmail.get(String(client.email).toLowerCase())?.emailConfirmed
          ? "ACTIVATED"
          : "INVITED_NOT_CONFIRMED",
      hasSignedIn:
        authByEmail.get(String(client.email).toLowerCase())?.hasSignedIn ??
        false,
    }));

    return NextResponse.json(clientsWithCounts);
  } catch (error) {
    console.error("Get clients error:", error);
    return NextResponse.json(
      { error: "We could not load clients. Please refresh and try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, email, isInvited = false } = await request.json();
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : null;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    // Only check for duplicate if email is provided
    if (normalizedEmail) {
      const existingClient = await db.client.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingClient) {
        return NextResponse.json(
          { error: "Client already exists" },
          { status: 400 },
        );
      }
    }

    const client = await db.client.create({
      data: {
        name,
        email: normalizedEmail,
        isInvited,
      },
    });

    let warning: string | null = null;

    if (isInvited && !normalizedEmail) {
      warning = "Client created but not invited (email required for invitations)";
    } else if (isInvited && normalizedEmail) {
      try {
        const appBaseUrl = resolveAppBaseUrl(request.url);
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.inviteToken.create({
          data: {
            token: inviteToken,
            email: normalizedEmail,
            role: Role.CLIENT,
            expiresAt,
            createdBy: user.id,
          },
        });

        await sendAdminInviteEmail(
          normalizedEmail,
          inviteToken,
          name,
          undefined,
          "/auth/invite?token=",
          appBaseUrl,
          "CLIENT",
        );
      } catch (inviteError) {
        console.error("Client invite email error:", inviteError);
        await db.client.update({
          where: { id: client.id },
          data: { isInvited: false },
        });
        warning =
          "Client was created, but invitation email failed to send. Please check the email provider configuration and use Resend Invite.";
      }
    }

    const createdClient = warning
      ? await db.client.findUnique({ where: { id: client.id } })
      : client;

    return NextResponse.json({
      ...(createdClient || client),
      warning,
    });
  } catch (error) {
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "We could not create this client. Please try again." },
      { status: 500 },
    );
  }
}
