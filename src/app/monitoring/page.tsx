"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { MonitoringTabs } from "@/components/MonitoringTabs";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, ExternalLink, Loader2, RefreshCcw } from "lucide-react";

type SentryInboxAlert = {
  uid: number;
  date: string;
  from: string;
  to: string;
  issueKey: string | null;
  errorTitle: string;
  errorMessage: string | null;
  level: string | null;
  sentryUrl: string | null;
  project: string | null;
  environment: string | null;
  culprit: string | null;
  eventId: string | null;
  alertRuleId: string | null;
  requestUrl: string | null;
  requestMethod: string | null;
  userIp: string | null;
  exceptionText: string | null;
  exceptionType: string | null;
  details: string[];
  subject: string;
};

type SentryInboxOverview = {
  ok: boolean;
  inbox: string;
  checkedAt: string;
  scannedCount: number;
  lookbackHours: number;
  foundCount: number;
  selectedProject: string;
  projects: Array<{ key: string; label: string; count: number }>;
  alerts: SentryInboxAlert[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function levelTone(level: string | null) {
  if (level === "fatal") {
    return {
      chip: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
      row: "border-l-rose-500",
    };
  }
  if (level === "error") {
    return {
      chip: "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200",
      row: "border-l-red-500",
    };
  }
  if (level === "warning") {
    return {
      chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
      row: "border-l-amber-500",
    };
  }
  return {
    chip: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
    row: "border-l-sky-500",
  };
}

export default function MonitoringPage() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<SentryInboxOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [expandedException, setExpandedException] = useState<
    Record<number, boolean>
  >({});
  const [copiedUid, setCopiedUid] = useState<number | null>(null);
  const [copiedAlertUid, setCopiedAlertUid] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const query =
        projectFilter === "all"
          ? ""
          : `?project=${encodeURIComponent(projectFilter)}`;

      const res = await fetch(`/api/monitoring/sentry-inbox${query}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "Failed to scan Sentry inbox");
      }

      setOverview(body as SentryInboxOverview);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to scan Sentry inbox",
      );
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;
    void loadOverview();
  }, [authLoading, user, loadOverview]);

  useEffect(() => {
    if (!overview) return;
    const interval = setInterval(() => {
      void loadOverview();
    }, 30000);

    return () => clearInterval(interval);
  }, [overview, loadOverview]);

  const alerts = useMemo(() => overview?.alerts || [], [overview]);

  const toggleException = (uid: number) => {
    setExpandedException((current) => ({
      ...current,
      [uid]: !current[uid],
    }));
  };

  const copyException = async (uid: number, exceptionText: string) => {
    try {
      await navigator.clipboard.writeText(exceptionText);
      setCopiedUid(uid);
      setTimeout(() => {
        setCopiedUid((current) => (current === uid ? null : current));
      }, 1800);
    } catch {
      setError("Failed to copy exception text");
    }
  };

  const copyAlert = async (alert: SentryInboxAlert) => {
    const lines = [
      `Issue: ${alert.issueKey || "(none)"}`,
      `Title: ${alert.errorTitle}`,
      `Message: ${alert.errorMessage || "(none)"}`,
      `Level: ${alert.level || "(unknown)"}`,
      `Environment: ${alert.environment || "(unknown)"}`,
      `Culprit: ${alert.culprit || "(none)"}`,
      `Method: ${alert.requestMethod || "(none)"}`,
      `Request URL: ${alert.requestUrl || "(none)"}`,
      `User IP: ${alert.userIp || "(none)"}`,
      `Event ID: ${alert.eventId || "(none)"}`,
      `Sentry URL: ${alert.sentryUrl || "(none)"}`,
      "",
      "Exception:",
      alert.exceptionText || "(none)",
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedAlertUid(alert.uid);
      setTimeout(() => {
        setCopiedAlertUid((current) =>
          current === alert.uid ? null : current,
        );
      }, 1800);
    } catch {
      setError("Failed to copy alert");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-red-500" />
      </div>
    );
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Only super admins can access monitoring.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-950 dark:text-white">
                Sentry Error Alerts
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
                GitHub-style alert list from Sentry emails with exception and
                request context.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                void loadOverview();
              }}
              className="inline-flex items-center gap-2 border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-600"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </header>

        <MonitoringTabs alertCount={overview?.foundCount ?? 0} />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setProjectFilter("all")}
            className={`border px-3 py-1.5 text-sm font-medium ${
              projectFilter === "all"
                ? "border-red-600 bg-red-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            All projects (
            {overview?.projects?.reduce((sum, item) => sum + item.count, 0) ||
              0}
            )
          </button>
          {(overview?.projects || []).map((project) => (
            <button
              key={project.key}
              type="button"
              onClick={() => setProjectFilter(project.key)}
              className={`border px-3 py-1.5 text-sm font-medium ${
                projectFilter === project.key
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {project.label} ({project.count})
            </button>
          ))}
        </div>

        {error ? (
          <div className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {alerts.map((alert) => (
              <article
                key={alert.uid}
                className={`border-l-4 px-4 py-4 ${levelTone(alert.level).row}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {alert.issueKey ? (
                        <span className="border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          {alert.issueKey}
                        </span>
                      ) : null}
                      {alert.level ? (
                        <span
                          className={`border px-2 py-0.5 text-xs font-semibold uppercase ${levelTone(alert.level).chip}`}
                        >
                          {alert.level}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-gray-950 dark:text-white">
                      {alert.errorTitle}
                    </h3>

                    {alert.errorMessage ? (
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {alert.errorMessage}
                      </p>
                    ) : null}

                    {(alert.exceptionType ||
                      alert.requestMethod ||
                      alert.requestUrl) && (
                      <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {alert.exceptionType
                          ? `${alert.exceptionType}`
                          : "Exception"}
                        {alert.requestMethod ? ` • ${alert.requestMethod}` : ""}
                        {alert.requestUrl ? ` ${alert.requestUrl}` : ""}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {alert.environment ? (
                        <span className="border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          env: {alert.environment}
                        </span>
                      ) : null}
                      {alert.culprit ? (
                        <span className="border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          culprit: {alert.culprit}
                        </span>
                      ) : null}
                      {alert.alertRuleId ? (
                        <span className="border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          rule: {alert.alertRuleId}
                        </span>
                      ) : null}
                      {alert.userIp ? (
                        <span className="border border-gray-300 bg-gray-50 px-2 py-0.5 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          ip: {alert.userIp}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-xs text-gray-500">
                      {alert.date === "unknown"
                        ? "unknown time"
                        : formatDate(alert.date)}
                      {alert.from ? ` | from ${alert.from}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {alert.sentryUrl ? (
                      <a
                        href={alert.sentryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Open in Sentry <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        void copyAlert(alert);
                      }}
                      className="inline-flex items-center gap-1 border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {copiedAlertUid === alert.uid
                        ? "Copied alert"
                        : "Copy error"}
                    </button>

                    {alert.exceptionText ? (
                      <button
                        type="button"
                        onClick={() => {
                          toggleException(alert.uid);
                        }}
                        className="inline-flex items-center gap-1 border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {expandedException[alert.uid]
                          ? "Hide exception"
                          : "Show exception"}
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            expandedException[alert.uid] ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    ) : null}

                    {alert.exceptionText ? (
                      <button
                        type="button"
                        onClick={() => {
                          void copyException(
                            alert.uid,
                            alert.exceptionText || "",
                          );
                        }}
                        className="inline-flex items-center gap-1 border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {copiedUid === alert.uid ? "Copied" : "Copy exception"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {alert.exceptionText && expandedException[alert.uid] ? (
                  <div className="mt-3 border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Exception
                    </p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-800 dark:text-gray-200">
                      {alert.exceptionText}
                    </pre>
                  </div>
                ) : null}
              </article>
            ))}

            {alerts.length === 0 && !loading ? (
              <EmptyState
                title="No Sentry alerts found"
                description="There are no error alerts in the current scan window."
                icon={<ChevronDown className="h-6 w-6" aria-hidden="true" />}
                className="border-0 bg-transparent shadow-none"
              />
            ) : null}

            {loading ? (
              <div className="px-4 py-6 text-sm text-gray-500">
                Running inbox scan...
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
