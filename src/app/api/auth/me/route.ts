import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserWithTeamAccess, teamIdsForUser } from "@/lib/access";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const full = await getUserWithTeamAccess(user.id);
    const teamIds = full ? teamIdsForUser(full) : [];

    return NextResponse.json({
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
  } catch (error) {
    console.error("Get user error:", error);
    if (error instanceof Error && error.name === "DatabaseSchemaError") {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can edit their own profile
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can edit their profile" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name, email } = body;

    // Validate input
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      return NextResponse.json(
        { error: "Name and email cannot be empty" },
        { status: 400 },
      );
    }

    // Update user profile
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        name: trimmedName,
        email: trimmedEmail,
      },
    });

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        teamId: updatedUser.teamId,
      },
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update user error:", error);
    if (error instanceof Error && error.name === "DatabaseSchemaError") {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
