"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { SelectMenu } from "@/components/SelectMenu";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { onRealtimeChange } from "@/lib/realtime-events";
import { FolderKanban } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  health: string;
  progress: number;
  team: { id: string; name: string };
  portfolio: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  _count: { milestones: number; tickets: number };
};

type ClientOption = {
  id: string;
  name: string;
  email: string;
  invitationStatus?: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    teams,
    activeTeamId,
    setActiveTeamId,
    loading: teamLoading,
  } = useTeam();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    teamId: "",
    clientId: "",
  });

  const loadClients = useCallback(async () => {
    if (!user || user.role !== "SUPER_ADMIN") return;

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
  }, [user]);

  const openCreateModal = useCallback(() => {
    const defaultTeamId = activeTeamId || teams[0]?.id || "";
    setCreateForm({
      name: "",
      description: "",
      teamId: defaultTeamId,
      clientId: "",
    });
    setShowCreateModal(true);
    void loadClients();
  }, [activeTeamId, teams, loadClients]);

  const load = useCallback(async () => {
    if (!user || user.role === "CLIENT") return;
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user.role === "USER") {
        if (!activeTeamId) {
          setProjects([]);
          setLoading(false);
          return;
        }
        params.set("teamId", activeTeamId);
      } else if (user.role === "SUPER_ADMIN" && activeTeamId) {
        params.set("teamId", activeTeamId);
      }
      const res = await fetch(`/api/projects?${params}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to load projects");
      }
      setProjects(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      if (projects.length === 0) {
        setProjects([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user, activeTeamId, projects.length]);

  const handleCreateProject = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!createForm.name.trim() || !createForm.teamId) return;

      setCreatingProject(true);
      setError("");
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createForm.name.trim(),
            description: createForm.description.trim() || undefined,
            teamDescription: createForm.description.trim() || undefined,
            teamId: createForm.teamId,
            clientId: createForm.clientId || null,
          }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || "Failed to create project");
        }

        setShowCreateModal(false);
        await load();

        if (body?.id) {
          router.push(`/projects/${body.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create project");
      } finally {
        setCreatingProject(false);
      }
    },
    [createForm, load, router],
  );

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT") return;
    void load();
  }, [authLoading, user, load]);

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (
        detail.table !== "Project" &&
        detail.table !== "Client" &&
        detail.table !== "Team" &&
        detail.table !== "GithubRepo" &&
        detail.table !== "Milestone" &&
        detail.table !== "Ticket"
      ) {
        return;
      }
      void load();
    });

    return unsubscribe;
  }, [authLoading, user, load]);

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
        <p className="text-gray-600">
          Use the client portal for your projects.
        </p>
      </DashboardLayout>
    );
  }

  const activeTeamName = teams.find((team) => team.id === activeTeamId)?.name;
  const isInitialLoading = loading && projects.length === 0;

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Projects
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Track projects for your team
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "SUPER_ADMIN" && (
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-lg border border-indigo-300 bg-brand-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700"
              >
                New project
              </button>
            )}
            {user.role === "SUPER_ADMIN" && (
              <Link
                href="/executive"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
              >
                Executive charts
              </Link>
            )}
            {user.role === "SUPER_ADMIN" ? (
              <SelectMenu
                value={activeTeamId}
                onChange={setActiveTeamId}
                disabled={teamLoading || teams.length === 0}
                options={teams.map((team) => ({
                  value: team.id,
                  label: team.name,
                }))}
                placeholder="Team"
                className="min-w-[180px]"
                triggerClassName="bg-gray-100/80 dark:bg-slate-800/80"
              />
            ) : (
              <div className="min-w-[180px] rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-[#0F1419] dark:text-gray-200">
                {teamLoading ? "Loading team…" : activeTeamName || "My team"}
              </div>
            )}
          </div>
        </div>

        {user.role === "USER" && teams.length === 0 && !teamLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            You need to be on a team to load projects.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {isInitialLoading ? (
          <div
            className="grid gap-4 md:grid-cols-2"
            aria-label="Loading projects"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`project-skeleton-${index}`}
                className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1A1F2E]"
              >
                <div className="flex items-start justify-between gap-2">
                  <SkeletonLine className="h-5 w-2/5" />
                  <SkeletonLine className="h-6 w-16 rounded-full" />
                </div>
                <SkeletonLine className="mt-3 w-3/5" />
                <SkeletonLine className="mt-5 h-2 w-full rounded-full" />
                <SkeletonLine className="mt-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {loading && projects.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white/90 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-[#0F1419]/80">
                Refreshing projects…
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/projects/${p.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/projects/${p.id}`);
                    }
                  }}
                  className="w-full cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-indigo-300 dark:border-gray-800 dark:bg-[#1A1F2E]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-gray-900 dark:text-white">
                      {p.name}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.health === "GREEN"
                          ? "bg-green-100 text-green-800"
                          : p.health === "AMBER"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {p.health}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {p.team.name}
                    {p.client ? ` · ${p.client.name}` : ""}
                  </p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {p.progress}% · {p._count.tickets} tickets ·{" "}
                    {p._count.milestones} milestones
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {!loading && projects.length === 0 && !error && (
          <EmptyState
            title="No projects found"
            description="Try a different team filter or create a project to get started."
            icon={<FolderKanban className="h-6 w-6" aria-hidden="true" />}
            action={
              user.role === "SUPER_ADMIN" ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="btn-primary"
                >
                  Create project
                </button>
              ) : null
            }
          />
        )}

        {showCreateModal && user.role === "SUPER_ADMIN" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <div className="relative w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/95">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Create Project
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Client is optional. You can assign one now or later.
              </p>

              <form onSubmit={handleCreateProject} className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    placeholder="e.g. Q3 Onboarding Revamp"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Team *
                  </label>
                  <SelectMenu
                    value={createForm.teamId}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        teamId: value,
                      }))
                    }
                    options={[
                      { value: "", label: "Select team" },
                      ...teams.map((team) => ({
                        value: team.id,
                        label: team.name,
                      })),
                    ]}
                    className="w-full"
                    triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client (Optional)
                  </label>
                  <SelectMenu
                    value={createForm.clientId}
                    onChange={(value) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        clientId: value,
                      }))
                    }
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
                  {loadingClients && (
                    <p className="mt-1 text-xs text-gray-500">
                      Loading clients…
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    placeholder="Project scope and notes"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      creatingProject ||
                      !createForm.name.trim() ||
                      !createForm.teamId
                    }
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingProject ? "Creating..." : "Create Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
