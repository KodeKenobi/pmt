import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/user-store";

const ALLOWED_TEAM_MEMBER_ROLES = new Set<Role>([Role.USER, Role.SUPER_ADMIN]);

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ teamId: string; userId: string }> },
) {
  try {
    const sessionUser = await getUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (sessionUser.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { teamId, userId } = await context.params;
    let membership = await db.teamMembership.findFirst({
      where: { teamId, userId },
      select: { id: true },
    });

    // If membership doesn't exist but user exists and super admin is editing, create it
    if (!membership) {
      const existingUser = await findUserById(userId);
      if (existingUser) {
        try {
          membership = await db.teamMembership.create({
            data: { userId, teamId },
            select: { id: true },
          });
        } catch {
          // Membership might already exist, try finding it again
          membership = await db.teamMembership.findFirst({
            where: { teamId, userId },
            select: { id: true },
          });
        }
      }
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Team membership not found" },
        { status: 404 },
      );
    }

    const existingUser = await findUserById(userId);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (existingUser.role === Role.CLIENT) {
      return NextResponse.json(
        { error: "Client accounts cannot be edited in team members." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const updates: {
      name?: string;
      role?: Role;
      phone?: string | null;
    } = {};

    if (typeof body.name === "string") {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return NextResponse.json(
          { error: "Name cannot be empty." },
          { status: 400 },
        );
      }
      updates.name = trimmedName;
    }

    if (typeof body.role === "string") {
      if (!ALLOWED_TEAM_MEMBER_ROLES.has(body.role as Role)) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      updates.role = body.role as Role;
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const normalizedPhone = normalizePhone(body.phone);
      if (normalizedPhone !== null && normalizedPhone.length > 40) {
        return NextResponse.json(
          { error: "Phone number must be 40 characters or fewer." },
          { status: 400 },
        );
      }
      updates.phone = normalizedPhone;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    await updateUser(userId, updates);
    const updatedUser = await findUserById(userId);

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      member: {
        userId: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error("Update team member error:", error);
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 },
    );
  }
}
