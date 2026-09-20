"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
} from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { SelectMenu } from "@/components/SelectMenu";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { cn } from "@/lib/utils";
import {
  IconContext,
  PlusIcon as Plus,
  CalendarBlankIcon as CalendarIcon,
  PencilSimpleIcon as Edit3,
} from "@phosphor-icons/react";

type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED";

type Sprint = {
  id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  teamId: string;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
};

type Ticket = {
  id: string;
  title: string;
  status?: string;
  sprintId?: string | null;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function toDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatShortDateLabel(value: string) {
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}

// ─── Sprint Timeline component ──────────────────────────────────────────────

const STATUS_COLORS: Record<
  string,
  { bar: string; text: string; dot: string }
> = {
  PLANNED: {
    bar: "bg-slate-400/20 border border-slate-300 dark:border-slate-600 dark:bg-slate-700/20",
    text: "text-slate-700 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  ACTIVE: {
    bar: "bg-brand-600/20 border border-brand-400/50 dark:border-brand-500/50 dark:bg-brand-600/30",
    text: "text-brand-800 dark:text-brand-200",
    dot: "bg-brand-500 dark:bg-brand-400",
  },
  COMPLETED: {
    bar: "bg-emerald-500/15 border border-emerald-400/40 dark:border-emerald-600/50 dark:bg-emerald-700/20",
    text: "text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  CLOSED: {
    bar: "bg-gray-200/60 border border-gray-300 dark:border-gray-700 dark:bg-gray-700/40",
    text: "text-gray-500 dark:text-gray-400",
    dot: "bg-gray-400 dark:bg-gray-600",
  },
};

const DAY_W = 44; // px per day column

type TimelineSprint = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  teamId: string;
};

function SprintTimeline({
  sprints,
  teams,
}: {
  sprints: TimelineSprint[];
  teams: { id: string; name: string }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute visible date range: earliest start – 2 days to latest end + 2 days
  const { days, rangeStart } = useMemo(() => {
    const dates = sprints.flatMap((s) => [
      new Date(s.startsAt),
      new Date(s.endsAt),
    ]);
    const minDate = startOfDay(
      new Date(Math.min(...dates.map((d) => d.getTime()))),
    );
    const maxDate = startOfDay(
      new Date(Math.max(...dates.map((d) => d.getTime()))),
    );
    const start = addDays(minDate, -2);
    const end = addDays(maxDate, 2);
    const total = differenceInCalendarDays(end, start) + 1;
    const dayList = Array.from({ length: total }, (_, i) => addDays(start, i));
    return { days: dayList, rangeStart: start };
  }, [sprints]);

  // Scroll to today or the first sprint start on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const today = startOfDay(new Date());
    const offset = differenceInCalendarDays(today, rangeStart);
    const scrollX = Math.max(0, offset * DAY_W - 120);
    scrollRef.current.scrollLeft = scrollX;
  }, [rangeStart]);

  const teamById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams],
  );

  const today = startOfDay(new Date());
  const todayOffset = differenceInCalendarDays(today, rangeStart);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Timeline
        </p>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          {(["PLANNED", "ACTIVE", "COMPLETED", "CLOSED"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  STATUS_COLORS[s].dot,
                )}
              />
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Scrollable grid */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto"
        style={{ cursor: "default" }}
      >
        {/* Total width = days * DAY_W */}
        <div style={{ width: days.length * DAY_W, minWidth: "100%" }}>
          {/* Day header row */}
          <div
            className="sticky top-0 z-10 flex border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-gray-900"
            style={{ width: days.length * DAY_W }}
          >
            {days.map((day, i) => {
              const isToday = differenceInCalendarDays(day, today) === 0;
              const isMonday = day.getDay() === 1;
              const showLabel = isMonday || i === 0 || day.getDate() === 1;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex h-9 shrink-0 flex-col items-center justify-center border-r border-slate-100 text-[10px] dark:border-slate-700",
                    isToday
                      ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                      : "text-gray-400",
                  )}
                  style={{ width: DAY_W }}
                >
                  {showLabel ? (
                    <>
                      <span className="font-semibold uppercase tracking-wide">
                        {format(day, "MMM")}
                      </span>
                      <span>{format(day, "d")}</span>
                    </>
                  ) : (
                    <span>{format(day, "d")}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sprint rows */}
          <div className="relative py-2">
            {/* Today line */}
            {todayOffset >= 0 && todayOffset < days.length ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-brand-400/60"
                style={{ left: todayOffset * DAY_W + DAY_W / 2 }}
              />
            ) : null}

            {sprints.map((sprint) => {
              const start = startOfDay(new Date(sprint.startsAt));
              const end = startOfDay(new Date(sprint.endsAt));
              const left = differenceInCalendarDays(start, rangeStart);
              const width = differenceInCalendarDays(end, start) + 1;
              const colors =
                STATUS_COLORS[sprint.status] ?? STATUS_COLORS.PLANNED;
              const teamName = teamById.get(sprint.teamId) ?? "";

              return (
                <div
                  key={sprint.id}
                  className="relative flex h-14 items-center"
                  style={{ width: days.length * DAY_W }}
                >
                  {/* Column stripes */}
                  {days.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 h-full border-r border-slate-100/60 dark:border-slate-700/40",
                        i % 7 >= 5 ? "bg-slate-50/60 dark:bg-slate-800/30" : "",
                      )}
                      style={{ left: i * DAY_W, width: DAY_W }}
                    />
                  ))}

                  {/* Sprint bar */}
                  <div
                    className={cn(
                      "absolute flex h-9 items-center gap-2 overflow-hidden rounded-lg px-3 py-1 shadow-sm",
                      colors.bar,
                    )}
                    style={{
                      left: left * DAY_W + 2,
                      width: Math.max(width * DAY_W - 4, 32),
                    }}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        colors.dot,
                      )}
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-[11px] font-semibold leading-tight",
                          colors.text,
                        )}
                      >
                        {sprint.name}
                      </p>
                      {teamName ? (
                        <p className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                          {teamName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const { user, loading: authLoading } = useAuth();
  const { teams, activeTeamId, setActiveTeamId, isAllTeams } = useTeam();

  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlogTickets, setBacklogTickets] = useState<Ticket[]>([]);
  const [sprintTicketsById, setSprintTicketsById] = useState<
    Record<string, Ticket[]>
  >({});
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);

  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const activeSprint = useMemo(
    () => sprints.find((sprint) => sprint.status === "ACTIVE") ?? null,
    [sprints],
  );

  const activeSprintTickets = useMemo(() => {
    if (!activeSprint) return [];
    return sprintTicketsById[activeSprint.id] ?? [];
  }, [activeSprint, sprintTicketsById]);

  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "USER";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const resolveTeamId = useCallback(() => {
    if (user?.role === "USER") return activeTeamId;
    if (user?.role === "SUPER_ADMIN") {
      if (isAllTeams) return "";
      return activeTeamId;
    }
    return "";
  }, [user, activeTeamId, isAllTeams]);

  const fetchSprints = useCallback(async () => {
    if (!user || !canManage) return;

    const teamId = resolveTeamId();
    if (!teamId) {
      setSprints([]);
      setBacklogTickets([]);
      setSprintTicketsById({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [sprintsRes, backlogRes] = await Promise.all([
        fetch(`/api/sprints?teamId=${teamId}`),
        fetch(`/api/tickets?teamId=${teamId}&backlogOnly=1`),
      ]);

      if (!sprintsRes.ok) {
        throw new Error("Failed to load sprints");
      }

      const sprintData = (await sprintsRes.json()) as Sprint[];
      const nextSprints = Array.isArray(sprintData) ? sprintData : [];
      setSprints(nextSprints);

      if (backlogRes.ok) {
        const backlogData = (await backlogRes.json()) as Ticket[];
        setBacklogTickets(Array.isArray(backlogData) ? backlogData : []);
      } else {
        setBacklogTickets([]);
      }

      const sprintTicketEntries = await Promise.all(
        nextSprints.map(async (sprint) => {
          const response = await fetch(
            `/api/tickets?teamId=${teamId}&sprintId=${sprint.id}`,
          );
          if (!response.ok) return [sprint.id, []] as const;
          const data = (await response.json()) as Ticket[];
          return [sprint.id, Array.isArray(data) ? data : []] as const;
        }),
      );

      setSprintTicketsById(Object.fromEntries(sprintTicketEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sprints");
      setSprints([]);
      setBacklogTickets([]);
      setSprintTicketsById({});
    } finally {
      setLoading(false);
    }
  }, [user, canManage, resolveTeamId]);

  useEffect(() => {
    if (authLoading) return;
    void fetchSprints();
  }, [authLoading, fetchSprints]);

  const createSprint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    const teamId = resolveTeamId();
    if (!teamId) {
      setError("Select a team first.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name,
          goal: goal || null,
          startsAt,
          endsAt,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to create sprint",
        );
      }

      setName("");
      setGoal("");
      setStartsAt("");
      setEndsAt("");
      setShowCreateSprintModal(false);
      await fetchSprints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sprint");
    } finally {
      setCreating(false);
    }
  };

  const runStatusAction = async (
    sprintId: string,
    action: "start" | "complete" | "close",
  ) => {
    setActionBusyId(sprintId);
    setError("");
    try {
      const response = await fetch(`/api/sprints/${sprintId}/${action}`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : `Failed to ${action} sprint`,
        );
      }
      await fetchSprints();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${action} sprint`,
      );
    } finally {
      setActionBusyId(null);
    }
  };

  const startEditSprint = (sprint: Sprint) => {
    setEditingSprintId(sprint.id);
    setEditName(sprint.name);
    setEditGoal(sprint.goal ?? "");
    setEditStartsAt(toDateInput(sprint.startsAt));
    setEditEndsAt(toDateInput(sprint.endsAt));
    setError("");
  };

  const cancelEditSprint = () => {
    setEditingSprintId(null);
    setEditName("");
    setEditGoal("");
    setEditStartsAt("");
    setEditEndsAt("");
  };

  const saveSprint = async () => {
    if (!editingSprintId) return;

    const nextName = editName.trim();
    const nextGoal = editGoal.trim();

    if (!nextName) {
      setError("Sprint name is required.");
      return;
    }

    if (!editStartsAt || !editEndsAt) {
      setError("Both start and end dates are required.");
      return;
    }

    if (editStartsAt > editEndsAt) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    setSavingEdit(true);
    setError("");
    try {
      const response = await fetch(`/api/sprints/${editingSprintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          goal: nextGoal || null,
          startsAt: editStartsAt,
          endsAt: editEndsAt,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update sprint",
        );
      }

      cancelEditSprint();
      await fetchSprints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sprint");
    } finally {
      setSavingEdit(false);
    }
  };

  const getAllowedStatusOptions = (status: SprintStatus) => {
    switch (status) {
      case "PLANNED":
        return ["PLANNED", "ACTIVE"] as SprintStatus[];
      case "ACTIVE":
        return ["ACTIVE", "COMPLETED"] as SprintStatus[];
      case "COMPLETED":
        return ["COMPLETED", "CLOSED"] as SprintStatus[];
      default:
        return ["CLOSED"] as SprintStatus[];
    }
  };

  const changeSprintStatus = async (
    sprintId: string,
    currentStatus: SprintStatus,
    nextStatus: SprintStatus,
  ) => {
    if (currentStatus === nextStatus) return;

    const key = `${currentStatus}->${nextStatus}`;
    if (key === "PLANNED->ACTIVE") {
      await runStatusAction(sprintId, "start");
      return;
    }
    if (key === "ACTIVE->COMPLETED") {
      await runStatusAction(sprintId, "complete");
      return;
    }
    if (key === "COMPLETED->CLOSED") {
      await runStatusAction(sprintId, "close");
      return;
    }

    setError("Unsupported status transition.");
  };

  const sprintDurationDays = (sprint: Sprint) => {
    return Math.max(
      1,
      differenceInCalendarDays(
        new Date(sprint.endsAt),
        new Date(sprint.startsAt),
      ) + 1,
    );
  };

  const sprintTicketStats = (sprint: Sprint) => {
    const tickets = sprintTicketsById[sprint.id] ?? [];
    const completed = tickets.filter(
      (ticket) => ticket.status === "COMPLETE",
    ).length;
    const inFlight = tickets.filter(
      (ticket) => ticket.status && ticket.status !== "COMPLETE",
    ).length;
    const total = tickets.length;
    const remaining = Math.max(0, total - completed);
    const completion = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      completed,
      inFlight,
      remaining,
      completion,
    };
  };

  const renderSprintEditPanel = (sprint: Sprint) => {
    const stats = sprintTicketStats(sprint);
    const canEditSprint = isSuperAdmin && sprint.status !== "CLOSED";

    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-gray-800">
        {canEditSprint && editingSprintId === sprint.id ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Sprint name
                </label>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:focus:border-brand-400"
                  placeholder="Sprint name"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Sprint goal
                </label>
                <textarea
                  value={editGoal}
                  onChange={(event) => setEditGoal(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:focus:border-brand-400"
                  placeholder="What should this sprint achieve?"
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Start date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start overflow-hidden border-[#E5E7EB] bg-white text-left font-normal text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600",
                        !editStartsAt && "text-gray-500 dark:text-gray-400",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {editStartsAt
                          ? formatShortDateLabel(editStartsAt)
                          : "Sprint start date"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDateInput(editStartsAt)}
                      onSelect={(date) =>
                        setEditStartsAt(date ? format(date, "yyyy-MM-dd") : "")
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="md:col-span-1">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  End date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start overflow-hidden border-[#E5E7EB] bg-white text-left font-normal text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600",
                        !editEndsAt && "text-gray-500 dark:text-gray-400",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {editEndsAt
                          ? formatShortDateLabel(editEndsAt)
                          : "Sprint end date"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDateInput(editEndsAt)}
                      onSelect={(date) =>
                        setEditEndsAt(date ? format(date, "yyyy-MM-dd") : "")
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveSprint()}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEdit ? "Saving..." : "Save sprint"}
              </button>
              <button
                type="button"
                onClick={cancelEditSprint}
                disabled={savingEdit}
                className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Sprint stats
            </p>
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Tickets
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.total}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Complete
                </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {stats.completed}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  In flight
                </span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {stats.inFlight}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Remaining
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.remaining}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>
                  {sprintDurationDays(sprint)} day sprint •{" "}
                  {sprint.status.toLowerCase()}
                </span>
                <span className="font-semibold text-gray-800 dark:text-gray-300">
                  {stats.completion}% done
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${stats.completion}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {sprint.completedAt
                  ? `Completed ${fmtDate(sprint.completedAt)}`
                  : "Sprint not completed yet"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600" />
      </div>
    );
  }

  if (!user || !canManage) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-sm text-gray-600 dark:text-gray-300">
          You do not have access to sprint planning.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <IconContext.Provider value={{ weight: "thin" }}>
      <DashboardLayout>
        <div className="space-y-6 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-gray-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Sprint Hub
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Plan, run, and close sprints while keeping backlog visible.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <button
                type="button"
                onClick={() => setShowCreateSprintModal(true)}
                className="btn-primary inline-flex items-center gap-2 self-start"
              >
                <Plus className="h-4 w-4" />
                <span>Create sprint</span>
              </button>
              {isSuperAdmin ? (
                <div className="w-full sm:w-72">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Team
                  </label>
                  <SelectMenu
                    value={activeTeamId || ""}
                    onChange={(value) => setActiveTeamId(value)}
                    options={teams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    }))}
                    className="w-full"
                    triggerClassName="border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              value={backlogTickets.length}
              label="Backlog tickets"
              sublabel="Unassigned"
              color="blue"
            />
            <MetricCard
              value={activeSprint ? activeSprint.name : "—"}
              label="Active sprint"
              sublabel={activeSprint ? "In progress" : "None running"}
              color="orange"
            />
            <MetricCard
              value={activeSprintTickets.length}
              label="Tickets in sprint"
              sublabel="Active sprint"
              color="purple"
            />
          </div>

          {/* ── Sprint Timeline ── */}
          {sprints.length > 0 ? (
            <SprintTimeline sprints={sprints} teams={teams} />
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Sprints
              </h2>
            </div>

            {loading ? (
              <div
                className="grid gap-4 xl:grid-cols-4"
                aria-label="Loading sprints"
              >
                {Array.from({ length: 4 }).map((_, columnIndex) => (
                  <section
                    key={`sprint-column-skeleton-${columnIndex}`}
                    className="rounded-xl border border-[#E5E7EB] bg-white p-3 dark:border-slate-700 dark:bg-gray-800"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <SkeletonLine className="w-20" />
                      <SkeletonLine className="h-6 w-7 rounded-full" />
                    </div>
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, cardIndex) => (
                        <div
                          key={`sprint-card-skeleton-${columnIndex}-${cardIndex}`}
                          className="rounded-lg border border-[#E5E7EB] p-3 dark:border-slate-700"
                        >
                          <SkeletonLine className="w-4/5" />
                          <SkeletonLine className="mt-3 w-full" />
                          <SkeletonLine className="mt-2 w-3/5" />
                          <SkeletonLine className="mt-4 h-2 w-full rounded-full" />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : sprints.length === 0 ? (
              <EmptyState
                title="No sprints yet"
                description="Create a sprint to plan upcoming work for this team."
                icon={<CalendarIcon className="h-6 w-6" aria-hidden="true" />}
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreateSprintModal(true)}
                    className="btn-primary"
                  >
                    Create sprint
                  </button>
                }
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-4">
                {(
                  ["PLANNED", "ACTIVE", "COMPLETED", "CLOSED"] as SprintStatus[]
                ).map((status) => {
                  const columnItems = sprints.filter(
                    (item) => item.status === status,
                  );
                  return (
                    <section
                      key={status}
                      className="rounded-xl border border-[#E5E7EB] bg-white p-3 dark:border-slate-700 dark:bg-gray-800"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {status.replace("_", " ")}
                        </p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {columnItems.length}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {columnItems.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[#E5E7EB] p-3 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
                            No sprints
                          </div>
                        ) : (
                          columnItems.map((sprint) => (
                            <article
                              key={sprint.id}
                              className="rounded-lg border border-[#E5E7EB] bg-white p-3 cursor-pointer hover:shadow-md transition-shadow hover:border-brand-400 dark:border-slate-700 dark:bg-gray-700 dark:hover:border-brand-400"
                              onClick={() =>
                                (window.location.href = `/sprints/${sprint.id}`)
                              }
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-brand-600 dark:text-white">
                                  {sprint.name}
                                </p>
                                {isSuperAdmin && sprint.status !== "CLOSED" ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditSprint(sprint);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] px-2 py-1 text-[11px] font-semibold text-gray-700 dark:border-slate-600 dark:text-gray-300 dark:hover:bg-gray-600"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Edit
                                  </button>
                                ) : null}
                              </div>
                              <div className="mt-2">
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Status
                                </label>
                                <SelectMenu
                                  value={sprint.status}
                                  onChange={(value) => {
                                    void changeSprintStatus(
                                      sprint.id,
                                      sprint.status,
                                      value as SprintStatus,
                                    );
                                  }}
                                  disabled={
                                    actionBusyId === sprint.id ||
                                    sprint.status === "CLOSED"
                                  }
                                  options={getAllowedStatusOptions(
                                    sprint.status,
                                  ).map((option) => ({
                                    value: option,
                                    label: option.replace("_", " "),
                                  }))}
                                  size="sm"
                                  className="w-full"
                                  triggerClassName="border-[#E5E7EB] bg-white text-gray-700 dark:border-slate-600 dark:bg-gray-600 dark:text-white"
                                />
                              </div>
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {fmtDate(sprint.startsAt)} to{" "}
                                {fmtDate(sprint.endsAt)}
                              </p>
                              {sprint.goal ? (
                                <p className="mt-2 line-clamp-3 text-xs text-gray-600 dark:text-gray-400">
                                  {sprint.goal}
                                </p>
                              ) : null}
                              {renderSprintEditPanel(sprint)}
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {showCreateSprintModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close create sprint modal"
              onClick={() => setShowCreateSprintModal(false)}
            />
            <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-[#0F1419]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Create Sprint
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Add a sprint name, goal, and schedule for the selected team.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateSprintModal(false)}
                  className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Close
                </button>
              </div>

              <form onSubmit={createSprint} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Sprint name"
                    required
                    className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 dark:bg-gray-950 dark:text-white"
                  />
                  <input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="Sprint goal (optional)"
                    className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-500 dark:bg-gray-950 dark:text-white"
                  />
                  <div className="md:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Start date
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start overflow-hidden border-[#E5E7EB] bg-white text-left font-normal text-gray-900 hover:bg-gray-50 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-900",
                            !startsAt && "text-gray-500 dark:text-gray-400",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {startsAt
                              ? formatShortDateLabel(startsAt)
                              : "Sprint start date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={fromDateInput(startsAt)}
                          onSelect={(date) =>
                            setStartsAt(date ? format(date, "yyyy-MM-dd") : "")
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="md:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      End date
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start overflow-hidden border-[#E5E7EB] bg-white text-left font-normal text-gray-900 hover:bg-gray-50 dark:bg-gray-950 dark:text-white dark:hover:bg-gray-900",
                            !endsAt && "text-gray-500 dark:text-gray-400",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {endsAt
                              ? formatShortDateLabel(endsAt)
                              : "Sprint end date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={fromDateInput(endsAt)}
                          onSelect={(date) =>
                            setEndsAt(date ? format(date, "yyyy-MM-dd") : "")
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateSprintModal(false)}
                    className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create sprint"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </DashboardLayout>
    </IconContext.Provider>
  );
}
