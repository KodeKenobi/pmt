import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  getUserWithTeamAccess,
  teamIdsForUser,
} from "@/lib/access";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserWithTeamAccess(sessionUser.id);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === Role.CLIENT) {
      return NextResponse.json([]);
    }

    const allowed = teamIdsForUser(user);
    const teams =
      allowed === null
        ? await db.team.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : await db.team.findMany({
            where: { id: { in: allowed } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          });

    return NextResponse.json(teams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getUserFromRequest(request);
    if (!sessionUser || sessionUser.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const team = await db.team.create({
      data: { name },
      select: { id: true, name: true },
    });

    // Add the creator to the team membership
    await db.teamMembership.create({
      data: {
        teamId: team.id,
        userId: sessionUser.id,
      },
    });

    await writeAuditLog({
      actorId: sessionUser.id,
      action: "TEAM_CREATE",
      entityType: "Team",
      entityId: team.id,
      metadata: { name: team.name },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    console.error("Error creating team:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
