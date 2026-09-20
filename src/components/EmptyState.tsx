import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm dark:border-gray-800 dark:bg-[#1A1F2E] ${className}`}
    >
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}