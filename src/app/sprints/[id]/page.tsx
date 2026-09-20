"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import KanbanBoard from "@/components/KanbanBoard";
import EmptyState from "@/components/EmptyState";
import CreateTicketModal from "@/components/CreateTicketModal";
import type {
  CreateTicketPayload,
  CreateTicketResultDetail,
  CreateTicketSubmitDetail,
} from "@/components/CreateTicketModal";
import { ArrowLeft, Plus, Calendar, Flag } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { onRealtimeChange } from "@/lib/realtime-events";

interface Sprint {
  id: string;
  name: string;
  status: string;
  goal: string | null;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  teamId: string;
}

interface Ticket {
  id: string;
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
  selectorId?: number | null;
}

export default function SprintDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const sprintId = params.id as string;

  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchSprint = useCallback(async () => {
    if (!sprintId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/sprints/${sprintId}`);

      if (response.status === 404) {
        setError("Sprint not found");
        setSprint(null);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load sprint");
      }

      const sprintData = await response.json();
      setSprint(sprintData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sprint");
      setSprint(null);
    } finally {
      setLoading(false);
    }
  }, [sprintId]);

  const fetchTickets = useCallback(async () => {
    if (!sprintId || !sprint) return;

    try {
      const params = new URLSearchParams({ sprintId });
      if (sprint.teamId) {
        params.set("teamId", sprint.teamId);
      }
      const response = await fetch(`/api/tickets?${params.toString()}`);

      if (!response.ok) {
        setTickets([]);
        return;
      }

      const ticketsData = await response.json();
      setTickets(Array.isArray(ticketsData) ? ticketsData : []);
    } catch {
      setTickets([]);
    }
  }, [sprintId, sprint]);

  useEffect(() => {
    void fetchSprint();
  }, [fetchSprint]);

  useEffect(() => {
    if (!sprint) return;
    void fetchTickets();
  }, [sprint, fetchTickets]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table === "Ticket") {
        void fetchSprint();
        void fetchTickets();
      }
    });

    return unsubscribe;
  }, [user, fetchSprint, fetchTickets]);

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
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

      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const handleTicketClick = (ticket: Ticket) => {
    router.push(`/tickets/${ticket.id}`);
  };

  const handleCreateTicket = useCallback(
    async (ticketData: CreateTicketPayload) => {
      try {
        const response = await fetch("/api/tickets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...ticketData,
            sprintId: sprintId,
          }),
        });

        if (!response.ok) throw new Error("Failed to create ticket");

        const created = (await response.json()) as { id?: string };
        await fetchTickets();
        return created;
      } catch {
        return null;
      }
    },
    [sprintId, fetchTickets],
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

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-brand-600 dark:border-gray-700"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!sprint) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 dark:border-slate-700 dark:bg-gray-800">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2 dark:text-white">
              {error || "Sprint not found"}
            </h2>
            <Link
              href="/sprints"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sprints
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const _daysUntilEnd = sprint.startsAt
    ? Math.ceil(
        (new Date(sprint.endsAt).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  const completedTickets = tickets.filter(
    (t) => t.status === "COMPLETE",
  ).length;
  const completionRate =
    tickets.length > 0
      ? Math.round((completedTickets / tickets.length) * 100)
      : 0;

  const statusColor: Record<string, string> = {
    PLANNED: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    ACTIVE: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    CLOSED: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/sprints"
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {sprint.name}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  statusColor[sprint.status] || "bg-gray-100 text-gray-700"
                }`}
              >
                {sprint.status}
              </span>
            </div>

            {sprint.goal && (
              <p className="text-gray-600 dark:text-gray-400 max-w-2xl">
                {sprint.goal}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add ticket</span>
          </button>
        </div>

        {/* Sprint info metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 dark:border-slate-700 dark:bg-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 dark:text-gray-400">
              Start date
            </div>
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <span className="font-semibold">
                {format(new Date(sprint.startsAt), "MMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 dark:border-slate-700 dark:bg-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 dark:text-gray-400">
              End date
            </div>
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <span className="font-semibold">
                {format(new Date(sprint.endsAt), "MMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 dark:border-slate-700 dark:bg-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 dark:text-gray-400">
              Tickets
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {tickets.length}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {completedTickets} complete
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 dark:border-slate-700 dark:bg-gray-800">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 dark:text-gray-400">
              Completion
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {completionRate}%
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Kanban board */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 dark:border-slate-700 dark:bg-gray-800">
          {tickets.length === 0 ? (
            <EmptyState
              title="No tickets yet"
              description="This sprint is ready to receive tickets."
              icon={<Flag className="h-6 w-6" aria-hidden="true" />}
              action={
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create first ticket</span>
                </button>
              }
              className="border-0 bg-transparent shadow-none"
            />
          ) : (
            <KanbanBoard
              tickets={tickets}
              onStatusChange={handleStatusChange}
              onTicketClick={handleTicketClick}
              userRole={user?.role || "USER"}
              onCreateTicket={() => setShowCreateModal(true)}
            />
          )}
        </div>

        {/* Create ticket modal */}
        {showCreateModal && (
          <CreateTicketModal
            isOpen={showCreateModal}
            defaultTeamId={sprint.teamId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
