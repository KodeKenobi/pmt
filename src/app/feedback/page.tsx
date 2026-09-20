"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { SelectMenu } from "@/components/SelectMenu";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare } from "lucide-react";

interface FeedbackItem {
  id: string;
  source: string;
  status: string;
  fromEmail: string;
  subject: string;
  body: string;
  ticketId: string | null;
  assignedToId: string | null;
  createdAt: string;
  receivedAt: string;
  assignedTo?: { id: string; name: string; email: string } | null;
  ticket?: { id: string; title: string; teamId: string | null } | null;
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const STATUS_OPTIONS = ["ALL", "NEW", "ASSIGNED", "RESOLVED"] as const;

export default function FeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user || user.role === "CLIENT") return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const [feedbackRes, usersRes] = await Promise.all([
        fetch(`/api/feedback?${params.toString()}`),
        fetch("/api/workload/users"),
      ]);

      if (feedbackRes.ok) {
        const feedbackData = (await feedbackRes.json()) as FeedbackItem[];
        setItems(feedbackData);
      } else {
        setItems([]);
      }

      if (usersRes.ok) {
        const userData = (await usersRes.json()) as StaffUser[];
        setUsers(userData);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, user]);

  useEffect(() => {
    if (!authLoading && user) {
      void load();
    }
  }, [authLoading, user, load]);

  const visible = useMemo(
    () =>
      items.filter((item) =>
        statusFilter === "ALL" ? true : item.status === statusFilter,
      ),
    [items, statusFilter],
  );

  const assignFeedback = async (feedbackId: string) => {
    const assignedToId = assignments[feedbackId];
    if (!assignedToId) return;

    setSavingId(feedbackId);
    try {
      const response = await fetch(`/api/feedback/${feedbackId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId, status: "ASSIGNED" }),
      });

      if (response.ok) {
        await load();
      }
    } finally {
      setSavingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600" />
      </div>
    );
  }

  if (!user || user.role === "CLIENT") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Feedback Inbox
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Inbound client feedback, emails, and pending assignments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Status
            </label>
            <SelectMenu
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as (typeof STATUS_OPTIONS)[number])
              }
              options={STATUS_OPTIONS.map((option) => ({
                value: option,
                label: option,
              }))}
              className="min-w-[180px]"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
            <SkeletonLine className="h-4 w-1/3" />
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-5/6" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No feedback found"
            description="Try changing the selected status filter."
            icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
          />
        ) : (
          <div className="space-y-4">
            {visible.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-card"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {item.source} · {item.status}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                      {item.subject}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.fromEmail} ·{" "}
                      {new Date(item.receivedAt).toLocaleString()}
                    </p>
                    {item.ticket ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Linked ticket: {item.ticket.title} ({item.ticket.id})
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-[220px] space-y-2">
                    <SelectMenu
                      value={assignments[item.id] ?? item.assignedToId ?? ""}
                      onChange={(value) =>
                        setAssignments((prev) => ({
                          ...prev,
                          [item.id]: value,
                        }))
                      }
                      options={[
                        { value: "", label: "Select assignee" },
                        ...users.map((staff) => ({
                          value: staff.id,
                          label: `${staff.name} (${staff.email})`,
                        })),
                      ]}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() => void assignFeedback(item.id)}
                      disabled={
                        savingId === item.id ||
                        !(assignments[item.id] ?? item.assignedToId)
                      }
                      className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingId === item.id ? "Assigning..." : "Assign"}
                    </button>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
