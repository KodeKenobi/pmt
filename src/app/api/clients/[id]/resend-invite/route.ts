import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { findUserByEmail } from "@/lib/user-store";
import {
  sendAdminInviteEmail,
  sendPasswordResetEmail,
} from "@/lib/email-service";
import { resolveAppBaseUrl } from "@/lib/app-url";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const client = await db.client.findUnique({ where: { id } });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const existingUser = await findUserByEmail(client.email);
    const appBaseUrl = resolveAppBaseUrl(request.url);

    if (existingUser) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.passwordReset.create({
        data: {
          token,
          userId: existingUser.id,
          expiresAt,
        },
      });

      await sendPasswordResetEmail(
        client.email,
        token,
        client.name,
        undefined,
        appBaseUrl,
      );

      return NextResponse.json({
        success: true,
        mode: "reset-password",
        message:
          "Client already has an account. A reset-password email was sent.",
      });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.inviteToken.create({
      data: {
        token: inviteToken,
        email: client.email,
        role: Role.CLIENT,
        expiresAt,
        createdBy: user.id,
      },
    });

    await sendAdminInviteEmail(
      client.email,
      inviteToken,
      client.name,
      undefined,
      "/auth/invite?token=",
      appBaseUrl,
      "CLIENT",
    );

    await db.client.update({
      where: { id: client.id },
      data: { isInvited: true },
    });

    return NextResponse.json({
      success: true,
      mode: "invite",
      message: "Invitation email resent successfully.",
    });
  } catch (error) {
    console.error("Resend client invite error:", error);
    return NextResponse.json(
      {
        error:
          "We could not send the client email. Check the email settings and try again.",
      },
      { status: 500 },
    );
  }
}
