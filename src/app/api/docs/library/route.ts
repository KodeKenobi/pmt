import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { canAccessTeam, teamIdsForUser } from "@/lib/access";
import { getGithubClient } from "@/lib/github";

const documentInclude = {
  author: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
} as const;

function isDocRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown };
  const code = typeof maybe.code === "string" ? maybe.code : "";
  return code.startsWith("PGRST2");
}

async function hydrateDocuments(baseDocs: any[]) {
  const authorIds = new Set<string>();
  const teamIds = new Set<string>();
  const projectIds = new Set<string>();

  for (const doc of baseDocs) {
    if (doc.authorId) authorIds.add(doc.authorId);
    if (doc.teamId) teamIds.add(doc.teamId);
    if (doc.projectId) projectIds.add(doc.projectId);
  }

  const [authors, teams, projects] = await Promise.all([
    authorIds.size
      ? db.user.findMany({
          where: { id: { in: Array.from(authorIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    teamIds.size
      ? db.team.findMany({
          where: { id: { in: Array.from(teamIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    projectIds.size
      ? db.project.findMany({
          where: { id: { in: Array.from(projectIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const authorById = new Map(authors.map((author: any) => [author.id, author]));
  const teamById = new Map(teams.map((team: any) => [team.id, team]));
  const projectById = new Map(
    projects.map((project: any) => [project.id, project]),
  );

  return baseDocs.map((doc: any) => ({
    ...doc,
    author: doc.authorId ? (authorById.get(doc.authorId) ?? null) : null,
    team: doc.teamId ? (teamById.get(doc.teamId) ?? null) : null,
    project: doc.projectId ? (projectById.get(doc.projectId) ?? null) : null,
  }));
}

async function fetchRepoReadmeHtml(
  github: NonNullable<Awaited<ReturnType<typeof getGithubClient>>>,
  owner: string,
  repo: string,
) {
  try {
    const response = await github.octokit.request(
      "GET /repos/{owner}/{repo}/readme",
      {
        owner,
        repo,
        headers: {
          accept: "application/vnd.github.html+json",
        },
      },
    );

    const data = response.data as unknown;
    if (typeof data === "string") {
      return data;
    }

    return null;
  } catch (error: any) {
    if (error?.status === 404 || error?.status === 403) {
      return null;
    }
    throw error;
  }
}

async function fetchOrgRepos(
  github: NonNullable<Awaited<ReturnType<typeof getGithubClient>>>,
  org: string,
) {
  const repos = await github.octokit.paginate("GET /orgs/{org}/repos", {
    org,
    per_page: 100,
    type: "all",
    sort: "updated",
    direction: "desc",
  });

  return repos.map((repo: any) => ({
    id: repo.id,
    owner: repo.owner?.login || org,
    name: repo.name,
    url: repo.html_url,
    updatedAt: repo.updated_at ?? null,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getUserFromRequest(request);
    if (!sessionUser || sessionUser.role === "CLIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    const docWhere: Record<string, unknown> = {};
    let allowedTeamIds: string[] | null = null;

    if (sessionUser.role === "USER") {
      allowedTeamIds = teamIdsForUser(sessionUser) ?? [];
      if (teamId) {
        if (!canAccessTeam(sessionUser, teamId)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        docWhere.teamId = teamId;
        allowedTeamIds = [teamId];
      } else {
        docWhere.teamId = { in: allowedTeamIds };
      }
    } else if (teamId) {
      docWhere.teamId = teamId;
      allowedTeamIds = [teamId];
    }

    let docs: any[];
    try {
      docs = await db.document.findMany({
        where: docWhere,
        orderBy: { updatedAt: "desc" },
        include: documentInclude,
      });
    } catch (error) {
      if (!isDocRelationError(error)) throw error;
      const baseDocs = await db.document.findMany({
        where: docWhere,
        orderBy: { updatedAt: "desc" },
      });
      docs = await hydrateDocuments(baseDocs as any[]);
    }

    const githubOrg = process.env.GITHUB_ORG?.trim() || "EnableTechCo";
    let repoReadmes: Array<{
      id: string;
      kind: string;
      title: string;
      summary: string;
      contentHtml: string | null;
      updatedAt: string | null;
      owner: string;
      repo: string;
      url: string;
      project: null;
    }> = [];

    try {
      const github = await getGithubClient(sessionUser.id);
      if (github) {
        repoReadmes = await Promise.all(
          (await fetchOrgRepos(github, githubOrg)).map(async (repo) => {
            const readmeHtml = await fetchRepoReadmeHtml(
              github,
              repo.owner,
              repo.name,
            ).catch((error) => {
              console.warn(
                `Skipping README for ${repo.owner}/${repo.name}:`,
                error,
              );
              return null;
            });

            return {
              id: `repo:${repo.owner}/${repo.name}`,
              kind: "repo-readme",
              title: `${repo.owner}/${repo.name}`,
              summary: `README from ${githubOrg}`,
              contentHtml: readmeHtml,
              updatedAt: repo.updatedAt,
              owner: repo.owner,
              repo: repo.name,
              url: repo.url,
              project: null,
            };
          }),
        );
      }
    } catch (error) {
      console.warn("Docs library GitHub fetch unavailable:", error);
    }

    return NextResponse.json(
      {
        authoredDocs: docs.map((doc: any) => ({
          ...doc,
          kind: "authored-doc",
          contentHtml: doc.content ?? "",
        })),
        repoReadmes: repoReadmes.filter((item) => Boolean(item.contentHtml)),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("Get docs library error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
