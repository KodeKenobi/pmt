import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  user: {
    name: string;
    role: string;
  };
  teams: any[];
  teamListLoading: boolean;
  selectedView: "kanban" | "list";
  setSelectedView: (view: "kanban" | "list") => void;
  setShowCreateModal: (show: boolean) => void;
}

export default function DashboardHeader({
  user,
  teams,
  teamListLoading,
  selectedView,
  setSelectedView,
  setShowCreateModal,
}: DashboardHeaderProps) {
  return (
    <div className="space-y-6">
      {user.role === "USER" && teams.length === 0 && !teamListLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 text-sm">
          You are not a member of any team yet. A department head (super admin)
          must add you to a team before you can load tickets.
        </div>
      )}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Welcome back, {user.name}. Here&apos;s what&apos;s happening today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5 shadow-sm dark:border-gray-800 dark:bg-[#1A1F2E]">
            <button
              onClick={() => setSelectedView("kanban")}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-all",
                selectedView === "kanban"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
              )}
            >
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setSelectedView("list")}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-all",
                selectedView === "list"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
              )}
            >
              <span>List</span>
            </button>
          </div>

          {user.role !== "CLIENT" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Ticket</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
