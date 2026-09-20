"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { SelectMenu } from "@/components/SelectMenu";
import {
  Plus,
  Mail,
  User,
  X,
  CheckCircle,
  FolderKanban,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonLine, SkeletonTable } from "@/components/ui/Skeleton";
import { onRealtimeChange } from "@/lib/realtime-events";

interface Client {
  id: string;
  name: string;
  email: string | null;
  isInvited: boolean;
  invitationStatus: "NOT_INVITED" | "INVITED_NOT_CONFIRMED" | "ACTIVATED";
  hasSignedIn?: boolean;
  projectCount: number;
  createdAt: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
  health: string;
  progress: number;
  updatedAt: string;
}

interface GithubRepoOption {
  owner: string;
  name: string;
  url: string;
  fullName: string;
}

type ConfirmAction = "delete" | "resendInvite" | "resetPassword";

export default function ClientsPage() {
  const { user } = useAuth();
  const { teams, activeTeamId } = useTeam();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>("delete");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [confirmClient, setConfirmClient] = useState<Client | null>(null);
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([]);
  const [loadingClientProjects, setLoadingClientProjects] = useState(false);
  const [editClient, setEditClient] = useState({
    id: "",
    name: "",
    email: "",
    isInvited: false,
  });
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    isInvited: false,
  });
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    teamId: "",
    progress: 0,
    health: "GREEN",
    status: "PLANNING",
  });
  const [availableGithubRepos, setAvailableGithubRepos] = useState<
    GithubRepoOption[]
  >([]);
  const [selectedGithubRepos, setSelectedGithubRepos] = useState<string[]>([]);
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState("");

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table !== "Client" && detail.table !== "Project") return;
      void fetchClients();
    });

    return unsubscribe;
  }, []);

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");

      if (!response.ok) {
        throw new Error("Failed to fetch clients");
      }

      const data = await response.json();
      setClients(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (user?.role !== "SUPER_ADMIN") {
      setError("Only super admins can add clients.");
      return;
    }

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newClient),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create client");
      }

      setNewClient({ name: "", email: "", isInvited: false });
      setShowCreateModal(false);
      fetchClients();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to create client",
      );
    }
  };

  const openCreateProjectForClient = (client: Client) => {
    setSelectedClient(client);
    setNewProject({
      name: "",
      description: "",
      teamId: activeTeamId || teams[0]?.id || "",
      progress: 0,
      health: "GREEN",
      status: "PLANNING",
    });
    setSelectedGithubRepos([]);
    setGithubReposError("");
    setShowProjectModal(true);
    void fetchAvailableGithubRepos();
  };

  const openCreateProjectWithoutClient = () => {
    setSelectedClient(null);
    setNewProject({
      name: "",
      description: "",
      teamId: activeTeamId || teams[0]?.id || "",
      progress: 0,
      health: "GREEN",
      status: "PLANNING",
    });
    setSelectedGithubRepos([]);
    setGithubReposError("");
    setShowProjectModal(true);
    void fetchAvailableGithubRepos();
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

          if (!owner || !name || !url) {
            return null;
          }

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

  const openEditClient = (client: Client) => {
    setEditClient({
      id: client.id,
      name: client.name,
      email: client.email || "",
      isInvited: client.isInvited,
    });
    setShowEditModal(true);
  };

  const openConfirmAction = (client: Client, action: ConfirmAction) => {
    setConfirmClient(client);
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (user?.role !== "SUPER_ADMIN") {
      setError("Only super admins can update clients.");
      return;
    }

    try {
      const response = await fetch(`/api/clients/${editClient.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editClient.name,
          email: editClient.email,
          isInvited: editClient.isInvited,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update client");
      }

      setShowEditModal(false);
      await fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update client");
    }
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setConfirmClient(null);
  };

  const handleDeleteClient = async (client: Client) => {
    if (user?.role !== "SUPER_ADMIN") {
      setError("Only super admins can delete clients.");
      return;
    }

    setConfirmLoading(true);

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      if (response.status === 404) {
        await fetchClients();
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete client");
      }

      void fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client");
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleResendInvite = async (client: Client) => {
    if (user?.role !== "SUPER_ADMIN") {
      setError("Only super admins can resend client invitations.");
      return;
    }

    setConfirmLoading(true);
    try {
      const response = await fetch(`/api/clients/${client.id}/resend-invite`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to resend invitation");
      }

      void fetchClients();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resend invitation",
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleResetPassword = async (client: Client) => {
    if (user?.role !== "SUPER_ADMIN") {
      setError("Only super admins can trigger client password resets.");
      return;
    }

    setConfirmLoading(true);
    try {
      const response = await fetch(`/api/clients/${client.id}/reset-password`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send reset password email");
      }
      void fetchClients();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send reset password email",
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmClient) return;

    const client = confirmClient;
    const action = confirmAction;

    closeConfirmModal();

    if (action === "delete") {
      void handleDeleteClient(client);
      return;
    }

    if (action === "resendInvite") {
      void handleResendInvite(client);
      return;
    }

    void handleResetPassword(client);
  };

  const handleViewClientProjects = async (client: Client) => {
    setSelectedClient(client);
    setShowProjectsModal(true);
    setLoadingClientProjects(true);
    setClientProjects([]);
    try {
      const response = await fetch(`/api/clients/${client.id}/projects`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load client projects");
      }
      const projects = (await response.json()) as ClientProject[];
      setClientProjects(Array.isArray(projects) ? projects : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load client projects",
      );
      setShowProjectsModal(false);
    } finally {
      setLoadingClientProjects(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProject.teamId) {
      setError("Please select a team before creating a project");
      return;
    }

    try {
      const githubRepos = selectedGithubRepos
        .map((repoUrl) =>
          availableGithubRepos.find((repo) => repo.url === repoUrl),
        )
        .filter((repo): repo is GithubRepoOption => Boolean(repo))
        .map((repo) => ({
          owner: repo.owner,
          name: repo.name,
          url: repo.url,
        }));

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProject.name,
          description: newProject.description,
          teamDescription: newProject.description,
          githubRepos,
          teamId: newProject.teamId,
          clientId: selectedClient?.id ?? null,
          progress: newProject.progress,
          health: newProject.health,
          status: newProject.status,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create project");
      }

      setShowProjectModal(false);
      setSelectedClient(null);
      setNewProject({
        name: "",
        description: "",
        teamId: "",
        progress: 0,
        health: "GREEN",
        status: "PLANNING",
      });
      setSelectedGithubRepos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  const canManageClients = user?.role === "SUPER_ADMIN";
  const canViewClients = user?.role === "USER" || user?.role === "SUPER_ADMIN";
  const invitedCount = clients.filter((client) => client.isInvited).length;
  const activatedCount = clients.filter(
    (client) => client.invitationStatus === "ACTIVATED",
  ).length;
  const totalClientProjects = clients.reduce(
    (sum, client) => sum + (client.projectCount ?? 0),
    0,
  );

  if (!user || !canViewClients) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Access denied
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
            Only internal staff can access this page
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Clients
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your client relationships
            </p>
          </div>

          {canManageClients ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateProjectWithoutClient}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
              >
                <FolderKanban className="h-4 w-4" />
                <span>Add Project (No Client)</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add Client</span>
              </button>
            </div>
          ) : null}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4" aria-label="Loading clients">
            <div className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`client-metric-skeleton-${index}`}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-[#1A1F2E]"
                >
                  <SkeletonLine className="w-20" />
                  <SkeletonLine className="mt-3 h-7 w-12" />
                  <SkeletonLine className="mt-2 w-24" />
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonTable rows={5} cols={5} />
            </div>
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description="Add your first client to start tracking their work."
            icon={<User className="h-6 w-6" aria-hidden="true" />}
            action={
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={!canManageClients}
                className="btn-primary disabled:opacity-50"
              >
                Add client
              </button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard
                value={clients.length}
                label="Total clients"
                sublabel="All accounts"
                color="blue"
              />
              <MetricCard
                value={invitedCount}
                label="Invited"
                sublabel="Invite sent"
                color="green"
              />
              <MetricCard
                value={activatedCount}
                label="Activated"
                sublabel="Portal access"
                color="indigo"
              />
              <MetricCard
                value={totalClientProjects}
                label="Client projects"
                sublabel="Across all clients"
                color="orange"
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-[#1A1F2E]">
              <div className="overflow-x-auto">
                <table className="min-w-[1050px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur dark:bg-gray-900/95">
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Client
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Contact
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Created
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr
                        key={client.id}
                        className="border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/30"
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20 text-sm font-semibold text-sky-700 dark:text-sky-300">
                              {client.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {client.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                ID: {client.id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                            <Mail className="mt-0.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <span className="break-all">{client.email}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 flex-nowrap">
                            {client.invitationStatus === "ACTIVATED" ? (
                              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : null}
                            {!client.email ? (
                              <span className="rounded-full border border-gray-300 bg-gray-100 px-3.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-500/10 dark:text-gray-300">
                                No Email
                              </span>
                            ) : client.invitationStatus === "ACTIVATED" ? (
                              <>
                                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  Activated
                                </span>
                                {client.hasSignedIn ? (
                                  <span className="rounded-full border border-sky-300 bg-sky-100 px-3 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300">
                                    Signed in
                                  </span>
                                ) : null}
                              </>
                            ) : client.invitationStatus === "INVITED_NOT_CONFIRMED" ? (
                              <>
                                <span className="rounded-full border border-amber-300 bg-amber-100 px-3.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                                  Invited - Pending
                                </span>
                                {canManageClients ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openConfirmAction(client, "resendInvite")
                                    }
                                    className="inline-flex h-6 items-center gap-1 rounded-md bg-amber-50 px-2 text-[10px] font-medium text-amber-700 transition hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                                    title="Resend invitation email"
                                  >
                                    <Mail className="h-3 w-3" />
                                    Resend
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <span className="rounded-full border border-gray-300 bg-gray-100 px-3.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-500/10 dark:text-gray-300">
                                Not Invited
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top text-gray-600 dark:text-gray-400">
                          {new Date(client.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewClientProjects(client)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                              title="View projects"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Projects
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreateProjectForClient(client)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                              title="Add project"
                            >
                              <FolderKanban className="h-3.5 w-3.5" />
                              Add project
                            </button>
                            {canManageClients ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditClient(client)}
                                  className="inline-flex h-8 items-center rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                                  title="Edit client"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirmAction(client, "resendInvite")
                                  }
                                  className="inline-flex h-8 items-center rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                                  title="Resend invite"
                                >
                                  Resend invite
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirmAction(client, "resetPassword")
                                  }
                                  className="inline-flex h-8 items-center rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                                  title="Send reset password"
                                >
                                  Reset password
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirmAction(client, "delete")
                                  }
                                  className="inline-flex h-8 items-center rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                                  title="Delete client"
                                >
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />

            <div className="relative w-full max-w-md bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-gray-200/80 dark:border-gray-800/50 shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800/50">
                <div className="flex items-center space-x-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      Add New Client
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Create a new client record
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors p-3 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg hover:scale-110 border border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600/50"
                  title="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateClient} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newClient.name}
                    onChange={(e) =>
                      setNewClient({ ...newClient, name: e.target.value })
                    }
                    placeholder="Enter client name..."
                    className="w-full input-modern"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) =>
                      setNewClient({ ...newClient, email: e.target.value })
                    }
                    placeholder="Enter client email (optional)..."
                    className="w-full input-modern"
                  />
                </div>

                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700/50">
                  <input
                    id="isInvited"
                    type="checkbox"
                    checked={newClient.isInvited}
                    onChange={(e) =>
                      setNewClient({
                        ...newClient,
                        isInvited: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-indigo-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500 focus:ring-2"
                  />
                  <label
                    htmlFor="isInvited"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Send invitation email (allows client to log in)
                  </label>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-800/50">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newClient.name.trim()}
                    className={cn(
                      "btn-primary",
                      !newClient.name.trim() &&
                        "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-center space-x-2">
                      <Plus className="w-4 h-4" />
                      <span>Create Client</span>
                    </div>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showConfirmModal && confirmClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => closeConfirmModal()}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/95">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {confirmAction === "delete"
                  ? `Delete ${confirmClient.name}?`
                  : confirmAction === "resendInvite"
                    ? `Resend invite to ${confirmClient.name}?`
                    : `Send password reset to ${confirmClient.name}?`}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {confirmAction === "delete"
                  ? "This action cannot be undone. Client records with linked projects or tickets cannot be deleted."
                  : confirmAction === "resendInvite"
                    ? "A new invitation email will be sent to this client."
                    : "A password reset email will be sent to this client."}
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => closeConfirmModal()}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white transition",
                    confirmAction === "delete"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-brand-600 hover:bg-indigo-700",
                    confirmLoading && "cursor-wait opacity-70",
                  )}
                >
                  {confirmLoading
                    ? "Working..."
                    : confirmAction === "delete"
                      ? "Delete Client"
                      : confirmAction === "resendInvite"
                        ? "Resend Invite"
                        : "Send Reset Email"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setShowProjectModal(false);
                setSelectedClient(null);
              }}
            />

            <div className="relative w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/95">
              <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800/50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedClient
                      ? `Add Project for ${selectedClient.name}`
                      : "Add Project"}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedClient
                      ? "Link a new project directly to this client"
                      : "Create a project now and assign a client later"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowProjectModal(false);
                    setSelectedClient(null);
                  }}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-5 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProject.name}
                    onChange={(e) =>
                      setNewProject({ ...newProject, name: e.target.value })
                    }
                    placeholder="Enter project name..."
                    className="w-full input-modern"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Team *
                  </label>
                  <SelectMenu
                    value={newProject.teamId}
                    onChange={(value) =>
                      setNewProject({ ...newProject, teamId: value })
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
                    Team Description
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Describe the team context and project scope..."
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Linked GitHub Repositories
                    </label>
                    <button
                      type="button"
                      onClick={() => void fetchAvailableGithubRepos()}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                      Refresh
                    </button>
                  </div>

                  {loadingGithubRepos ? (
                    <div className="space-y-2">
                      <SkeletonLine className="h-9 w-full" />
                      <SkeletonLine className="h-9 w-5/6" />
                    </div>
                  ) : githubReposError ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-900/20">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Couldn't load GitHub repositories
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Check your GitHub connection and organization access, then try again.
                      </p>
                    </div>
                  ) : availableGithubRepos.length === 0 ? (
                    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                      No repositories available for your connected GitHub
                      account.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                      {availableGithubRepos.map((repo) => {
                        const checked = selectedGithubRepos.includes(repo.url);
                        return (
                          <label
                            key={repo.url}
                            className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGithubRepos((prev) => [
                                    ...prev,
                                    repo.url,
                                  ]);
                                  return;
                                }
                                setSelectedGithubRepos((prev) =>
                                  prev.filter((url) => url !== repo.url),
                                );
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                            />
                            <span>{repo.fullName}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-3 border-t border-gray-200 pt-4 dark:border-gray-800/50">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectModal(false);
                      setSelectedClient(null);
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newProject.name.trim() || !newProject.teamId}
                    className={cn(
                      "btn-primary",
                      (!newProject.name.trim() || !newProject.teamId) &&
                        "cursor-not-allowed opacity-50",
                    )}
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowEditModal(false)}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/95">
              <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800/50">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Edit Client
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleUpdateClient} className="space-y-5 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editClient.name}
                    onChange={(e) =>
                      setEditClient({ ...editClient, name: e.target.value })
                    }
                    className="w-full input-modern"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={editClient.email}
                    onChange={(e) =>
                      setEditClient({ ...editClient, email: e.target.value })
                    }
                    className="w-full input-modern"
                  />
                </div>
                <div className="flex items-center space-x-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700/50 dark:bg-gray-800/30">
                  <input
                    id="editIsInvited"
                    type="checkbox"
                    checked={editClient.isInvited}
                    onChange={(e) =>
                      setEditClient({
                        ...editClient,
                        isInvited: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="editIsInvited"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Mark as invited
                  </label>
                </div>
                <div className="flex items-center justify-end space-x-3 border-t border-gray-200 pt-4 dark:border-gray-800/50">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showProjectsModal && selectedClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowProjectsModal(false)}
            />
            <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/95">
              <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-800/50">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedClient.name} Projects
                </h2>
                <button
                  onClick={() => setShowProjectsModal(false)}
                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-6">
                {loadingClientProjects ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Loading projects…
                  </p>
                ) : clientProjects.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No projects for this client yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {clientProjects.map((project) => (
                      <div
                        key={project.id}
                        className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {project.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {project.status} · {project.health} ·{" "}
                          {project.progress}%
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
