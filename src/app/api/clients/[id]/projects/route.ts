import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/lib/db-types";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

function isInternalStaff(role: Role) {
  return role === Role.USER || role === Role.SUPER_ADMIN;
}

function isProjectRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const code = typeof maybe.code === "string" ? maybe.code : "";
  const message = typeof maybe.message === "string" ? maybe.message : "";
  const details = typeof maybe.details === "string" ? maybe.details : "";

  return (
    code === "PGRST200" &&
    (message.includes("Project") || details.includes("Project"))
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isInternalStaff(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const client = await db.client.findUnique({ where: { id } });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    let projects: any[] = [];
    try {
      projects = await db.project.findMany({
        where: { clientId: id },
        include: {
          githubRepos: {
            select: { id: true, owner: true, name: true, url: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    } catch (error) {
      if (!isProjectRelationError(error)) {
        throw error;
      }

      const baseProjects = await db.project.findMany({
        where: { clientId: id },
        orderBy: { updatedAt: "desc" },
      });

      const projectIds = Array.from(
        new Set(baseProjects.map((project: any) => project.id).filter(Boolean)),
      );

      const repos = projectIds.length
        ? await db.githubRepo.findMany({
            where: { projectId: { in: projectIds } },
            select: {
              id: true,
              projectId: true,
              owner: true,
              name: true,
              url: true,
            },
          })
        : [];

      const reposByProject = new Map<string, any[]>();
      for (const repo of repos as any[]) {
        const key = repo.projectId as string;
        if (!reposByProject.has(key)) {
          reposByProject.set(key, []);
        }
        reposByProject.get(key)?.push({
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          url: repo.url,
        });
      }

      projects = baseProjects.map((project: any) => ({
        ...project,
        githubRepos: reposByProject.get(project.id) ?? [],
      }));
    }

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Get client projects error:", error);
    return NextResponse.json(
      {
        error:
          "We could not load this client's projects. Please refresh and try again.",
      },
      { status: 500 },
    );
  }
}
