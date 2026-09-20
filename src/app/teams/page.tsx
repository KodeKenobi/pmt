"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { onRealtimeChange } from "@/lib/realtime-events";

type Team = { id: string; name: string };

export default function TeamsAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teams");
      if (res.ok) setTeams(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;
    void load();
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table !== "Team") return;
      void load();
    });

    return unsubscribe;
  }, [authLoading, user]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to create team");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (user.role !== "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <p className="text-gray-600">Only department heads can manage teams.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Teams
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Create teams for Sales, Marketing, Development, and other
            departments. Only super admins (heads) can add teams. Open a team to
            manage members.
          </p>{" "}
        </div>
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              New team name
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Success"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2 text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            {busy ? "Saving…" : "Add team"}
          </button>
        </form>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {loading ? (
          <ul
            className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900"
            aria-label="Loading teams"
          >
            {Array.from({ length: 5 }).map((_, index) => (
              <li
                key={`team-skeleton-${index}`}
                className="flex items-center justify-between px-4 py-4"
              >
                <SkeletonLine className="w-40" />
                <SkeletonLine className="w-28" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900">
            {teams.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/teams/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 text-gray-900 transition-colors hover:bg-gray-50 dark:text-white dark:hover:bg-gray-800/50"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400">
                    Manage members →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
