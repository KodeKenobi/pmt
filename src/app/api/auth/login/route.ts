import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/auth";
import { getUserWithTeamAccess, teamIdsForUser } from "@/lib/access";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json(
        { error: "Access token is required" },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: supabaseData, error: supabaseError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (supabaseError || !supabaseData.user?.email) {
      console.error("Supabase getUser failed during login exchange", {
        status: supabaseError?.status,
        code: supabaseError?.code,
        message: supabaseError?.message,
      });
      return NextResponse.json(
        { error: "Invalid or expired sign-in link" },
        { status: 401 },
      );
    }

    const email = supabaseData.user.email.toLowerCase().trim();
    const user = await getUserByEmail(email);

    if (!user) {
      console.error("Login rejected: no matching app user", { email });
      return NextResponse.json(
        {
          error:
            "Your account is not provisioned in this workspace yet. Ask an admin to invite you first.",
        },
        { status: 401 },
      );
    }

    const full = await getUserWithTeamAccess(user.id);
    const teamIds = full ? teamIdsForUser(full) : null;

    // Once invited users successfully sign in, mark outstanding invite/reset
    // tokens as used so admin-facing invitation status reflects activation.
    await db.passwordReset.updateMany({
      where: {
        userId: user.id,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        used: true,
      },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        teamId: user.teamId,
        teamIds,
      },
    });

    response.cookies.set("userId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    if (error instanceof Error && error.name === "DatabaseSchemaError") {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
