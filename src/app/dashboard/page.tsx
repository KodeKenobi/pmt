"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardHeader from "@/components/DashboardHeader";
import { OverviewMetricStrip } from "@/components/OverviewMetricStrip";
import { MetricCard } from "@/components/MetricCard";
import { SelectMenu } from "@/components/SelectMenu";
import CreateTicketModal from "@/components/CreateTicketModal";
import type {
  CreateTicketPayload,
  CreateTicketResultDetail,
  CreateTicketSubmitDetail,
} from "@/components/CreateTicketModal";
import KanbanBoard from "@/components/KanbanBoard";
import { Pagination } from "@/components/Pagination";
import {
  SkeletonDropdown,
  SkeletonKanbanColumn,
  SkeletonTable,
} from "@/components/ui/Skeleton";
import {
  Plus,
  Search,
  Eye,
  Edit,
  Clock as ClockIcon,
  Zap,
  AlertCircle,
  CheckCircle2,
  ListTodo,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { onRealtimeChange } from "@/lib/realtime-events";
import { cachedGetJson } from "@/store/cacheClient";

interface Ticket {
  id: string;
  selectorId?: number | null;
  title: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  client?: {
    id: string;
    name: string;
    email: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
  project?: {
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
      email: string;
    } | null;
  } | null;
  sprint?: {
    id: string;
    name: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
}

const statusConfig = {
  BACKLOG: {
    label: "Backlog",
    color:
      "bg-gray-500/20 dark:bg-white text-gray-400 border-gray-500/30 dark:text-gray-900 dark:border-gray-500/30",
    icon: ClockIcon,
    bgColor: "bg-gray-500/10 dark:bg-white",
  },
  TODO: {
    label: "To Do",
    color:
      "bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30",
    icon: ListTodo,
    bgColor: "bg-slate-500/10",
  },
  REFINE: {
    label: "Refine",
    color:
      "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30",
    icon: Filter,
    bgColor: "bg-indigo-500/10",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Zap,
    bgColor: "bg-blue-500/10",
  },
  IN_REVIEW: {
    label: "In Review",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    icon: Eye,
    bgColor: "bg-cyan-500/10",
  },
  QA: {
    label: "QA",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: AlertCircle,
    bgColor: "bg-orange-500/10",
  },
  REVISIONS: {
    label: "Revisions",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: AlertCircle,
    bgColor: "bg-yellow-500/10",
  },
  COMPLETE: {
    label: "Complete",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: CheckCircle2,
    bgColor: "bg-green-500/10",
  },
  CLIENT_REVIEW: {
    label: "Client Review",
    color:
      "bg-brand-600/15 text-brand-700 border border-brand-500/25 dark:text-brand-300 dark:border-brand-500/30",
    icon: Eye,
    bgColor: "bg-brand-600/10",
  },
};

const statusFilterOptions = [
  { value: "", label: "All statuses" },
  ...Object.entries(statusConfig).map(([key, config]) => ({
    value: key,
    label: config.label,
  })),
];

const rowStatusOptions = Object.entries(statusConfig).map(([key, config]) => ({
  value: key,
  label: config.label,
}));

const priorityFilterOptions = [
  { value: "", label: "All priorities" },
  { value: "NONE", label: "None" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    teams,
    activeTeamId,
    setActiveTeamId,
    isAllTeams,
    setAllTeamsMode,
    loading: teamListLoading,
  } = useTeam();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [sprintFilter, setSprintFilter] = useState<string>("__all__");
  const [sprints, setSprints] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedView, setSelectedView] = useState<"kanban" | "list">("kanban");
  const [currentPage, setCurrentPage] = useState(1);
  const [openPrCount, setOpenPrCount] = useState(0);
  const pageSize = 9;
  const sprintFilterOptions = [
    { value: "__all__", label: "All tickets" },
    { value: "__active__", label: "Active sprint" },
    { value: "backlog", label: "Backlog only" },
    ...sprints.map((sprint) => ({
      value: sprint.id,
      label: `${sprint.name} (${sprint.status})`,
    })),
  ];

  const fetchGithubOverview = useCallback(
    async (force = false) => {
      if (!user || user.role !== "SUPER_ADMIN") return;

      try {
        const params = new URLSearchParams();
        if (!isAllTeams && activeTeamId) {
          params.set("teamId", activeTeamId);
        }

        const query = params.toString();
        const payload = await cachedGetJson<{
          githubAnalytics?: { openPullRequests?: number };
        }>({
          key: `dashboard_executive_overview:${query || "all"}`,
          url: `/api/analytics/executive${query ? `?${query}` : ""}`,
          staleMs: 45_000,
          force,
        });

        setOpenPrCount(payload.githubAnalytics?.openPullRequests ?? 0);
      } catch {
        setOpenPrCount(0);
      }
    },
    [user, isAllTeams, activeTeamId],
  );

  const fetchSprints = useCallback(
    async (force = false) => {
      if (!activeTeamId) {
        setSprints([]);
        return;
      }

      try {
        setLoadingSprints(true);
        const data = await cachedGetJson<
          Array<{ id: string; name: string; status: string }>
        >({
          key: `dashboard_sprints:${activeTeamId}`,
          url: `/api/sprints?teamId=${activeTeamId}`,
          staleMs: 60_000,
          force,
        });
        setSprints(Array.isArray(data) ? data : []);
      } catch {
        setSprints([]);
      } finally {
        setLoadingSprints(false);
      }
    },
    [activeTeamId],
  );

  useEffect(() => {
    void fetchSprints();
  }, [fetchSprints]);

  const fetchTickets = useCallback(
    async (force = false) => {
      if (!user) return;

      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams();
        if (statusFilter) params.append("status", statusFilter);
        if (priorityFilter) params.append("priority", priorityFilter);

        // Handle sprint filtering
        if (sprintFilter === "__active__") {
          const activeSprint = sprints.find((s) => s.status === "ACTIVE");
          if (activeSprint) {
            params.append("sprintId", activeSprint.id);
          } else {
            params.append("sprintId", "backlog");
          }
        } else if (sprintFilter && sprintFilter !== "__all__") {
          params.append("sprintId", sprintFilter);
        }

        if (user.role === "USER") {
          if (!activeTeamId) {
            setTickets([]);
            setLoading(false);
            return;
          }
          params.append("teamId", activeTeamId);
        } else if (user.role === "SUPER_ADMIN") {
          if (!isAllTeams && activeTeamId) {
            params.append("teamId", activeTeamId);
          }
        }

        const query = params.toString();
        const data = await cachedGetJson<Ticket[]>({
          key: `dashboard_tickets:${query || "all"}`,
          url: `/api/tickets?${query}`,
          staleMs: 30_000,
          force,
        });
        setTickets(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load tickets");
        setTickets([]);
      } finally {
        setLoading(false);
      }
    },
    [
      user,
      statusFilter,
      priorityFilter,
      activeTeamId,
      isAllTeams,
      sprintFilter,
      sprints,
    ],
  );

  useEffect(() => {
    if (!user) return;
    void fetchTickets();
  }, [user, fetchTickets]);

  useEffect(() => {
    if (!user || user.role !== "SUPER_ADMIN") return;
    void fetchGithubOverview();
  }, [user, fetchGithubOverview]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (
        detail.table !== "Ticket" &&
        detail.table !== "Project" &&
        detail.table !== "Client" &&
        detail.table !== "GithubPullRequest" &&
        detail.table !== "GithubRepo" &&
        detail.table !== "GithubBranch"
      ) {
        return;
      }
      void fetchTickets(true);
      if (user.role === "SUPER_ADMIN") {
        void fetchGithubOverview(true);
      }
    });

    return unsubscribe;
  }, [user, fetchTickets, fetchGithubOverview]);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    let previousTicket: Ticket | null = null;
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        previousTicket = ticket;
        return {
          ...ticket,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    try {
      setError("");
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to update ticket");
      }
    } catch (err) {
      if (previousTicket) {
        setTickets((prev) =>
          prev.map((ticket) =>
            ticket.id === ticketId ? previousTicket! : ticket,
          ),
        );
      }
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const handleCreateTicket = useCallback(
    async (ticketData: CreateTicketPayload) => {
      try {
        const response = await fetch("/api/tickets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ticketData),
        });

        if (!response.ok) throw new Error("Failed to create ticket");

        const created = (await response.json()) as Ticket & { id?: string };
        if (created?.id) {
          setTickets((prev) => {
            const exists = prev.some((ticket) => ticket.id === created.id);
            if (exists) return prev;
            return [created, ...prev];
          });
        }
        return created;
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    const onModalSubmit = (event: Event) => {
      const customEvent = event as CustomEvent<CreateTicketSubmitDetail>;
      void (async () => {
        const created = await handleCreateTicket(customEvent.detail.payload);
        const ok = Boolean(created?.id);

        window.dispatchEvent(
          new CustomEvent<CreateTicketResultDetail>(
            "create-ticket-modal-result",
            {
              detail: {
                ok,
                message: ok ? undefined : "Failed to create ticket.",
              },
            },
          ),
        );

        if (!ok) return;

        setShowCreateModal(false);
        if (customEvent.detail.openAfterCreate && created?.id) {
          router.push(`/tickets/${created.id}`);
        }
      })();
    };

    const onModalClose = () => {
      setShowCreateModal(false);
    };

    window.addEventListener(
      "create-ticket-modal-submit",
      onModalSubmit as EventListener,
    );
    window.addEventListener("create-ticket-modal-close", onModalClose);

    return () => {
      window.removeEventListener(
        "create-ticket-modal-submit",
        onModalSubmit as EventListener,
      );
      window.removeEventListener("create-ticket-modal-close", onModalClose);
    };
  }, [handleCreateTicket, router]);

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const pagedTickets = filteredTickets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    statusFilter,
    priorityFilter,
    sprintFilter,
    activeTeamId,
    isAllTeams,
  ]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/login");
    }
  }, [authLoading, router, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--app-canvas)] p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] animate-pulse"
              />
            ))}
          </div>
          <div className="flex gap-6 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonKanbanColumn key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (user.role === "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <div className="w-full space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-brand-600 dark:text-brand-400">
                Super Admin Overview
              </h1>
              <p className="text-brand-600 dark:text-brand-400">
                Full project oversight and team management.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/executive"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                Executive analytics
              </Link>
              <Link
                href="/teams"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1c1c24] dark:text-white dark:hover:bg-white/5"
              >
                Manage teams
              </Link>
              <Link
                href="/projects"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1c1c24] dark:text-white dark:hover:bg-white/5"
              >
                Projects
              </Link>
            </div>
          </div>
          {/* Add graphs and overview here */}
          <OverviewMetricStrip
            metrics={[
              {
                label: "total tickets",
                value: tickets.length,
                sublabel: "All statuses",
              },
              {
                label: "in progress",
                value: tickets.filter((t) => t.status === "IN_PROGRESS").length,
                sublabel: "Active work",
              },
              {
                label: "completed",
                value: tickets.filter((t) => t.status === "COMPLETE").length,
                sublabel: "Done",
              },
              {
                label: "teams",
                value: teams.length,
                sublabel: "Workspaces",
              },
              {
                label: "open PRs",
                value: openPrCount,
                sublabel: "GitHub",
              },
            ]}
          />
          {/* Team selector for super admin */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-600">
              Team scope
            </span>
            <SelectMenu
              value={isAllTeams ? "__all__" : activeTeamId}
              onChange={(v) => {
                if (v === "__all__") setAllTeamsMode(true);
                else {
                  setAllTeamsMode(false);
                  setActiveTeamId(v);
                }
              }}
              disabled={teamListLoading}
              options={[
                { value: "__all__", label: "All teams" },
                ...teams.map((team) => ({
                  value: team.id,
                  label: team.name,
                })),
              ]}
              className="min-w-[220px]"
            />
            <SelectMenu
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={priorityFilterOptions}
              placeholder="Priority"
              className="min-w-[160px]"
            />
            {loadingSprints ? (
              <SkeletonDropdown className="min-w-[180px]" />
            ) : (
              <SelectMenu
                value={sprintFilter}
                onChange={setSprintFilter}
                disabled={loadingSprints}
                options={sprintFilterOptions}
                placeholder="Sprint"
                className="min-w-[180px]"
              />
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create ticket</span>
            </button>
          </div>
          {/* Kanban for overview */}
          {loading ? (
            <div className="flex gap-6 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonKanbanColumn key={i} />
              ))}
            </div>
          ) : (
            <KanbanBoard
              tickets={filteredTickets}
              onStatusChange={handleStatusChange}
              onTicketClick={(ticket) => {
                router.push(`/tickets/${ticket.id}`);
              }}
              userRole={user.role}
              onCreateTicket={() => setShowCreateModal(true)}
              activeTeamId={activeTeamId}
              onTicketSprintChange={() => {
                void fetchTickets();
              }}
            />
          )}

          <CreateTicketModal
            isOpen={showCreateModal}
            defaultTeamId={isAllTeams ? "" : activeTeamId}
            teams={teams}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <DashboardHeader
          user={user}
          teams={teams}
          teamListLoading={teamListLoading}
          selectedView={selectedView}
          setSelectedView={setSelectedView}
          setShowCreateModal={setShowCreateModal}
        />

        {/* Metric strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            value={tickets.length}
            label="Total tickets"
            sublabel="All statuses"
            color="blue"
          />
          <MetricCard
            value={tickets.filter((t) => t.status === "IN_PROGRESS").length}
            label="In progress"
            sublabel="Active work"
            color="orange"
          />
          <MetricCard
            value={tickets.filter((t) => t.status === "COMPLETE").length}
            label="Completed"
            sublabel="Done"
            color="green"
          />
          <MetricCard
            value={tickets.filter((t) => t.status === "BACKLOG").length}
            label="Backlog"
            sublabel="Not started"
            color="purple"
          />
        </div>

        {selectedView === "kanban" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1c1c24]">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-brand-500 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search tickets or clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-100 bg-white py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 transition focus:border-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-100/60 dark:border-gray-100 dark:bg-[#1c1c24] dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {user.role === "SUPER_ADMIN" ? (
                    <SelectMenu
                      value={activeTeamId}
                      onChange={setActiveTeamId}
                      disabled={teamListLoading || teams.length === 0}
                      options={teams.map((team) => ({
                        value: team.id,
                        label: team.name,
                      }))}
                      placeholder="Team"
                      className="min-w-[180px]"
                      triggerClassName="bg-white border border-gray-100 dark:bg-[#1c1c24] dark:border-gray-100"
                    />
                  ) : null}

                  <SelectMenu
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statusFilterOptions}
                    placeholder="Status"
                    className="min-w-[200px]"
                    triggerClassName="bg-white border border-gray-100 dark:bg-[#1c1c24] dark:border-gray-100"
                  />

                  <SelectMenu
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    options={priorityFilterOptions}
                    placeholder="Priority"
                    className="min-w-[180px]"
                    triggerClassName="bg-white border border-gray-100 dark:bg-[#1c1c24] dark:border-gray-100"
                  />

                  {loadingSprints ? (
                    <SkeletonDropdown className="min-w-[200px]" />
                  ) : (
                    <SelectMenu
                      value={sprintFilter}
                      onChange={setSprintFilter}
                      disabled={loadingSprints}
                      options={sprintFilterOptions}
                      placeholder="Sprint"
                      className="min-w-[200px]"
                      triggerClassName="bg-white border border-gray-100 dark:bg-[#1c1c24] dark:border-gray-100"
                    />
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex gap-6 overflow-x-auto pb-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonKanbanColumn key={i} />
                ))}
              </div>
            ) : (
              <KanbanBoard
                tickets={filteredTickets}
                onStatusChange={handleStatusChange}
                onTicketClick={(ticket) => {
                  router.push(`/tickets/${ticket.id}`);
                }}
                userRole={user.role}
                onCreateTicket={() => setShowCreateModal(true)}
                activeTeamId={activeTeamId}
                onTicketSprintChange={() => {
                  void fetchTickets();
                }}
              />
            )}
          </div>
        )}

        {selectedView === "list" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm dark:border-slate-800 dark:from-[#171926] dark:to-[#121520]">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search tickets..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-300/70 bg-white/90 py-3 pl-10 pr-4 text-slate-900 placeholder-slate-500 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-white dark:placeholder-slate-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {user.role === "SUPER_ADMIN" ? (
                    <SelectMenu
                      value={activeTeamId}
                      onChange={setActiveTeamId}
                      disabled={teamListLoading || teams.length === 0}
                      options={teams.map((team) => ({
                        value: team.id,
                        label: team.name,
                      }))}
                      placeholder="Team"
                      className="min-w-[180px]"
                      triggerClassName="bg-sky-50 border border-sky-300/70 dark:bg-sky-950/30 dark:border-sky-700/70"
                    />
                  ) : null}

                  <SelectMenu
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statusFilterOptions}
                    placeholder="Status"
                    className="min-w-[200px]"
                    triggerClassName="bg-violet-50 border border-violet-300/70 dark:bg-violet-950/30 dark:border-violet-700/70"
                  />

                  <SelectMenu
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    options={priorityFilterOptions}
                    placeholder="Priority"
                    className="min-w-[180px]"
                    triggerClassName="bg-amber-50 border border-amber-300/70 dark:bg-amber-950/30 dark:border-amber-700/70"
                  />

                  {loadingSprints ? (
                    <SkeletonDropdown className="min-w-[200px]" />
                  ) : (
                    <SelectMenu
                      value={sprintFilter}
                      onChange={setSprintFilter}
                      disabled={loadingSprints}
                      options={sprintFilterOptions}
                      placeholder="Sprint"
                      className="min-w-[200px]"
                      triggerClassName="bg-emerald-50 border border-emerald-300/70 dark:bg-emerald-950/30 dark:border-emerald-700/70"
                    />
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : filteredTickets.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-12 text-center shadow-card dark:border-gray-800 dark:bg-[#1c1c24]">
                <p className="text-gray-600 text-lg mb-2">No tickets found</p>
                <p className="text-gray-500 text-sm mb-4">
                  Try adjusting your search or filters
                </p>
                {user.role === "USER" && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary"
                  >
                    Create your first ticket
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-lg shadow-slate-900/5 dark:border-slate-800 dark:bg-[#141827]">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
                        <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Title
                        </th>
                        <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Assignee
                        </th>
                        <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Status
                        </th>
                        <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Client
                        </th>
                        <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTickets.map((ticket) => {
                        const status =
                          statusConfig[
                            ticket.status as keyof typeof statusConfig
                          ];
                        const StatusIcon = status.icon;

                        return (
                          <tr
                            key={ticket.id}
                            onClick={(e) => {
                              if (
                                (e.target as HTMLElement).closest(
                                  "button, select, option, a",
                                )
                              ) {
                                return;
                              }
                              router.push(`/tickets/${ticket.id}`);
                            }}
                            className="cursor-pointer border-b border-slate-200/90 transition-colors hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-900/40 last:border-b-0"
                          >
                            <td className="px-6 py-5 align-top">
                              <div>
                                <p className="line-clamp-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                                  {ticket.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                  by {ticket.creator.name}
                                </p>
                              </div>
                            </td>
                            <td className="px-6 py-5 align-top">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {ticket.assignee?.name || "Unassigned"}
                              </p>
                            </td>
                            <td className="px-6 py-5 align-top">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                                  status.color,
                                )}
                              >
                                <StatusIcon
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    ticket.status === "IN_PROGRESS" &&
                                      "motion-safe:animate-pulse",
                                  )}
                                />
                                <span>{status.label}</span>
                              </span>
                            </td>
                            <td className="px-6 py-5 align-top">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {ticket.client?.name || "No client"}
                              </p>
                            </td>
                            <td className="px-6 py-5 align-top">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="relative rounded-lg border border-slate-300/70 p-2 text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white group"
                                  onClick={() =>
                                    router.push(`/tickets/${ticket.id}`)
                                  }
                                  title="View ticket details"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-white text-slate-900 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                    View details
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="relative rounded-lg border border-slate-300/70 p-2 text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white group"
                                  onClick={() =>
                                    router.push(`/tickets/${ticket.id}`)
                                  }
                                  title="Edit ticket"
                                >
                                  <Edit className="w-4 h-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-white text-slate-900 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                    Edit ticket
                                  </span>
                                </button>
                                <SelectMenu
                                  value={ticket.status}
                                  onChange={(v) =>
                                    handleStatusChange(ticket.id, v)
                                  }
                                  options={rowStatusOptions}
                                  size="sm"
                                  className="w-[9.75rem]"
                                  menuClassName="z-[100]"
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <CreateTicketModal
          isOpen={showCreateModal}
          defaultTeamId={activeTeamId}
          teams={teams}
        />
      </div>
    </DashboardLayout>
  );
}
