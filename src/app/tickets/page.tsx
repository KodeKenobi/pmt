"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { Pagination } from "@/components/Pagination";
import CreateTicketModal from "@/components/CreateTicketModal";
import type {
  CreateTicketPayload,
  CreateTicketResultDetail,
  CreateTicketSubmitDetail,
} from "@/components/CreateTicketModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SelectMenu } from "@/components/SelectMenu";
import { SprintSelector } from "@/components/SprintSelector";
import {
  IconContext,
  PlusIcon as Plus,
  FunnelIcon as Filter,
  MagnifyingGlassIcon as Search,
  CalendarBlankIcon as Calendar,
  UserIcon as User,
  EyeIcon as Eye,
  TrashIcon as Trash2,
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as AlertCircle,
  ClockIcon as ClockIcon,
  LightningIcon as Zap,
  ListChecksIcon as ListTodo,
  UploadSimpleIcon as Upload,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { onRealtimeChange } from "@/lib/realtime-events";
import { SkeletonDropdown, SkeletonTicketCard } from "@/components/ui/Skeleton";
import { cachedGetJson } from "@/store/cacheClient";

interface Ticket {
  id: string;
  selectorId?: number | null;
  title: string;
  description?: string | null;
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
  } | null;
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
  } | null;
  sprint?: {
    id: string;
    name: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
}

function ticketDisplayId(ticket: Ticket): string {
  if (typeof ticket.selectorId === "number") {
    return `#${ticket.selectorId}`;
  }
  return "No selector ID";
}

interface AssignableUser {
  id: string;
  name: string;
  email: string;
}

const EXCLUDED_ASSIGNEE_EMAILS = new Set<string>(["dev@lighthousemediagroup.com"]);

type ImportRowResult = {
  index: number;
  title: string;
  status: "validated" | "created" | "error";
  message: string;
  ticketId?: string;
};

type ImportSummary = {
  total: number;
  created: number;
  validated: number;
  failed: number;
  dryRun: boolean;
};

const statusConfig = {
  BACKLOG: {
    label: "Backlog",
    color:
      "bg-gray-100 text-gray-800 border border-gray-300 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30",
    icon: ClockIcon,
  },
  TODO: {
    label: "To Do",
    color:
      "bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30",
    icon: ListTodo,
  },
  REFINE: {
    label: "Refine",
    color:
      "bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30",
    icon: Filter,
  },
  IN_PROGRESS: {
    label: "In Progress",
    color:
      "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
    icon: Zap,
  },
  IN_REVIEW: {
    label: "In Review",
    color:
      "bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/30",
    icon: Eye,
  },
  QA: {
    label: "QA",
    color:
      "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30",
    icon: AlertCircle,
  },
  REVISIONS: {
    label: "Revisions",
    color:
      "bg-yellow-100 text-yellow-900 border border-yellow-400 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30",
    icon: AlertCircle,
  },
  COMPLETE: {
    label: "Complete",
    color:
      "bg-green-100 text-green-800 border border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30",
    icon: CheckCircle,
  },
  CLIENT_REVIEW: {
    label: "Client Review",
    color:
      "bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
    icon: Eye,
  },
};

const priorityFilterOptions = [
  { value: "", label: "All priorities" },
  { value: "NONE", label: "None" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const priorityConfig = {
  NONE: { label: "None" },
  LOW: { label: "Low" },
  MEDIUM: { label: "Medium" },
  HIGH: { label: "High" },
  URGENT: { label: "Urgent" },
} as const;

const SAMPLE_IMPORT_JSON = `[
  {
    "title": "Finalize onboarding checklist",
    "description": "Confirm all onboarding steps for new clients.",
    "acceptanceCriteria": "Checklist signed off by ops lead.",
    "status": "BACKLOG",
    "priority": "MEDIUM",
    "creatorEmail": "dev@lighthousemediagroup.com",
    "assigneeEmail": null,
    "teamName": "Development",
    "clientEmail": null,
    "projectName": "Blubook",
    "startDate": "2026-06-01T08:00:00Z",
    "dueDate": "2026-06-07T17:00:00Z"
  }
]`;

function TicketsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasAppliedQueryRef = useRef(false);
  const { user } = useAuth();
  const {
    teams,
    activeTeamId,
    setActiveTeamId,
    isAllTeams,
    setAllTeamsMode,
    loading: teamLoading,
  } = useTeam();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPayload, setImportPayload] = useState(SAMPLE_IMPORT_JSON);
  const [importBusy, setImportBusy] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(
    null,
  );
  const [importRows, setImportRows] = useState<ImportRowResult[]>([]);
  const [importError, setImportError] = useState("");
  const [pendingDeleteTicketId, setPendingDeleteTicketId] = useState<
    string | null
  >(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;

  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [sprintFilter, setSprintFilter] = useState<string>("__all__");
  const [sprints, setSprints] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);

  useEffect(() => {
    if (!user || hasAppliedQueryRef.current) return;

    const queryStatus = searchParams.get("status");
    const queryPriority = searchParams.get("priority");
    const queryAssigneeId = searchParams.get("assigneeId");
    const queryTeamId = searchParams.get("teamId");
    const queryAllTeams = searchParams.get("allTeams") === "1";

    if (queryStatus) setStatusFilter(queryStatus);
    if (queryPriority) setPriorityFilter(queryPriority);
    if (queryAssigneeId) setAssigneeFilter(queryAssigneeId);

    if (user.role === "SUPER_ADMIN") {
      if (queryAllTeams) {
        setAllTeamsMode(true);
      } else if (queryTeamId) {
        setAllTeamsMode(false);
        setActiveTeamId(queryTeamId);
      }
    } else if (queryTeamId && user.role === "USER") {
      setActiveTeamId(queryTeamId);
    }

    hasAppliedQueryRef.current = true;
  }, [searchParams, user, setActiveTeamId, setAllTeamsMode]);

  const fetchAssignableUsers = useCallback(
    async (force = false) => {
      if (!user || user.role === "CLIENT") {
        setAssignableUsers([]);
        return;
      }

      try {
        if (user.role === "SUPER_ADMIN") {
          const data = await cachedGetJson<AssignableUser[]>({
            key: "tickets_assignable_users:super_admin",
            url: "/api/workload/users",
            staleMs: 120_000,
            force,
          });
          const users = Array.isArray(data) ? data : [];
          setAssignableUsers(
            users.filter(
              (candidate) =>
                !EXCLUDED_ASSIGNEE_EMAILS.has(
                  candidate.email.trim().toLowerCase(),
                ),
            ),
          );
          return;
        }

        if (!activeTeamId) {
          setAssignableUsers([]);
          return;
        }

        const body = await cachedGetJson<{
          members?: Array<{ userId: string; name: string; email: string }>;
        }>({
          key: `tickets_assignable_users:team:${activeTeamId}`,
          url: `/api/teams/${activeTeamId}/members`,
          staleMs: 120_000,
          force,
        });
        const members = Array.isArray(body.members) ? body.members : [];

        setAssignableUsers(
          members
            .map((member) => ({
              id: member.userId,
              name: member.name,
              email: member.email,
            }))
            .filter(
              (candidate) =>
                !EXCLUDED_ASSIGNEE_EMAILS.has(
                  candidate.email.trim().toLowerCase(),
                ),
            ),
        );
      } catch {
        setAssignableUsers([]);
      }
    },
    [user, activeTeamId],
  );

  const fetchProjects = useCallback(
    async (force = false) => {
      if (!user || user.role === "CLIENT") {
        setProjects([]);
        return;
      }

      if (!activeTeamId || (user.role === "SUPER_ADMIN" && isAllTeams)) {
        setProjects([]);
        return;
      }

      try {
        setLoadingProjects(true);
        const data = await cachedGetJson<
          Array<{
            id: string;
            name: string;
          }>
        >({
          key: `tickets_projects:${activeTeamId}`,
          url: `/api/projects?teamId=${activeTeamId}`,
          staleMs: 60_000,
          force,
        });

        setProjects(Array.isArray(data) ? data : []);
      } catch {
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    },
    [user, activeTeamId, isAllTeams],
  );

  const fetchSprints = useCallback(
    async (force = false) => {
      if (!user || user.role === "CLIENT") {
        setSprints([]);
        return;
      }

      if (!activeTeamId || (user.role === "SUPER_ADMIN" && isAllTeams)) {
        setSprints([]);
        return;
      }

      try {
        setLoadingSprints(true);
        const data = await cachedGetJson<
          Array<{
            id: string;
            name: string;
            status: string;
          }>
        >({
          key: `tickets_sprints:${activeTeamId}`,
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
    [user, activeTeamId, isAllTeams],
  );

  const fetchTickets = useCallback(
    async (force = false) => {
      if (!user) return;
      if (user.role === "CLIENT") {
        setLoading(false);
        return;
      }
      try {
        setError("");
        const params = new URLSearchParams();
        if (statusFilter) {
          params.append("status", statusFilter);
        }
        if (priorityFilter) {
          params.append("priority", priorityFilter);
        }
        if (assigneeFilter) {
          params.append("assigneeId", assigneeFilter);
        }
        if (sprintFilter === "backlog") {
          params.append("sprintId", "backlog");
        } else if (sprintFilter && sprintFilter !== "__all__") {
          params.append("sprintId", sprintFilter);
        }
        if (user.role === "USER") {
          if (!activeTeamId) {
            setTickets([]);
            setLoading(false);
            return;
          }
          params.set("teamId", activeTeamId);
        } else if (user.role === "SUPER_ADMIN") {
          if (!isAllTeams && activeTeamId) {
            params.set("teamId", activeTeamId);
          }
        }

        const query = params.toString();
        const data = await cachedGetJson<Ticket[]>({
          key: `tickets_list:${query || "all"}`,
          url: `/api/tickets?${query}`,
          staleMs: 30_000,
          force,
        });
        setTickets(data);
      } catch {
        setError("Failed to fetch tickets");
      } finally {
        setLoading(false);
      }
    },
    [
      statusFilter,
      priorityFilter,
      assigneeFilter,
      sprintFilter,
      user,
      activeTeamId,
      isAllTeams,
    ],
  );

  useEffect(() => {
    if (user && user.role !== "CLIENT") fetchTickets();
  }, [statusFilter, priorityFilter, fetchTickets, user]);

  useEffect(() => {
    if (!user || user.role === "CLIENT") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (
        detail.table !== "Ticket" &&
        detail.table !== "Client" &&
        detail.table !== "Project" &&
        detail.table !== "Team"
      ) {
        return;
      }
      void fetchTickets(true);
    });

    return unsubscribe;
  }, [user, fetchTickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    sprintFilter,
    activeTeamId,
    isAllTeams,
  ]);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const previousTickets = tickets;
    try {
      setError("");
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket,
        ),
      );

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update ticket",
        );
      }
    } catch (err) {
      setTickets(previousTickets);
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const handleAssigneeChange = async (
    ticketId: string,
    nextAssigneeId: string,
  ) => {
    const previousTickets = tickets;
    try {
      const assigneeId =
        nextAssigneeId === "__unassigned__" ? null : nextAssigneeId;
      const selectedAssignee =
        assigneeId === null
          ? null
          : (assignableUsers.find((member) => member.id === assigneeId) ??
            null);

      setError("");
      setTickets((prev) =>
        prev.map((ticket): Ticket => {
          if (ticket.id !== ticketId) return ticket;

          if (selectedAssignee) {
            return {
              ...ticket,
              assignee: {
                id: selectedAssignee.id,
                name: selectedAssignee.name,
                email: selectedAssignee.email,
              },
            };
          }

          const { assignee: _assignee, ...rest } = ticket;
          return rest as Ticket;
        }),
      );

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assigneeId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update assignee",
        );
      }
    } catch (err) {
      setTickets(previousTickets);
      setError(
        err instanceof Error ? err.message : "Failed to update assignee",
      );
    }
  };

  const handlePriorityChange = async (
    ticketId: string,
    nextPriority: string,
  ) => {
    const previousTickets = tickets;
    try {
      setError("");
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ticketId
            ? { ...ticket, priority: nextPriority }
            : ticket,
        ),
      );

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priority: nextPriority }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update priority",
        );
      }
    } catch (err) {
      setTickets(previousTickets);
      setError(
        err instanceof Error ? err.message : "Failed to update priority",
      );
    }
  };

  const handleProjectChange = async (
    ticketId: string,
    nextProjectId: string,
  ) => {
    const previousTickets = tickets;
    try {
      const projectId = nextProjectId === "" ? null : nextProjectId;
      const selectedProject =
        projectId === null
          ? null
          : (projects.find((proj) => proj.id === projectId) ?? null);

      setError("");
      setTickets((prev) =>
        prev.map((ticket): Ticket => {
          if (ticket.id !== ticketId) return ticket;

          if (selectedProject) {
            return {
              ...ticket,
              project: {
                id: selectedProject.id,
                name: selectedProject.name,
              },
            };
          }

          const { project: _project, ...rest } = ticket;
          return rest as Ticket;
        }),
      );

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update project",
        );
      }
    } catch (err) {
      setTickets(previousTickets);
      setError(
        err instanceof Error ? err.message : "Failed to update project",
      );
    }
  };

  useEffect(() => {
    if (!user || user.role === "CLIENT") return;
    void Promise.all([fetchAssignableUsers(), fetchSprints(), fetchProjects()]);
  }, [user, activeTeamId, isAllTeams, fetchAssignableUsers, fetchSprints, fetchProjects]);

  useEffect(() => {
    if (sprintFilter === "__all__" || sprintFilter === "backlog") return;
    if (sprints.some((sprint) => sprint.id === sprintFilter)) return;
    setSprintFilter("__all__");
  }, [sprints, sprintFilter]);

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

        if (!response.ok) {
          throw new Error("Failed to create ticket");
        }

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
        setError("Failed to create ticket");
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
        let message: string | undefined;

        if (ok && created?.id && customEvent.detail.attachments?.length) {
          const uploads = await Promise.all(
            customEvent.detail.attachments.map(async (file) => {
              const fd = new FormData();
              fd.append("file", file);
              const res = await fetch(
                `/api/tickets/${created.id}/attachments`,
                {
                  method: "POST",
                  body: fd,
                },
              );
              return res.ok;
            }),
          );

          const failedCount = uploads.filter((done) => !done).length;
          if (failedCount > 0) {
            message = `Ticket created, but ${failedCount} attachment(s) failed to upload.`;
          }
        }

        window.dispatchEvent(
          new CustomEvent<CreateTicketResultDetail>(
            "create-ticket-modal-result",
            {
              detail: {
                ok,
                message: ok ? message : "Failed to create ticket.",
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

  const deleteTicketById = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete ticket");
      }
      setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId));
    } catch {}
  };

  const handleDeleteTicket = (ticketId: string) => {
    setPendingDeleteTicketId(ticketId);
  };

  const confirmDeleteTicket = async () => {
    if (!pendingDeleteTicketId) return;
    await deleteTicketById(pendingDeleteTicketId);
    setPendingDeleteTicketId(null);
  };

  const goToTicket = (id: string) => {
    router.push(`/tickets/${id}`);
  };

  const executeImport = async (dryRun: boolean) => {
    setImportError("");
    setImportSummary(null);
    setImportRows([]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(importPayload);
    } catch {
      setImportError("Payload must be valid JSON.");
      return;
    }

    if (!Array.isArray(parsed)) {
      setImportError("Payload must be a JSON array of tasks.");
      return;
    }

    setImportBusy(true);
    try {
      const response = await fetch("/api/tickets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: parsed, dryRun }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to import tasks",
        );
      }

      setImportSummary((body.summary ?? null) as ImportSummary | null);
      setImportRows(Array.isArray(body.rows) ? body.rows : []);

      if (!dryRun) {
        await fetchTickets(true);
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to import tasks");
    } finally {
      setImportBusy(false);
    }
  };

  const loadSampleImportPayload = () => {
    setImportPayload(SAMPLE_IMPORT_JSON);
    setImportError("");
    setImportSummary(null);
    setImportRows([]);
  };

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.sprint?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.assignee?.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const sprintFilterOptions = [
    { value: "__all__", label: "All sprints" },
    { value: "backlog", label: "Backlog only" },
    ...sprints.map((sprint) => ({
      value: sprint.id,
      label: `${sprint.name} (${sprint.status})`,
    })),
  ];

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const pagedTickets = filteredTickets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (!user) {
    return null;
  }

  return (
    <IconContext.Provider value={{ weight: "thin" }}>
      <DashboardLayout>
        <div className="w-full space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                All Tickets
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and track all your project tickets
              </p>
            </div>

            <div className="flex items-center gap-3">
              {user.role !== "CLIENT" && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Ticket</span>
                </button>
              )}
              {user.role === "SUPER_ADMIN" && (
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Tasks</span>
                </button>
              )}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white/80 dark:bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-200/80 dark:border-gray-800/50 p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search tickets, clients, or assignees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-3">
                <SelectMenu
                  value={
                    user.role === "SUPER_ADMIN"
                      ? isAllTeams
                        ? "__all__"
                        : activeTeamId
                      : activeTeamId
                  }
                  onChange={(v) => {
                    if (user.role === "SUPER_ADMIN") {
                      if (v === "__all__") setAllTeamsMode(true);
                      else {
                        setAllTeamsMode(false);
                        setActiveTeamId(v);
                      }
                    } else {
                      setActiveTeamId(v);
                    }
                  }}
                  disabled={
                    teamLoading || teams.length === 0 || user.role === "CLIENT"
                  }
                  options={[
                    ...(user?.role === "SUPER_ADMIN"
                      ? [{ value: "__all__", label: "All teams" }]
                      : []),
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  className="min-w-[190px]"
                  triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                />
                <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <SelectMenu
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "", label: "All Statuses" },
                    ...Object.entries(statusConfig).map(([key, config]) => ({
                      value: key,
                      label: config.label,
                    })),
                  ]}
                  className="min-w-[170px]"
                  triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                />
                <SelectMenu
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={priorityFilterOptions}
                  className="min-w-[170px]"
                  triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                />
                <SelectMenu
                  value={assigneeFilter}
                  onChange={setAssigneeFilter}
                  options={[
                    { value: "", label: "All assignees" },
                    ...assignableUsers.map((member) => ({
                      value: member.id,
                      label: member.name,
                    })),
                  ]}
                  className="min-w-[170px]"
                  triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                />
                <SelectMenu
                  value={sprintFilter}
                  onChange={setSprintFilter}
                  disabled={
                    loadingSprints ||
                    (user.role === "SUPER_ADMIN" && isAllTeams)
                  }
                  options={sprintFilterOptions}
                  className="min-w-[170px]"
                  placeholder={
                    user.role === "SUPER_ADMIN" && isAllTeams
                      ? "Select team for sprints"
                      : "Sprint"
                  }
                  triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                />
                {loadingSprints ? (
                  <SkeletonDropdown className="min-w-[170px]" />
                ) : null}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Tickets Grid/List */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: pageSize }).map((_, idx) => (
                <SkeletonTicketCard key={`ticket-skeleton-${idx}`} />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              title="No tickets found"
              description="Try adjusting your search or filters."
              icon={<Search className="h-6 w-6" aria-hidden="true" />}
            />
          ) : (
            <>
              <div
                className={cn(
                  "space-y-4",
                  viewMode === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    : "",
                )}
              >
                {pagedTickets.map((ticket) => {
                  const status =
                    statusConfig[ticket.status as keyof typeof statusConfig];
                  const StatusIcon = status.icon;
                  const displayId = ticketDisplayId(ticket);

                  return (
                    <div
                      key={ticket.id}
                      onClick={(e) => {
                        if (
                          (e.target as HTMLElement).closest(
                            "button, select, option, a",
                          )
                        ) {
                          return;
                        }
                        goToTicket(ticket.id);
                      }}
                      className="group cursor-pointer rounded-xl border border-gray-200/80 bg-white/90 p-6 backdrop-blur-xl transition-all duration-200 hover:border-brand-300/50 dark:border-gray-800/50 dark:bg-gray-900/50 dark:hover:border-gray-700/50"
                    >
                      {/* Header */}
                      <div className="mb-4 flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                            {displayId}
                          </p>
                          <h3 className="line-clamp-2 min-h-10 flex-1 text-sm font-medium normal-case leading-5 text-slate-900 dark:text-white mb-2">
                            {ticket.title}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Click card to view full details
                          </p>
                          <div className="mt-2 flex items-center space-x-2">
                            <span
                              className={cn(
                                "inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border",
                                status.color,
                              )}
                            >
                              <StatusIcon className="w-3 h-3" />
                              <span>{status.label}</span>
                            </span>
                          </div>
                        </div>

                        {(user.role === "USER" ||
                          user.role === "SUPER_ADMIN") && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                goToTicket(ticket.id);
                              }}
                              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-white/10 dark:hover:text-brand-400"
                              title="View ticket details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTicket(ticket.id);
                              }}
                              className="rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                              title="Delete ticket"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="space-y-3">
                        {/* Project */}

                        <div className="w-full">
                          <SelectMenu
                            value={ticket.assignee?.id ?? "__unassigned__"}
                            onChange={(value) =>
                              handleAssigneeChange(ticket.id, value)
                            }
                            options={[
                              {
                                value: "__unassigned__",
                                label: "Assignee: Unassigned",
                              },
                              ...assignableUsers.map((member) => ({
                                value: member.id,
                                label: `${member.name}`,
                              })),
                            ]}
                            className="w-full"
                            triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div className="w-full">
                          <SelectMenu
                            value={ticket.project?.id ?? ""}
                            onChange={(value) =>
                              handleProjectChange(ticket.id, value)
                            }
                            options={[
                              { value: "", label: "No project" },
                              ...projects.map((proj) => ({
                                value: proj.id,
                                label: proj.name,
                              })),
                            ]}
                            className="w-full"
                            triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                          />
                        </div>

                        {ticket.sprint ? (
                          <div className="flex items-center space-x-2 text-sm text-gray-400">
                            <Calendar className="w-4 h-4" />
                            <span>{ticket.sprint.name}</span>
                          </div>
                        ) : null}

                        {ticket.team?.id || (!isAllTeams && activeTeamId) ? (
                          <div
                            className="w-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SprintSelector
                              ticketId={ticket.id}
                              currentSprintId={ticket.sprint?.id}
                              currentSprintName={ticket.sprint?.name}
                              teamId={ticket.team?.id || activeTeamId}
                              onSprintChange={() => {
                                void fetchTickets(true);
                              }}
                            />
                          </div>
                        ) : null}

                        <div className="flex items-center space-x-2 text-sm text-gray-400">
                          <User className="w-4 h-4" />
                          <span>{ticket.assignee?.name || "Unassigned"}</span>
                        </div>

                        <div className="w-full">
                          <SelectMenu
                            value={ticket.priority ?? "NONE"}
                            onChange={(value) =>
                              handlePriorityChange(ticket.id, value)
                            }
                            options={Object.entries(priorityConfig).map(
                              ([key, config]) => ({
                                value: key,
                                label: config.label,
                              }),
                            )}
                            className="w-full"
                            triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div className="flex items-center space-x-2 text-sm text-gray-400">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(ticket.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-2 space-y-2 dark:border-gray-800/50">
                        <SelectMenu
                          value={ticket.status}
                          onChange={(value) =>
                            handleStatusChange(ticket.id, value)
                          }
                          options={Object.entries(statusConfig).map(
                            ([key, config]) => ({
                              value: key,
                              label: config.label,
                            }),
                          )}
                          className="w-full"
                          triggerClassName="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}

          <CreateTicketModal
            isOpen={showCreateModal}
            defaultTeamId={
              user.role === "SUPER_ADMIN"
                ? isAllTeams
                  ? ""
                  : activeTeamId
                : activeTeamId
            }
            teams={teams}
          />
          {showImportModal && user.role === "SUPER_ADMIN" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowImportModal(false)}
              />
              <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#0F1419]">
                {/* Header */}
                <div className="flex-shrink-0 border-b border-gray-200 p-6 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Import Tasks As Tickets
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Paste a JSON array, validate, then import.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-4">
                    <div>
                      <textarea
                        value={importPayload}
                        onChange={(e) => setImportPayload(e.target.value)}
                        className="h-48 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={loadSampleImportPayload}
                        disabled={importBusy}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                      >
                        Load Sample
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void executeImport(true);
                        }}
                        disabled={importBusy}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                      >
                        Validate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void executeImport(false);
                        }}
                        disabled={importBusy}
                        className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {importBusy ? "Working..." : "Import Tickets"}
                      </button>
                    </div>

                    {importError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {importError}
                      </div>
                    )}

                    {importSummary && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-200">
                        total: {importSummary.total} · created:{" "}
                        {importSummary.created} · validated:{" "}
                        {importSummary.validated} · failed: {importSummary.failed} ·
                        mode: {importSummary.dryRun ? "validate" : "import"}
                      </div>
                    )}

                    {importRows.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-900/60">
                            <tr>
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Title</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((row) => (
                              <tr
                                key={`${row.index}-${row.title}`}
                                className="border-t border-gray-200 dark:border-gray-800"
                              >
                                <td className="px-3 py-2">{row.index + 1}</td>
                                <td className="px-3 py-2">{row.title}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-xs font-medium",
                                      row.status === "error"
                                        ? "bg-red-100 text-red-700"
                                        : row.status === "created"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-blue-100 text-blue-700",
                                    )}
                                  >
                                    {row.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2">{row.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          <ConfirmDialog
            isOpen={pendingDeleteTicketId !== null}
            title="Delete ticket"
            message="Are you sure you want to delete this ticket?"
            confirmLabel="Delete"
            onCancel={() => setPendingDeleteTicketId(null)}
            onConfirm={() => {
              void confirmDeleteTicket();
            }}
          />
        </div>
      </DashboardLayout>
    </IconContext.Provider>
  );
}

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600" />
        </div>
      }
    >
      <TicketsPageContent />
    </Suspense>
  );
}
