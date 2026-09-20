"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { MonitoringTabs } from "@/components/MonitoringTabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Radar,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonLine } from "@/components/ui/Skeleton";

type AlertNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  read: boolean;
  createdAt: string;
};

type MonitoringOverview = {
  integrations: {
    sentry: {
      unresolvedCount: number;
      issues: Array<{
        id: string;
        title: string;
        level: string;
        status: string;
        count: string;
        userCount: number;
        lastSeen: string;
        permalink: string;
      }>;
    };
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isAlertType(type: string) {
  return (
    type === "PR_READY_FOR_REVIEW" ||
    type === "MONITORING_ERROR" ||
    type.startsWith("MONITORING_")
  );
}

function severityTone(level: string) {
  if (level === "fatal") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "error") return "border-red-200 bg-red-50 text-red-700";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function MonitoringAlertsPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [notificationsRes, overviewRes] = await Promise.all([
        fetch("/api/notifications", { cache: "no-store" }),
        fetch("/api/monitoring/overview", { cache: "no-store" }),
      ]);

      const notificationsBody = await notificationsRes.json().catch(() => []);
      const overviewBody = await overviewRes.json().catch(() => ({}));

      if (!notificationsRes.ok) {
        throw new Error(notificationsBody?.error || "Failed to load alerts");
      }

      if (!overviewRes.ok) {
        throw new Error(
          overviewBody?.error || "Failed to load monitoring overview",
        );
      }

      setNotifications(
        (notificationsBody as AlertNotification[]).filter((item) =>
          isAlertType(item.type),
        ),
      );
      setOverview(overviewBody as MonitoringOverview);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;
    void loadData();
  }, [authLoading, user, loadData]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const monitoringIssues = overview?.integrations.sentry.issues || [];

  const markAlertNotificationsRead = async () => {
    const ids = notifications
      .filter((item) => !item.read)
      .map((item) => item.id);
    if (ids.length === 0) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await loadData();
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Only super admins can access monitoring.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-white">
              <Radar className="h-7 w-7 text-indigo-500" /> Monitoring Alerts
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
              Active monitoring errors, PR review alerts, and unresolved Sentry
              issues in one place.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <MonitoringTabs alertCount={unreadCount + monitoringIssues.length} />

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Unread alerts
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {unreadCount}
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Notifications waiting in the alert inbox.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sentry issues
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {monitoringIssues.length}
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Unresolved issues from your configured Sentry project.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Last sync
            </p>
            <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
              {lastUpdated || "Waiting"}
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Alerts are refreshed from notifications and monitoring overview.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Alert feed
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Unread alert notifications with ticket or external links.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void markAlertNotificationsRead()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Mark unread as read
              </button>
            </div>

            {loading ? (
              <div className="space-y-2 p-6">
                <SkeletonLine className="h-4 w-2/5" />
                <SkeletonLine className="h-4 w-full" />
                <SkeletonLine className="h-4 w-4/5" />
              </div>
            ) : notifications.length ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "p-4",
                      !item.read && "bg-brand-600/[0.04] dark:bg-brand-600/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {item.title}
                          </p>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              severityTone(
                                item.type === "MONITORING_ERROR"
                                  ? "error"
                                  : "warning",
                              ),
                            )}
                          >
                            {item.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {item.body || "No additional details available."}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                      {item.body ? (
                        <a
                          href={item.body}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Open <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No alert notifications"
                description="New monitoring alerts will appear here."
                icon={<Radar className="h-6 w-6" aria-hidden="true" />}
                className="border-0 bg-transparent shadow-none"
              />
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Sentry issues
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Current unresolved issues mirrored from your monitoring
                  overview.
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </div>

            {monitoringIssues.length ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {monitoringIssues.map((issue) => (
                  <div key={issue.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {issue.title}
                          </p>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                              severityTone(issue.level),
                            )}
                          >
                            {issue.level}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {issue.count} events | {issue.userCount} users
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Last seen {formatDate(issue.lastSeen)}
                        </p>
                      </div>
                      <a
                        href={issue.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No unresolved issues"
                description="Sentry has not reported any open issues."
                icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
                className="border-0 bg-transparent shadow-none"
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div className="space-y-1">
              <p className="font-semibold text-gray-900 dark:text-white">
                How this works
              </p>
              <p>
                Monitoring alerts are generated from Sentry issue syncs and PR
                review events, then surfaced here and in the bell badge.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
