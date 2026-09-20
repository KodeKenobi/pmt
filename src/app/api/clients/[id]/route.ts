import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { Role } from "@/lib/db-types";

export async function PATCH(
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
    const body = await request.json();

    const existing = await db.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const data: { name?: string; email?: string; isInvited?: boolean } = {};

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Client name cannot be empty" },
          { status: 400 },
        );
      }
      data.name = trimmed;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: "Email cannot be empty" },
          { status: 400 },
        );
      }
      const duplicate = await db.client.findUnique({ where: { email } });
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: "Another client already uses this email" },
          { status: 400 },
        );
      }
      data.email = email;
    }

    if (typeof body.isInvited === "boolean") {
      data.isInvited = body.isInvited;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const updated = await db.client.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update client error:", error);
    return NextResponse.json(
      { error: "We could not update this client. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const existing = await db.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({
        success: true,
        alreadyDeleted: true,
      });
    }

    // Cascade delete client-owned data first so the client can be removed in one action.
    // Dependent records (milestones, comments, attachments, activities, github links)
    // are removed by DB-level ON DELETE CASCADE constraints.
    const clientProjects = await db.project.findMany({
      where: { clientId: id },
      select: { id: true },
    });
    const clientProjectIds = clientProjects.map(
      (project: { id: string }) => project.id,
    );

    const deletedTickets = await db.ticket.deleteMany({
      where: {
        OR: [
          { clientId: id },
          ...(clientProjectIds.length > 0
            ? [{ projectId: { in: clientProjectIds } }]
            : []),
        ],
      },
    });

    const deletedProjects = await db.project.deleteMany({
      where: { clientId: id },
    });

    const deletedInviteTokens = await db.inviteToken.deleteMany({
      where: { email: existing.email },
    });

    await db.client.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      deleted: {
        projects: deletedProjects.count,
        tickets: deletedTickets.count,
        inviteTokens: deletedInviteTokens.count,
      },
    });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json(
      { error: "We could not delete this client. Please try again." },
      { status: 500 },
    );
  }
}
