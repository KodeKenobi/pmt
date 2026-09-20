"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SelectMenu } from "@/components/SelectMenu";
import { onRealtimeChange } from "@/lib/realtime-events";
import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";

type Milestone = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
};

type TicketSummary = {
  id: string;
  title: string;
  status: string;
  client?: { name: string } | null;
  assignee?: { name: string } | null;
  createdAt: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  progress: number;
  health: string;
  status: string;
  client?: { id: string; name: string; email?: string } | null;
  team: { id: string; name: string };
  milestones: Milestone[];
  githubRepos?: Array<{ id: string; owner: string; name: string; url: string }>;
  _count: { tickets: number };
};

type ClientOption = {
  id: string;
  name: string;
  email: string;
  invitationStatus?: "NOT_INVITED" | "INVITED_NOT_CONFIRMED" | "ACTIVATED";
};

type GithubRepoOption = {
  owner: string;
  name: string;
  url: string;
  fullName: string;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManageProjectRepos = isSuperAdmin;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assigningClient, setAssigningClient] = useState(false);
  const [invitingClient, setInvitingClient] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "" });
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [availableGithubRepos, setAvailableGithubRepos] = useState<
    GithubRepoOption[]
  >([]);
  const [selectedGithubRepoUrl, setSelectedGithubRepoUrl] = useState("");
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);
  const [savingGithubRepos, setSavingGithubRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState("");

  const projectTicketsUrl = (() => {
    const params = new URLSearchParams({ projectId: id });
    if (user?.role === "USER" && project?.team?.id) {
      params.set("teamId", project.team.id);
    }
    return `/api/tickets?${params.toString()}`;
  })();

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT") return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("Not found");
        setProject(await res.json());
      } catch {
        setPageError("Could not load project.");
      }
    })();
  }, [authLoading, user, id]);

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT" || !project) return;
    void (async () => {
      try {
        const res = await fetch(projectTicketsUrl);
        if (!res.ok) return;
        setTickets(await res.json());
      } catch {
        // ignore
      }
    })();
  }, [authLoading, user, project, projectTicketsUrl]);

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (
        detail.table !== "Project" &&
        detail.table !== "Milestone" &&
        detail.table !== "Ticket" &&
        detail.table !== "GithubRepo"
      ) {
        return;
      }

      void (async () => {
        try {
          const [projectRes, ticketsRes] = await Promise.all([
            fetch(`/api/projects/${id}`),
            fetch(projectTicketsUrl),
          ]);
          if (projectRes.ok) {
            setProject(await projectRes.json());
          }
          if (ticketsRes.ok) {
            setTickets(await ticketsRes.json());
          }
        } catch {
          // ignore realtime refresh errors
        }
      })();
    });

    return unsubscribe;
  }, [authLoading, user, id, projectTicketsUrl]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;

    void (async () => {
      setLoadingClients(true);
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) {
          throw new Error("Failed to load clients");
        }
        const data = (await res.json()) as ClientOption[];
        setClients(Array.isArray(data) ? data : []);
      } catch {
        setClients([]);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, [authLoading, user]);

  useEffect(() => {
    setSelectedClientId(project?.client?.id ?? "");
  }, [project?.client?.id]);

  const toggleMilestone = async (m: Milestone) => {
    const res = await fetch(`/api/milestones/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !m.completedAt }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setProject((p) =>
      p
        ? {
            ...p,
            milestones: p.milestones.map((x) =>
              x.id === updated.id ? updated : x,
            ),
          }
        : p,
    );
  };

  const deleteProject = async () => {
    if (!project || user?.role !== "SUPER_ADMIN" || deleting) return;

    setDeleting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to delete project.",
        );
      }

      router.push("/projects");
      router.refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete project.",
      );
    } finally {
      setShowDeleteConfirm(false);
      setDeleting(false);
    }
  };

  const assignClientToProject = async (clientId: string | null) => {
    if (!project || user?.role !== "SUPER_ADMIN" || assigningClient) return;

    setAssigningClient(true);
    setActionError("");
    setActionMessage("");
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to update project client");
      }

      setProject(body as ProjectDetail);
      setActionMessage(
        clientId
          ? "Client assigned to project."
          : "Client removed from project.",
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update project client",
      );
    } finally {
      setAssigningClient(false);
    }
  };

  const handleAssignClient = async (event: React.FormEvent) => {
    event.preventDefault();
    await assignClientToProject(selectedClientId || null);
  };

  const handleInviteAndAssign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (user?.role !== "SUPER_ADMIN" || invitingClient) return;

    const name = inviteForm.name.trim();
    const email = inviteForm.email.trim().toLowerCase();
    if (!name || !email) return;

    setInvitingClient(true);
    setActionError("");
    setActionMessage("");
    try {
      const createRes = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, isInvited: true }),
      });
      const createBody = await createRes.json().catch(() => ({}));

      if (!createRes.ok) {
        throw new Error(createBody.error || "Failed to invite client");
      }

      const newClientId =
        typeof createBody.id === "string" && createBody.id.length > 0
          ? createBody.id
          : "";

      if (!newClientId) {
        throw new Error("Client invited but could not resolve client id");
      }

      const refreshedClientsRes = await fetch("/api/clients");
      if (refreshedClientsRes.ok) {
        const refreshed = (await refreshedClientsRes.json()) as ClientOption[];
        setClients(Array.isArray(refreshed) ? refreshed : []);
      }

      setSelectedClientId(newClientId);
      setInviteForm({ name: "", email: "" });
      await assignClientToProject(newClientId);

      if (typeof createBody.warning === "string" && createBody.warning) {
        setActionMessage(`Client created and assigned. ${createBody.warning}`);
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to invite and assign client",
      );
    } finally {
      setInvitingClient(false);
    }
  };

  const fetchAvailableGithubRepos = async () => {
    setLoadingGithubRepos(true);
    setGithubReposError("");

    try {
      const response = await fetch("/api/github/repos");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load GitHub repositories");
      }

      const repos = (await response.json()) as Array<{
        name?: string;
        full_name?: string;
        html_url?: string;
        owner?: { login?: string };
      }>;

      const normalized = repos
        .map((repo) => {
          const owner = repo.owner?.login;
          const name = repo.name;
          const url = repo.html_url;
          if (!owner || !name || !url) return null;
          return {
            owner,
            name,
            url,
            fullName: repo.full_name || `${owner}/${name}`,
          };
        })
        .filter((repo): repo is GithubRepoOption => repo !== null);

      setAvailableGithubRepos(normalized);
    } catch (err) {
      setAvailableGithubRepos([]);
      setGithubReposError(
        err instanceof Error
          ? err.message
          : "Failed to load GitHub repositories",
      );
    } finally {
      setLoadingGithubRepos(false);
    }
  };

  const openRepoPicker = () => {
    setActionError("");
    setActionMessage("");
    setGithubReposError("");
    setSelectedGithubRepoUrl(project?.githubRepos?.[0]?.url ?? "");
    setShowRepoPicker(true);
    void fetchAvailableGithubRepos();
  };

  const saveProjectRepos = async () => {
    if (!project || savingGithubRepos) return;

    setSavingGithubRepos(true);
    setActionError("");
    setActionMessage("");
    setGithubReposError("");

    try {
      const selected = availableGithubRepos.find(
        (repo) => repo.url === selectedGithubRepoUrl,
      );

      const githubRepos = selected
        ? [{ owner: selected.owner, name: selected.name, url: selected.url }]
        : [];

      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepos }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to save project repo");
      }

      setProject(body as ProjectDetail);
      setActionMessage(
        selected
          ? "Project repo linked. Tickets in this project now inherit it."
          : "Project repo link cleared.",
      );
      setShowRepoPicker(false);
    } catch (err) {
      setGithubReposError(
        err instanceof Error ? err.message : "Failed to save project repo",
      );
    } finally {
      setSavingGithubRepos(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (user.role === "CLIENT") {
    return (
      <DashboardLayout>
        <p className="text-gray-600">Unavailable.</p>
      </DashboardLayout>
    );
  }

  if (pageError || !project) {
    return (
      <DashboardLayout>
        {pageError ? (
          <>
            <p className="text-gray-600 dark:text-gray-400">{pageError}</p>
            <Link href="/projects" className="mt-4 inline-block text-indigo-600">
              Back to projects
            </Link>
          </>
        ) : (
          <div className="w-full space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonLine className="h-7 w-2/5 mb-3" />
              <SkeletonLine className="h-4 w-3/5 mb-2" />
              <SkeletonLine className="h-4 w-4/5" />
            </div>
            <div className="grid gap-6 grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonLine className="h-5 w-1/4 mb-4" />
              <SkeletonLine className="h-4 w-full mb-2" />
              <SkeletonLine className="h-4 w-full mb-2" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full">
        <Link href="/projects" className="text-sm text-indigo-600">
          ← Projects
        </Link>
        {actionError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {actionMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {actionMessage}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4 mb-4">
            {project.name}
          </h1>
          {user.role === "SUPER_ADMIN" && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="mb-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              {deleting ? "Deleting..." : "Delete project"}
            </button>
          )}
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-indigo-500"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="space-y-6 mt-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Milestones
              </h2>
              <ul className="mt-3 space-y-2">
                {project.milestones.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <span
                      className={
                        m.completedAt
                          ? "text-gray-400 line-through"
                          : "text-gray-900 dark:text-white"
                      }
                    >
                      {m.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMilestone(m)}
                      className="text-sm text-indigo-600"
                    >
                      {m.completedAt ? "Reopen" : "Complete"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-[#0F1419]/80">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Project tickets
                  </h2>
                  <p className="text-sm text-gray-500">
                    {tickets.length} ticket{tickets.length === 1 ? "" : "s"}{" "}
                    linked to this project.
                  </p>
                </div>
                <Link
                  href="/tickets"
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  View all tickets
                </Link>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Ticket
                      </th>
                      <th className="py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Assignee
                      </th>
                      <th className="py-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="py-4 pr-6 text-sm text-gray-900 dark:text-white">
                          <Link
                            href={`/tickets/${ticket.id}`}
                            className="font-medium hover:text-brand-600"
                          >
                            {ticket.title}
                          </Link>
                        </td>
                        <td className="py-4 pr-6 text-sm text-gray-700 dark:text-gray-300">
                          {ticket.status
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="py-4 pr-6 text-sm text-gray-700 dark:text-gray-300">
                          {ticket.assignee?.name || "Unassigned"}
                        </td>
                        <td className="py-4 text-sm text-gray-700 dark:text-gray-300">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6 mt-8">
            {user.role === "SUPER_ADMIN" && (
              <div className="rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-[#0F1419]/80">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Client Assignment
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Assign an existing or invited client to this project.
                </p>

                <form onSubmit={handleAssignClient} className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Linked Client
                  </label>
                  <SelectMenu
                    value={selectedClientId}
                    onChange={setSelectedClientId}
                    options={[
                      { value: "", label: "No client yet" },
                      ...clients.map((client) => ({
                        value: client.id,
                        label:
                          client.name +
                          (client.invitationStatus === "INVITED_NOT_CONFIRMED"
                            ? " (Invited)"
                            : ""),
                      })),
                    ]}
                    className="w-full"
                    triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  {loadingClients ? (
                    <p className="text-xs text-gray-500">Loading clients...</p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={assigningClient || loadingClients}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {assigningClient ? "Saving..." : "Save Client Assignment"}
                  </button>
                </form>

                <div className="my-5 h-px bg-gray-200 dark:bg-gray-800" />

                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Invite New Client And Assign
                </h3>
                <form
                  onSubmit={handleInviteAndAssign}
                  className="mt-3 space-y-3"
                >
                  <input
                    type="text"
                    required
                    value={inviteForm.name}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Client name"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="client@company.com"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={invitingClient}
                    className="rounded-lg border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {invitingClient
                      ? "Inviting and assigning..."
                      : "Invite And Assign"}
                  </button>
                </form>
              </div>
            )}

            <div className="rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-[#0F1419]/80">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                GitHub Repositories
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Link repos at the project level so tickets can attach branches
                and pull requests.
              </p>
              <div className="mt-4 space-y-3">
                {project.githubRepos && project.githubRepos.length > 0 ? (
                  project.githubRepos.map((repo) => (
                    <a
                      key={repo.id}
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 transition hover:border-brand-500 hover:bg-brand-50/50 dark:border-gray-800 dark:bg-white/5 dark:text-white"
                    >
                      <div className="font-semibold">
                        {repo.owner}/{repo.name}
                      </div>
                      <div className="text-gray-500 text-xs">View repo</div>
                    </a>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-white/5">
                    No GitHub repositories linked yet.
                  </div>
                )}
              </div>
              {canManageProjectRepos ? (
                <button
                  type="button"
                  onClick={openRepoPicker}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Link Project Repo
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {canManageProjectRepos && showRepoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-[#0F1419]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Link Project Repository
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Pick a repository from connected GitHub account access.
            </p>

            <div className="mt-4 space-y-3">
              {loadingGithubRepos ? (
                <div className="space-y-2">
                  <SkeletonLine className="h-9 w-full" />
                  <SkeletonLine className="h-9 w-5/6" />
                </div>
              ) : (
                <SelectMenu
                  value={selectedGithubRepoUrl}
                  onChange={setSelectedGithubRepoUrl}
                  options={[
                    { value: "", label: "No project repo" },
                    ...availableGithubRepos.map((repo) => ({
                      value: repo.url,
                      label: repo.fullName,
                    })),
                  ]}
                  className="w-full"
                  triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              )}

              {githubReposError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
                  {githubReposError}
                </div>
              )}

              {!loadingGithubRepos &&
                availableGithubRepos.length === 0 &&
                !githubReposError && (
                  <p className="text-sm text-gray-500">
                    No repositories found for the connected GitHub access.
                  </p>
                )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Link
                  href="/settings"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  Manage GitHub connections
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRepoPicker(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveProjectRepos();
                    }}
                    disabled={savingGithubRepos || loadingGithubRepos}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingGithubRepos ? "Saving..." : "Save Repo"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete project"
        message={`Delete ${project.name}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={deleting}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          void deleteProject();
        }}
      />
    </DashboardLayout>
  );
}
