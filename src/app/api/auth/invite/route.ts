import { db } from "@/lib/db";
import { sendAdminInviteEmail } from "@/lib/email-service";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { findUserByEmail, findUserById } from "@/lib/user-store";
import { resolveAppBaseUrl } from "@/lib/app-url";

// GET - Validate invite token
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const invite = await db.inviteToken.findUnique({
      where: { token },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid or expired invite token" },
        { status: 404 },
      );
    }

    if (new Date() > invite.expiresAt) {
      return NextResponse.json(
        { error: "Invite token has expired" },
        { status: 400 },
      );
    }

    if (invite.used) {
      return NextResponse.json(
        { error: "This invite has already been used" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        valid: true,
        email: invite.email,
        role: invite.role,
        token,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate token" },
      { status: 500 },
    );
  }
}

// POST - Create new invite (admin only)
export async function POST(request: NextRequest) {
  try {
    const { email, role = "USER", name } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Get user from cookie
    const userId = request.cookies.get("userId")?.value;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is SUPER_ADMIN
    const user = await findUserById(userId);

    if (!user || user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can invite users" },
        { status: 403 },
      );
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 },
      );
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create invite record
    const invite = await db.inviteToken.create({
      data: {
        token: inviteToken,
        email,
        role,
        expiresAt,
        createdBy: userId,
      },
    });

    const appBaseUrl = resolveAppBaseUrl(request.url);

    const inviteLink =
      role === "CLIENT"
        ? "/auth/invite?token="
        : `/auth/login?email=${encodeURIComponent(email)}&inviteToken=`;

    // Send invite email — prefer provided name, else use local-part of email
    const inviteName =
      typeof name === "string" && name.trim()
        ? name.trim()
        : email.split("@")[0];

    await sendAdminInviteEmail(
      email,
      inviteToken,
      inviteName,
      undefined,
      inviteLink,
      appBaseUrl,
      role === "CLIENT" ? "CLIENT" : "STAFF",
    );

    return NextResponse.json(
      {
        success: true,
        message: "Invitation sent successfully",
        inviteId: invite.id,
        email,
        expiresAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Invite creation error:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 },
    );
  }
}
