"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { OverviewMetricStrip } from "@/components/OverviewMetricStrip";
import { cn } from "@/lib/utils";
import { onRealtimeChange } from "@/lib/realtime-events";
import { ListTodo } from "lucide-react";

interface ClientProject {
  id: string;
  name: string;
  progress: number;
  health: string;
  team: { name: string };
  _count: { tickets: number; milestones: number };
}

interface Ticket {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  creator: { id: string; name: string; email: string };
  assignee?: { id: string; name: string; email: string };
  client?: { id: string; name: string; email: string };
}

const statusConfig: Record<string, { label: string; color: string }> = {
  BACKLOG: {
    label: "Backlog",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  },
  TODO: {
    label: "To Do",
    color:
      "bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30",
  },
  REFINE: {
    label: "Refine",
    color:
      "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  IN_REVIEW: {
    label: "In Review",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  QA: {
    label: "QA",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  REVISIONS: {
    label: "Revisions",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  COMPLETE: {
    label: "Complete",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  CLIENT_REVIEW: {
    label: "Client Review",
    color:
      "bg-brand-600/15 text-brand-700 border-brand-500/25 dark:text-brand-300 dark:border-brand-500/30",
  },
};

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/client/projects");
      if (!response.ok) {
        setProjects([]);
        return;
      }
      const data = (await response.json()) as ClientProject[];
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    }
  };

  useEffect(() => {
    void fetchTickets();
    void fetchProjects();
  }, []);

  useEffect(() => {
    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table === "Ticket") {
        void fetchTickets();
        return;
      }
      if (
        detail.table === "Project" ||
        detail.table === "Milestone" ||
        detail.table === "GithubRepo"
      ) {
        void fetchProjects();
      }
    });

    return unsubscribe;
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await fetch("/api/tickets");
      if (!response.ok) throw new Error("Failed to fetch tickets");
      setTickets(await response.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error("Failed to update ticket");
      fetchTickets();
    } catch {}
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600 dark:border-gray-700" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user.role !== "CLIENT") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Only clients can access this portal.
          </p>
        </div>
      </div>
    );
  }

  const total = tickets.length;
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
  const pendingReview = tickets.filter(
    (t) => t.status === "CLIENT_REVIEW",
  ).length;
  const completed = tickets.filter((t) => t.status === "COMPLETE").length;

  return (
    <DashboardLayout>
      <div className="w-full space-y-8">
        {/* Page heading */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Here&apos;s an overview of your project tickets.
          </p>
        </div>

        {/* Metric strip — same component as admin dashboard */}
        <OverviewMetricStrip
          metrics={[
            { label: "total tickets", value: total },
            { label: "in progress", value: inProgress },
            { label: "awaiting review", value: pendingReview },
            { label: "completed", value: completed },
          ]}
        />

        {/* Projects */}
        {projects.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
              Your Projects
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {p.team.name}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-brand-700 dark:text-brand-400">
                      {p.progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-500"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>

                  <p className="mt-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {p._count.tickets} tickets · {p._count.milestones}{" "}
                    milestones
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tickets */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Your Tickets
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600 dark:border-gray-700" />
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              title="No tickets yet"
              description="Tickets will appear here once your team assigns them to you."
              icon={<ListTodo className="h-6 w-6" aria-hidden="true" />}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] dark:border-gray-800">
                    <th className="p-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                      Ticket
                    </th>
                    <th className="p-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                      Status
                    </th>
                    <th className="p-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                      Date
                    </th>
                    <th className="p-5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] dark:divide-gray-800">
                  {tickets.map((ticket) => {
                    const cfg = statusConfig[ticket.status] ?? {
                      label: ticket.status,
                      color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
                    };
                    const isReview = ticket.status === "CLIENT_REVIEW";

                    return (
                      <tr
                        key={ticket.id}
                        className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.03]"
                      >
                        {/* Title */}
                        <td className="p-5">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {ticket.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            by {ticket.creator.name}
                            {ticket.assignee &&
                              ` · assigned to ${ticket.assignee.name}`}
                          </p>
                        </td>

                        {/* Status badge */}
                        <td className="p-5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              cfg.color,
                            )}
                          >
                            {cfg.label}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="p-5">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(ticket.createdAt).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-5">
                          {isReview ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleStatusChange(ticket.id, "COMPLETE")
                                }
                                className="rounded-lg bg-green-500/20 border border-green-500/30 px-3 py-1.5 text-xs font-semibold text-green-400 transition-colors hover:bg-green-500/30"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  handleStatusChange(ticket.id, "REVISIONS")
                                }
                                className="rounded-lg bg-yellow-500/20 border border-yellow-500/30 px-3 py-1.5 text-xs font-semibold text-yellow-400 transition-colors hover:bg-yellow-500/30"
                              >
                                Review
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {ticket.status === "COMPLETE"
                                ? "Completed"
                                : ticket.status === "REVISIONS"
                                  ? "Review requested"
                                  : ticket.status === "IN_PROGRESS"
                                    ? "In progress"
                                    : "In queue"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
