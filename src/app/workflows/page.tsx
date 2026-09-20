"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { MonitoringTabs } from "@/components/MonitoringTabs";
import { SelectMenu } from "@/components/SelectMenu";
import { useAuth } from "@/contexts/AuthContext";
import { SkeletonLine } from "@/components/ui/Skeleton";
import {
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Workflow,
  XCircle,
} from "lucide-react";

type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner?: { login: string };
  default_branch?: string;
};

type GithubWorkflow = {
  id: number;
  name: string;
  path: string;
  state: string;
  updated_at: string;
};

type GithubRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  html_url: string;
  run_number: number;
  head_branch: string;
  created_at: string;
  updated_at: string;
};

function statusIcon(status: string, conclusion: string | null) {
  if (status === "completed") {
    if (conclusion === "success") {
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    }
    if (conclusion === "cancelled") {
      return <Circle className="h-4 w-4 text-gray-500" />;
    }
    return <XCircle className="h-4 w-4 text-rose-600" />;
  }
  return <Clock3 className="h-4 w-4 text-amber-600" />;
}

export default function WorkflowsPage() {
  const { user, loading: authLoading } = useAuth();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [workflows, setWorkflows] = useState<GithubWorkflow[]>([]);
  const [runs, setRuns] = useState<GithubRun[]>([]);

  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("main");

  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [runningWorkflowId, setRunningWorkflowId] = useState<number | null>(
    null,
  );
  const [actingRunId, setActingRunId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [opsBusy, setOpsBusy] = useState(false);
  const [selectorInput, setSelectorInput] = useState("");
  const [assignOwner, setAssignOwner] = useState("");
  const [assignRepo, setAssignRepo] = useState("");
  const [assignPrNumber, setAssignPrNumber] = useState("");
  const canManageWorkflows =
    user?.role === "USER" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const runByWorkflow = useMemo(() => {
    const map = new Map<number, GithubRun[]>();
    for (const run of runs) {
      const list = map.get(run.workflow_id) ?? [];
      list.push(run);
      map.set(run.workflow_id, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return map;
  }, [runs]);

  const workflowNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const wf of workflows) {
      map.set(wf.id, wf.name);
    }
    return map;
  }, [workflows]);

  const selectedRepo = useMemo(
    () =>
      repos.find((r) => r.name === repo && r.owner?.login === owner) ?? null,
    [repos, owner, repo],
  );

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    setError("");
    try {
      const res = await fetch("/api/github/repos");
      const body = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(body.error || "Failed to fetch repositories");
      }
      const data = Array.isArray(body) ? (body as GithubRepo[]) : [];
      setRepos(data);

      if (data.length > 0) {
        const first = data[0];
        const nextOwner = first.owner?.login || "";
        if (nextOwner) setOwner(nextOwner);
        setRepo(first.name);
        setRef(first.default_branch || "main");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch repositories",
      );
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    if (!owner || !repo) return;

    setLoadingWorkflows(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `/api/github/workflows?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "Failed to fetch workflows");
      }

      setWorkflows(Array.isArray(body.workflows) ? body.workflows : []);
      setRuns(Array.isArray(body.runs) ? body.runs : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch workflows",
      );
    } finally {
      setLoadingWorkflows(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    if (authLoading || !canManageWorkflows) return;
    void loadRepos();
  }, [authLoading, canManageWorkflows, loadRepos]);

  useEffect(() => {
    if (!owner || !repo) return;
    void loadWorkflows();
  }, [owner, repo, loadWorkflows]);

  useEffect(() => {
    if (!owner || !repo) return;
    const interval = setInterval(() => {
      void loadWorkflows();
    }, 20000);

    return () => clearInterval(interval);
  }, [owner, repo, loadWorkflows]);

  const runWorkflow = async (workflowId: number) => {
    setRunningWorkflowId(workflowId);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/github/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, workflowId, ref: ref || "main" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to dispatch workflow");
      }
      setMessage("Workflow dispatched successfully.");
      await loadWorkflows();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to dispatch workflow",
      );
    } finally {
      setRunningWorkflowId(null);
    }
  };

  const actOnRun = async (runId: number, action: "rerun" | "cancel") => {
    setActingRunId(runId);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/github/workflows/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, runId, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Failed to ${action} run`);
      }
      setMessage(
        action === "rerun"
          ? "Run re-queued successfully."
          : "Run cancelled successfully.",
      );
      await loadWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} run`);
    } finally {
      setActingRunId(null);
    }
  };

  const runSelectorBackfill = async () => {
    setOpsBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/tickets/selector-ids/backfill", {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "Failed to backfill selector IDs");
      }

      setMessage(
        `Selector ID backfill complete: ${body.updated ?? 0} updated out of ${body.total ?? 0} tickets.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to backfill selector IDs",
      );
    } finally {
      setOpsBusy(false);
    }
  };

  const assignExistingPr = async () => {
    const parsedSelector = Number.parseInt(selectorInput, 10);
    const parsedPrNumber = Number.parseInt(assignPrNumber, 10);

    if (!Number.isFinite(parsedSelector) || parsedSelector <= 0) {
      setError("Selector ID must be a valid positive number.");
      return;
    }

    if (!assignOwner.trim() || !assignRepo.trim()) {
      setError("Owner and repo are required.");
      return;
    }

    if (!Number.isFinite(parsedPrNumber) || parsedPrNumber <= 0) {
      setError("PR number must be a valid positive number.");
      return;
    }

    setOpsBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/github/pull-requests/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: assignOwner.trim(),
          repo: assignRepo.trim(),
          number: parsedPrNumber,
          selectorId: parsedSelector,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to assign PR to ticket");
      }

      setMessage(
        `PR #${parsedPrNumber} linked to ticket selector #${parsedSelector}.`,
      );
      setAssignPrNumber("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to assign PR to ticket",
      );
    } finally {
      setOpsBusy(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!canManageWorkflows) {
    return (
      <DashboardLayout>
        <div className="border border-amber-200 bg-amber-50 p-4 text-amber-900">
          Only admin and super admin users can access workflow orchestration.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-white">
            <Workflow className="h-7 w-7 text-indigo-500" /> GitHub Workflows
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            GitHub Actions-style workflow and run feed with direct run controls.
          </p>
        </div>

        <MonitoringTabs />

        {isSuperAdmin ? (
          <div className="grid gap-4 border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                  Ticket selector operations
                </h2>
                <p className="mt-1 text-xs text-indigo-800/90 dark:text-indigo-300/90">
                  One-time operation to assign selector IDs to all existing
                  tickets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void runSelectorBackfill();
                }}
                disabled={opsBusy}
                className="inline-flex items-center gap-2 border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
              >
                {opsBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Backfill selector IDs
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                  Link existing PR to ticket
                </h2>
                <p className="mt-1 text-xs text-indigo-800/90 dark:text-indigo-300/90">
                  Use selector ID + repo + PR number to connect legacy PRs.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={selectorInput}
                  onChange={(event) => setSelectorInput(event.target.value)}
                  placeholder="Selector ID (e.g. 10110)"
                  className="border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
                <input
                  value={assignPrNumber}
                  onChange={(event) => setAssignPrNumber(event.target.value)}
                  placeholder="PR number"
                  className="border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
                <input
                  value={assignOwner}
                  onChange={(event) => setAssignOwner(event.target.value)}
                  placeholder="Owner"
                  className="border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
                <input
                  value={assignRepo}
                  onChange={(event) => setAssignRepo(event.target.value)}
                  placeholder="Repo"
                  className="border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void assignExistingPr();
                }}
                disabled={opsBusy}
                className="inline-flex items-center gap-2 border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
              >
                {opsBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Link existing PR
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Repository
            </label>
            <div className="mt-1">
              <SelectMenu
                value={`${owner}/${repo}`}
                onChange={(value) => {
                  const [nextOwner, nextRepo] = value.split("/");
                  setOwner(nextOwner || "");
                  setRepo(nextRepo || "");
                  const found = repos.find(
                    (r) => r.owner?.login === nextOwner && r.name === nextRepo,
                  );
                  setRef(found?.default_branch || "main");
                }}
                options={repos.map((r) => ({
                  value: `${r.owner?.login}/${r.name}`,
                  label: r.full_name,
                }))}
                disabled={loadingRepos || repos.length === 0}
                className="w-full"
                triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Owner
            </label>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value.trim())}
              className="mt-1 w-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              placeholder="org-or-user"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Repo
            </label>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value.trim())}
              className="mt-1 w-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              placeholder="repository-name"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Ref
            </label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value.trim())}
              className="mt-1 w-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              placeholder="main"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void loadRepos();
              }}
              className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Refresh Repos
            </button>
            <button
              type="button"
              onClick={() => {
                void loadWorkflows();
              }}
              className="border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              disabled={loadingWorkflows || !owner || !repo}
            >
              {loadingWorkflows ? "Loading..." : "Refresh Workflows"}
            </button>
            {selectedRepo?.full_name ? (
              <a
                href={`https://github.com/${selectedRepo.full_name}/actions`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Open Actions <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="overflow-hidden border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Workflows
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Auto-refreshes every 20s
              {lastUpdated ? ` • Last updated ${lastUpdated}` : ""}
            </p>
          </div>

          {loadingWorkflows ? (
            <div className="space-y-px">
              <SkeletonLine className="h-14 w-full rounded-none" />
              <SkeletonLine className="h-14 w-full rounded-none" />
              <SkeletonLine className="h-14 w-full rounded-none" />
              <SkeletonLine className="h-14 w-full rounded-none" />
            </div>
          ) : workflows.length === 0 ? (
            <EmptyState
              title="No workflows found"
              description="This repository has no GitHub Actions workflows."
              icon={<Workflow className="h-6 w-6" aria-hidden="true" />}
              className="border-0 bg-transparent shadow-none"
            />
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {workflows.map((wf) => {
                const latest = (runByWorkflow.get(wf.id) ?? [])[0];
                return (
                  <li key={wf.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {latest ? (
                            statusIcon(latest.status, latest.conclusion)
                          ) : (
                            <Circle className="h-4 w-4 text-gray-400" />
                          )}
                          <p className="truncate font-medium text-gray-900 dark:text-white">
                            {wf.name}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{wf.path}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {latest
                            ? `Run #${latest.run_number} • ${latest.status}${latest.conclusion ? ` (${latest.conclusion})` : ""} • ${latest.head_branch || "-"}`
                            : `State: ${wf.state}`}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Updated: {new Date(wf.updated_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {latest ? (
                          <a
                            href={latest.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Open run <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            void runWorkflow(wf.id);
                          }}
                          disabled={runningWorkflowId === wf.id}
                          className="inline-flex items-center gap-1 border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                        >
                          {runningWorkflowId === wf.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Run
                        </button>

                        {latest ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actOnRun(latest.id, "rerun");
                            }}
                            disabled={actingRunId === latest.id}
                            className="inline-flex items-center gap-1 border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <RotateCcw className="h-4 w-4" /> Rerun
                          </button>
                        ) : null}

                        {latest &&
                        (latest.status === "queued" ||
                          latest.status === "in_progress") ? (
                          <button
                            type="button"
                            onClick={() => {
                              void actOnRun(latest.id, "cancel");
                            }}
                            disabled={actingRunId === latest.id}
                            className="inline-flex items-center gap-1 border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            <Square className="h-4 w-4" /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-hidden border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Recent Runs
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Latest executed workflows in this repository.
            </p>
          </div>

          {runs.length === 0 ? (
            <EmptyState
              title="No workflow runs yet"
              description="Workflow activity will appear here after the first run."
              icon={<Workflow className="h-6 w-6" aria-hidden="true" />}
              className="border-0 bg-transparent shadow-none"
            />
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {runs.map((run) => (
                <li key={run.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {statusIcon(run.status, run.conclusion)}
                        <p className="font-medium text-gray-900 dark:text-white">
                          {workflowNameById.get(run.workflow_id) || run.name}
                        </p>
                        <span className="text-xs text-gray-500">
                          #{run.run_number}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {run.head_branch || "-"} • {run.status}
                        {run.conclusion ? ` (${run.conclusion})` : ""}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Started {new Date(run.created_at).toLocaleString()} •
                        Updated {new Date(run.updated_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={run.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          void actOnRun(run.id, "rerun");
                        }}
                        disabled={actingRunId === run.id}
                        className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <RotateCcw className="h-3 w-3" /> Rerun
                      </button>
                      {(run.status === "queued" ||
                        run.status === "in_progress") && (
                        <button
                          type="button"
                          onClick={() => {
                            void actOnRun(run.id, "cancel");
                          }}
                          disabled={actingRunId === run.id}
                          className="inline-flex items-center gap-1 border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <Square className="h-3 w-3" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
