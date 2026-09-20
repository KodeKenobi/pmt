"use client";

import { cn } from "@/lib/utils";

export type MetricCardColor =
  | "blue"
  | "orange"
  | "purple"
  | "green"
  | "red"
  | "indigo"
  | "rose"
  | "emerald";

const COLOR_MAP: Record<
  MetricCardColor,
  { stripe: string; value: string; tag: string }
> = {
  blue: {
    stripe: "bg-blue-500",
    value: "text-blue-700 dark:text-blue-300",
    tag: "text-blue-500/70 dark:text-blue-400/60",
  },
  orange: {
    stripe: "bg-orange-400",
    value: "text-orange-700 dark:text-orange-300",
    tag: "text-orange-500/70 dark:text-orange-400/60",
  },
  purple: {
    stripe: "bg-purple-500",
    value: "text-purple-700 dark:text-purple-300",
    tag: "text-purple-500/70 dark:text-purple-400/60",
  },
  green: {
    stripe: "bg-green-500",
    value: "text-green-700 dark:text-green-300",
    tag: "text-green-500/70 dark:text-green-400/60",
  },
  red: {
    stripe: "bg-red-500",
    value: "text-red-700 dark:text-red-300",
    tag: "text-red-500/70 dark:text-red-400/60",
  },
  indigo: {
    stripe: "bg-indigo-500",
    value: "text-indigo-700 dark:text-indigo-300",
    tag: "text-indigo-500/70 dark:text-indigo-400/60",
  },
  rose: {
    stripe: "bg-rose-500",
    value: "text-rose-700 dark:text-rose-300",
    tag: "text-rose-500/70 dark:text-rose-400/60",
  },
  emerald: {
    stripe: "bg-emerald-500",
    value: "text-emerald-700 dark:text-emerald-300",
    tag: "text-emerald-500/70 dark:text-emerald-400/60",
  },
};

export interface MetricCardProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color: MetricCardColor;
  className?: string;
}

export function MetricCard({
  value,
  label,
  sublabel,
  color,
  className,
}: MetricCardProps) {
  const c = COLOR_MAP[color];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-gray-800",
        className,
      )}
    >
      {/* Left accent stripe */}
      <span className={cn("absolute inset-y-0 left-0 w-1", c.stripe)} />

      <p className={cn("text-lg font-bold tabular-nums leading-none", c.value)}>
        {value}
      </p>
      <p className="mt-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
      </p>
      {sublabel ? (
        <p
          className={cn(
            "mt-0.5 text-[9px] font-semibold uppercase tracking-widest",
            c.tag,
          )}
        >
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}
