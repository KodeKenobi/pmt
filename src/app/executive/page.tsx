"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { SelectMenu } from "@/components/SelectMenu";
import { onRealtimeChange } from "@/lib/realtime-events";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";

type ExecutivePayload = {
  ticketsByStatus: { status: string; count: number }[];
  projectsByHealth: { health: string; count: number }[];
  projectsByStatus: { status: string; count: number }[];
  openTickets: number;
  completedPerWeek: { week: string; count: number }[];
  teams: { id: string; name: string; _count: { tickets: number } }[];
  teamMetrics: Array<{
    id: string;
    name: string;
    totalTickets: number;
    openTickets: number;
    overdueTickets: number;
    urgentOpenTickets: number;
    completedLast7Days: number;
    avgCycleDays: number | null;
  }>;
  teamStatusBreakdown: Array<{
    teamId: string;
    teamName: string;
    status: string;
    count: number;
  }>;
  teamCompletedPerWeek: Array<{
    week: string;
    teamId: string;
    teamName: string;
    count: number;
  }>;
  memberMetrics: Array<{
    id: string;
    name: string;
    email: string;
    assignedTotal: number;
    assignedOpen: number;
    overdueOpen: number;
    urgentOpen: number;
    inProgress: number;
    revisions: number;
    clientReview: number;
    completedLast7Days: number;
    avgCycleDays: number | null;
  }>;
  unassignedOpenTickets: number;
  githubAnalytics: {
    connectedRepos: number;
    linkedPullRequests: number;
    openPullRequests: number;
    mergedPullRequests: number;
    closedPullRequests: number;
    mergedLast7Days: number;
    staleOpenPullRequests: number;
    pullRequestsByState: Array<{ state: string; count: number }>;
    mergedPerWeek: Array<{ week: string; count: number }>;
    selectedRepoKey: string;
    repoOptions: Array<{ value: string; label: string }>;
    repoBreakdown: Array<{
      repo: string;
      linked: number;
      open: number;
      merged: number;
      closed: number;
      mergedLast7Days: number;
      staleOpen: number;
    }>;
  };
  selectedTeamIds: string[];
  selectedTeamNames: string[];
};

type ExecutivePreset = {
  id: string;
  name: string;
  teamId: string;
  compareTeamId: string;
};

const PRESETS_KEY = "pmt.executive.presets.v1";
const FILTERS_KEY = "pmt.executive.filters.v1";
const VIS_COLORS = ["#1B2A4A", "#3498DB", "#F39C12", "#2ECC71", "#E74C3C"];

function ExecutiveSkeleton() {
  return (
    <div className="w-full space-y-7" aria-label="Loading executive analytics">
      <div className="h-44 animate-pulse rounded-2xl border border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-[#1A1F2E]" />
      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1A1F2E] md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded-md bg-brand-100 dark:bg-[#0F1E38]"
          />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1A1F2E]"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1A1F2E]"
          />
        ))}
      </div>
    </div>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toRepoUrl(repoKey: string) {
  return `https://github.com/${repoKey}`;
}

function toRepoPullsUrl(repoKey: string, query?: string) {
  if (!query) return `${toRepoUrl(repoKey)}/pulls`;
  return `${toRepoUrl(repoKey)}/pulls?q=${encodeURIComponent(query)}`;
}

export default function ExecutivePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ExecutivePayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [teamId, setTeamId] = useState("all");
  const [compareTeamId, setCompareTeamId] = useState("");
  const [githubRepo, setGithubRepo] = useState("all");
  const [presets, setPresets] = useState<ExecutivePreset[]>([]);

  const loadExecutiveData = useCallback(async () => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const params = new URLSearchParams();
      if (teamId && teamId !== "all") params.set("teamId", teamId);
      if (compareTeamId && compareTeamId !== teamId) {
        params.set("compareTeamId", compareTeamId);
      }
      if (githubRepo && githubRepo !== "all") {
        params.set("githubRepo", githubRepo);
      }
      const qs = params.toString();
      const res = await fetch(`/api/analytics/executive${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      const payload = (await res.json()) as ExecutivePayload;
      setData(payload);
      setError("");
    } catch {
      setError(
        controller.signal.aborted
          ? "Executive analytics took too long to load. Please try again."
          : "Could not load executive analytics.",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [teamId, compareTeamId, githubRepo]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;
    void loadExecutiveData();
  }, [authLoading, user, loadExecutiveData]);

  useEffect(() => {
    if (compareTeamId && compareTeamId === teamId) {
      setCompareTeamId("");
    }
  }, [teamId, compareTeamId]);

  useEffect(() => {
    if (!data) return;
    if (githubRepo === "all") return;
    const exists = data.githubAnalytics.repoOptions.some(
      (repo) => repo.value === githubRepo,
    );
    if (!exists) {
      setGithubRepo("all");
    }
  }, [data, githubRepo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawFilters = window.localStorage.getItem(FILTERS_KEY);
      if (rawFilters) {
        const parsed = JSON.parse(rawFilters) as {
          teamId?: string;
          compareTeamId?: string;
        };
        if (parsed.teamId) setTeamId(parsed.teamId);
        if (parsed.compareTeamId) setCompareTeamId(parsed.compareTeamId);
      }
      const rawPresets = window.localStorage.getItem(PRESETS_KEY);
      if (rawPresets) {
        const parsed = JSON.parse(rawPresets) as ExecutivePreset[];
        if (Array.isArray(parsed)) setPresets(parsed);
      }
    } catch {
      // Ignore malformed local storage values.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ teamId, compareTeamId }),
    );
  }, [teamId, compareTeamId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (
        detail.table !== "Ticket" &&
        detail.table !== "Project" &&
        detail.table !== "Team" &&
        detail.table !== "Client" &&
        detail.table !== "GithubRepo" &&
        detail.table !== "GithubPullRequest" &&
        detail.table !== "GithubBranch"
      ) {
        return;
      }
      void loadExecutiveData();
    });

    return unsubscribe;
  }, [authLoading, user, loadExecutiveData]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadExecutiveData();
      }
    };

    const handleFocus = () => {
      void loadExecutiveData();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [authLoading, user, loadExecutiveData]);

  const goToTickets = (filters: {
    teamId?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    allTeams?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters.teamId) params.set("teamId", filters.teamId);
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.allTeams) params.set("allTeams", "1");
    router.push(`/tickets${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const toCurrentTeamScope = () => {
    if (teamId && teamId !== "all") {
      return { teamId };
    }
    return { allTeams: true };
  };

  const saveCurrentAsPreset = () => {
    const name = window.prompt("Preset name", "New executive preset");
    if (!name) return;
    const preset: ExecutivePreset = {
      id: `${Date.now()}`,
      name: name.trim(),
      teamId,
      compareTeamId,
    };
    setPresets((current) => [preset, ...current].slice(0, 8));
  };

  const applyPreset = (preset: ExecutivePreset) => {
    setTeamId(preset.teamId || "all");
    setCompareTeamId(preset.compareTeamId || "");
  };

  const deletePreset = (presetId: string) => {
    setPresets((current) => current.filter((preset) => preset.id !== presetId));
  };

  const completedWindowTotal =
    data?.completedPerWeek.reduce((acc, item) => acc + item.count, 0) ?? 0;

  const peopleRows = useMemo(() => {
    if (!data) return [];
    return [...data.memberMetrics].sort((a, b) => {
      if (b.assignedOpen !== a.assignedOpen) {
        return b.assignedOpen - a.assignedOpen;
      }
      if (b.urgentOpen !== a.urgentOpen) {
        return b.urgentOpen - a.urgentOpen;
      }
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  const statusDonutData = useMemo(() => {
    if (!data) return [];
    return data.ticketsByStatus.map((item) => ({
      key: item.status,
      name: formatStatusLabel(item.status),
      value: item.count,
    }));
  }, [data]);

  const completionTrendData = useMemo(() => {
    if (!data) return [];
    return data.completedPerWeek.map((item) => ({
      week: item.week.slice(5),
      completed: item.count,
    }));
  }, [data]);

  const pressureRadarData = useMemo(() => {
    return peopleRows.slice(0, 6).map((person) => ({
      member: person.name.split(" ")[0] || person.name,
      open: person.assignedOpen,
      overdue: person.overdueOpen,
      urgent: person.urgentOpen,
    }));
  }, [peopleRows]);

  const githubStateData = useMemo(() => {
    if (!data) return [];
    return data.githubAnalytics.pullRequestsByState.map((item) => ({
      name: formatStatusLabel(item.state),
      value: item.count,
    }));
  }, [data]);

  const githubMergedTrendData = useMemo(() => {
    if (!data) return [];
    return data.githubAnalytics.mergedPerWeek.map((item) => ({
      week: item.week.slice(5),
      merged: item.count,
    }));
  }, [data]);

  const githubRepoBreakdownData = useMemo(() => {
    if (!data) return [];
    return data.githubAnalytics.repoBreakdown.slice(0, 8).map((item) => ({
      repo: item.repo,
      linked: item.linked,
      open: item.open,
      merged: item.merged,
      staleOpen: item.staleOpen,
    }));
  }, [data]);

  const selectedRepoGithubKey = useMemo(() => {
    if (!data || githubRepo === "all") return "";
    const selected = data.githubAnalytics.repoOptions.find(
      (repo) => repo.value === githubRepo,
    );
    return selected?.value ?? "";
  }, [data, githubRepo]);

  const renderStatusTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const current = payload[0]?.payload as
      | { key?: string; name?: string; value?: number }
      | undefined;
    if (!current) return null;

    const statusKey = current.key ?? "";
    const contributors = peopleRows
      .map((person) => {
        let contribution = 0;
        if (statusKey === "COMPLETE") contribution = person.completedLast7Days;
        else if (statusKey === "IN_PROGRESS") contribution = person.inProgress;
        else if (statusKey === "REVISIONS") contribution = person.revisions;
        else if (statusKey === "CLIENT_REVIEW")
          contribution = person.clientReview;
        else contribution = person.assignedOpen;

        return { name: person.name, contribution };
      })
      .filter((item) => item.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 4);

    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {current.name}
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          Tickets: {current.value ?? 0}
        </p>
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Top contributors
          </p>
          {contributors.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No contributor data
            </p>
          ) : (
            contributors.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="text-gray-700 dark:text-gray-200">
                  {item.name}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {item.contribution}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand-600" />
      </div>
    );
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <p className="text-gray-600">
          Executive analytics are only available to department heads.
        </p>
      </DashboardLayout>
    );
  }

  if (isLoading && !data) {
    return (
      <DashboardLayout>
        <ExecutiveSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <style>{`
        .dark .recharts-legend-item-text {
          color: #d1d5db !important;
        }
      `}</style>
      <div className="w-full space-y-7">
        <div className="relative overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-r from-brand-50 via-white to-brand-100 p-6 shadow-sm dark:border-brand-500/30 dark:from-[#0F1419] dark:via-[#1A1F2E] dark:to-[#0F1E38]">
          <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-brand-200/30 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -right-10 h-44 w-44 rounded-full bg-brand-500/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                Executive analytics cockpit
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                Monitor delivery health across teams, compare throughput, and
                drill directly into the tickets that need action.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 self-start lg:self-auto">
              <div className="w-32 rounded-none border border-brand-200/70 bg-white/80 px-3 py-1 text-center dark:border-brand-500/30 dark:bg-[#1A1F2E]/80">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Open
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data?.openTickets ?? 0)}
                </p>
              </div>
              <div className="w-32 rounded-none border border-brand-200/70 bg-white/80 px-3 py-1 text-center dark:border-brand-500/30 dark:bg-[#1A1F2E]/80">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Teams
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {data?.teams.length ?? 0}
                </p>
              </div>
              <div className="w-32 rounded-none border border-brand-200/70 bg-white/80 px-3 py-1 text-center dark:border-brand-500/30 dark:bg-[#1A1F2E]/80">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Done
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatCompact(completedWindowTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {data && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Filters and saved views
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tip: click chart bars to open filtered tickets
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SelectMenu
                value={teamId}
                onChange={(value) => setTeamId(value)}
                options={[
                  { value: "all", label: "All teams" },
                  ...data.teams.map((team) => ({
                    value: team.id,
                    label: team.name,
                  })),
                ]}
                className="w-full"
                triggerClassName="border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
              <SelectMenu
                value={compareTeamId}
                onChange={(value) => setCompareTeamId(value)}
                options={[
                  { value: "", label: "No comparison" },
                  ...data.teams
                    .filter((team) => team.id !== teamId)
                    .map((team) => ({
                      value: team.id,
                      label: `Compare: ${team.name}`,
                    })),
                ]}
                className="w-full"
                triggerClassName="border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
              <SelectMenu
                value={githubRepo}
                onChange={(value) => setGithubRepo(value)}
                options={[
                  { value: "all", label: "All repos" },
                  ...(data.githubAnalytics.repoOptions ?? []),
                ]}
                className="w-full"
                triggerClassName="border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveCurrentAsPreset}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                Save current view
              </button>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-white dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(preset.id)}
                    className="border-l border-gray-200 px-2 py-1.5 text-xs text-gray-500 transition hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                    aria-label={`Delete preset ${preset.name}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Open tickets
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data.openTickets)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  People carrying work
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {peopleRows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Unassigned open
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data.unassignedOpenTickets)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Open PRs
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data.githubAnalytics.openPullRequests)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Merged (7d)
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data.githubAnalytics.mergedLast7Days)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Connected repos
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(data.githubAnalytics.connectedRepos)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Ticket status mix
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Distribution by current workflow state.
                </p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={86}
                        paddingAngle={3}
                      >
                        {statusDonutData.map((_, index) => (
                          <Cell
                            key={`status-cell-${index}`}
                            fill={VIS_COLORS[index % VIS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={renderStatusTooltip} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Completion trend
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Weekly completed ticket flow.
                </p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={completionTrendData}>
                      <defs>
                        <linearGradient
                          id="completionGlow"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3498DB"
                            stopOpacity={0.45}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3498DB"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 6"
                        vertical={false}
                        stroke="#E5E7EB"
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="completed"
                        stroke="#3498DB"
                        strokeWidth={2.5}
                        fill="url(#completionGlow)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Workload pressure map
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Top members by open load and risk signals.
                </p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={pressureRadarData}>
                      <PolarGrid stroke="#E5E7EB" />
                      <PolarAngleAxis
                        dataKey="member"
                        tick={{ fontSize: 11 }}
                      />
                      <PolarRadiusAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Radar
                        name="Open"
                        dataKey="open"
                        stroke="#1B2A4A"
                        fill="#1B2A4A"
                        fillOpacity={0.35}
                      />
                      <Radar
                        name="Overdue"
                        dataKey="overdue"
                        stroke="#E74C3C"
                        fill="#E74C3C"
                        fillOpacity={0.18}
                      />
                      <Radar
                        name="Urgent"
                        dataKey="urgent"
                        stroke="#F39C12"
                        fill="#F39C12"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Repository breakdown
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                PR activity by repository. Use the repo filter above for a
                single-repo view.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      <th className="py-2 pr-3">Repo</th>
                      <th className="py-2 pr-3">Linked</th>
                      <th className="py-2 pr-3">Open</th>
                      <th className="py-2 pr-3">Merged</th>
                      <th className="py-2 pr-3">Stale open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {githubRepoBreakdownData.map((repo) => (
                      <tr
                        key={repo.repo}
                        className="group border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-white/5"
                      >
                        <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <a
                              href={toRepoUrl(repo.repo)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline-offset-2 hover:underline"
                            >
                              {repo.repo}
                            </a>
                            <a
                              href={toRepoPullsUrl(repo.repo)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 opacity-0 transition group-hover:opacity-100 dark:border-gray-700 dark:text-gray-300"
                            >
                              PRs
                            </a>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                          {repo.linked}
                        </td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                          {repo.open}
                        </td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                          {repo.merged}
                        </td>
                        <td className="py-2 pr-3 text-red-700 dark:text-red-300">
                          <a
                            href={toRepoPullsUrl(repo.repo, "is:pr is:open")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            {repo.staleOpen}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  GitHub PR state mix
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Open vs merged vs closed in current scope.
                </p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={githubStateData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={84}
                        paddingAngle={3}
                      >
                        {githubStateData.map((_, index) => (
                          <Cell
                            key={`gh-state-cell-${index}`}
                            fill={VIS_COLORS[index % VIS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  GitHub merge trend
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Weekly merged pull requests.
                </p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={githubMergedTrendData}>
                      <defs>
                        <linearGradient
                          id="ghMergeGlow"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#2ECC71"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#2ECC71"
                            stopOpacity={0.06}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 6"
                        vertical={false}
                        stroke="#E5E7EB"
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="merged"
                        stroke="#2ECC71"
                        strokeWidth={2.5}
                        fill="url(#ghMergeGlow)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  GitHub health signals
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Useful PR indicators for executive scan.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="group relative rounded-xl border border-gray-200 bg-gray-50 p-3 transition-all hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-brand-500/50 dark:hover:bg-brand-600/10">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Linked PRs
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                      {formatCompact(data.githubAnalytics.linkedPullRequests)}
                    </p>
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                      Includes open, merged, and closed pull requests in the
                      current scope.
                    </div>
                    <div className="mt-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {selectedRepoGithubKey ? (
                        <a
                          href={toRepoPullsUrl(selectedRepoGithubKey)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-500 dark:text-brand-300 dark:hover:bg-brand-600/20"
                        >
                          Open selected repo PRs
                        </a>
                      ) : (
                        <span className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          Select a repo filter for direct PR links
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="group relative rounded-xl border border-red-200 bg-red-50 p-3 transition-all hover:border-red-300 hover:bg-red-100/60 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:border-red-800 dark:hover:bg-red-950/30">
                    <p className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
                      Stale open PRs (&gt; 7d)
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-red-800 dark:text-red-200">
                      {formatCompact(
                        data.githubAnalytics.staleOpenPullRequests,
                      )}
                    </p>
                    <div className="mt-2 text-[11px] text-red-700/90 dark:text-red-300/90">
                      Pull requests that have stayed open for more than seven
                      days.
                    </div>
                    <div className="mt-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {selectedRepoGithubKey ? (
                        <a
                          href={toRepoPullsUrl(
                            selectedRepoGithubKey,
                            "is:pr is:open sort:updated-asc",
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          Review stale queue
                        </a>
                      ) : (
                        <span className="rounded border border-red-300/60 px-2 py-1 text-[11px] text-red-700/80 dark:border-red-800 dark:text-red-300/80">
                          Select a repo filter to open stale PR queue
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    People accountability board
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Who owns what right now, with urgency and delivery signals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goToTickets({ ...toCurrentTeamScope() })}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Open all scoped tickets
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      <th className="py-2 pr-3">Owner</th>
                      <th className="py-2 pr-3">Open</th>
                      <th className="py-2 pr-3">Urgent</th>
                      <th className="py-2 pr-3">Overdue</th>
                      <th className="py-2 pr-3">In progress</th>
                      <th className="py-2 pr-3">Revisions</th>
                      <th className="py-2 pr-3">Client review</th>
                      <th className="py-2 pr-3">Done 7d</th>
                      <th className="py-2 pr-3">Avg cycle</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peopleRows.map((person) => (
                      <tr
                        key={person.id}
                        className="border-b border-gray-100 text-gray-700 dark:border-gray-800 dark:text-gray-200"
                      >
                        <td className="py-3 pr-3">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {person.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {person.email}
                          </p>
                        </td>
                        <td className="py-3 pr-3 font-semibold">
                          {person.assignedOpen}
                        </td>
                        <td className="py-3 pr-3">
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {person.urgentOpen}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            {person.overdueOpen}
                          </span>
                        </td>
                        <td className="py-3 pr-3">{person.inProgress}</td>
                        <td className="py-3 pr-3">{person.revisions}</td>
                        <td className="py-3 pr-3">{person.clientReview}</td>
                        <td className="py-3 pr-3">
                          {person.completedLast7Days}
                        </td>
                        <td className="py-3 pr-3">
                          {person.avgCycleDays === null
                            ? "-"
                            : `${person.avgCycleDays}d`}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                goToTickets({
                                  ...toCurrentTeamScope(),
                                  assigneeId: person.id,
                                })
                              }
                              className="rounded-md border border-gray-200 px-2 py-1 text-xs transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                            >
                              Workload
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                goToTickets({
                                  ...toCurrentTeamScope(),
                                  assigneeId: person.id,
                                  priority: "URGENT",
                                })
                              }
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
                            >
                              Urgent
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Delivery velocity
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(completedWindowTotal)} completed
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Completed in recent reporting window for current team scope.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Work at risk
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(
                    peopleRows.reduce(
                      (acc, person) => acc + person.overdueOpen,
                      0,
                    ),
                  )}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Overdue open tickets currently assigned.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Urgent pressure
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatCompact(
                    peopleRows.reduce(
                      (acc, person) => acc + person.urgentOpen,
                      0,
                    ),
                  )}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Urgent open tickets currently assigned.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
