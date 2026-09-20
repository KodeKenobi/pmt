import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function SkeletonText({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-4 bg-gray-200 rounded dark:bg-gray-700 animate-pulse",
        className,
      )}
    />
  );
}

export function SkeletonLine({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-3 bg-gray-200 rounded dark:bg-gray-700 animate-pulse w-full",
        className,
      )}
    />
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-gray-100 dark:bg-gray-800 rounded-lg p-4 animate-pulse",
        className,
      )}
    >
      <SkeletonText className="mb-3 w-3/4" />
      <SkeletonText className="mb-2 w-full h-3" />
      <SkeletonText className="w-1/2 h-3" />
    </div>
  );
}

export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "flex gap-4 items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded animate-pulse",
        className,
      )}
    >
      <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="flex-1">
        <SkeletonText className="mb-2 w-1/3" />
        <SkeletonText className="w-1/2 h-3" />
      </div>
    </div>
  );
}

export function SkeletonButton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse",
        className,
      )}
    />
  );
}

export function SkeletonBadge({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse inline-block",
        className,
      )}
    />
  );
}

export function SkeletonDropdown({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-10 bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 animate-pulse",
        className,
      )}
    />
  );
}

export function SkeletonGrid({
  cols = 3,
  rows = 3,
}: {
  cols?: number;
  rows?: number;
}) {
  return (
    <div className={`grid grid-cols-${cols} gap-4`}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-2 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 animate-pulse">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-4 bg-gray-200 dark:bg-gray-800 rounded"
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 p-3 border-b border-gray-200 dark:border-gray-800 animate-pulse last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="flex-1 h-4 bg-gray-200 dark:bg-gray-800 rounded"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanbanColumn() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 w-72">
      {/* Column title skeleton */}
      <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-4 animate-pulse" />
      {/* Cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-lg p-3 animate-pulse border border-gray-200 dark:border-gray-700"
          >
            <SkeletonText className="mb-2 w-3/4" />
            <SkeletonText className="mb-2 w-full h-3" />
            <SkeletonText className="w-1/2 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTicketCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <SkeletonText className="w-2/3 h-5" />
        <SkeletonBadge className="w-12 h-6" />
      </div>
      <SkeletonText className="mb-3 w-full h-3" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <SkeletonText className="w-24 h-3" />
      </div>
      <div className="flex gap-2">
        <SkeletonBadge className="w-16 h-5" />
        <SkeletonBadge className="w-16 h-5" />
      </div>
    </div>
  );
}

export function SkeletonDetailPane() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title */}
      <div>
        <SkeletonText className="h-6 w-3/4 mb-2" />
        <SkeletonText className="h-4 w-1/2" />
      </div>
      {/* Sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <SkeletonText className="h-4 w-32 mb-3" />
          <SkeletonText className="h-3 w-full mb-2" />
          <SkeletonText className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
