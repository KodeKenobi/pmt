"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { SelectMenu } from "@/components/SelectMenu";
import { SkeletonRow } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  Mail,
  Pencil,
  RotateCcw,
  Save,
  UserMinus,
  Users,
} from "lucide-react";
import { onRealtimeChange } from "@/lib/realtime-events";

type Member = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  invitationStatus: "INVITED_NOT_CONFIRMED" | "INVITE_EXPIRED" | "ACTIVATED";
};

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { user, loading: authLoading } = useAuth();

  const [teamName, setTeamName] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"USER" | "SUPER_ADMIN">("USER");
  const [busy, setBusy] = useState(false);
  const [resendingForUserId, setResendingForUserId] = useState<string | null>(
    null,
  );
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [editMember, setEditMember] = useState({
    name: "",
    role: "USER" as "USER" | "SUPER_ADMIN",
    phone: "",
  });

  const loadTeamMeta = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (!res.ok) return;
    const teams: { id: string; name: string }[] = await res.json();
    const t = teams.find((x) => x.id === teamId);
    setTeamName(t?.name ?? "");
  }, [teamId]);

  const loadMembers = useCallback(async () => {
    if (!teamId) return;
    setError("");
    const res = await fetch(`/api/teams/${teamId}/members`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body.error === "string" ? body.error : "Failed to load members",
      );
      setMembers([]);
      return;
    }
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [teamId]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;
    setLoading(true);
    void (async () => {
      await loadTeamMeta();
      await loadMembers();
      setLoading(false);
    })();
  }, [authLoading, user, loadTeamMeta, loadMembers]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "SUPER_ADMIN") return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table !== "Team" && detail.table !== "TeamMembership") return;
      void loadTeamMeta();
      void loadMembers();
    });

    return unsubscribe;
  }, [authLoading, user, loadTeamMeta, loadMembers]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setWarning("");
    setBusy(true);
    const endpoint = `/api/teams/${teamId}/members`;
    const payload = {
      email: email.trim(),
      role,
    };

    console.groupCollapsed("[Team Add] Add to team request");
    console.log("endpoint:", endpoint);
    console.log("payload:", payload);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      console.log("response status:", res.status);
      console.log("response ok:", res.ok);
      console.log("response body:", body);
      if (!res.ok) throw new Error(body.error || "Failed to add member");
      setNotice("Invitation sent! They'll receive a link to set their password.");
      setEmail("");
      setRole("USER");
      await loadMembers();
    } catch (err) {
      console.error("[Team Add] request failed:", err);
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      console.groupEnd();
      setBusy(false);
    }
  };

  const onRemove = async () => {
    const targetMember = memberToRemove;
    if (!targetMember) return;

    setError("");
    setNotice("");
    setWarning("");
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/members?userId=${encodeURIComponent(targetMember.userId)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Remove failed");
        setMemberToRemove(null);
        return;
      }

      if (body.removed === false) {
        setWarning("No membership row was deleted. Refresh and try again.");
        await loadMembers();
        setMemberToRemove(null);
        return;
      }

      await loadMembers();
      setNotice(`Removed ${targetMember.name} from this team.`);
      setMemberToRemove(null);
    } catch {
      setError("Remove failed. Please try again.");
      setMemberToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  const onResendInvite = async (member: Member) => {
    setError("");
    setNotice("");
    setWarning("");
    setResendingForUserId(member.userId);

    try {
      const res = await fetch(
        `/api/teams/${teamId}/members/${member.userId}/resend-invite`,
        {
          method: "POST",
        },
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to send invitation email",
        );
      }

      setNotice(
        typeof body.message === "string"
          ? body.message
          : `Invitation email sent to ${member.email}`,
      );
      await loadMembers();
    } catch (err) {
      setWarning(
        err instanceof Error ? err.message : "Failed to send invitation email",
      );
    } finally {
      setResendingForUserId(null);
    }
  };

  const beginEditMember = (member: Member) => {
    setError("");
    setNotice("");
    setWarning("");
    setEditingMemberId(member.userId);
    setEditMember({
      name: member.name,
      role: member.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
      phone: member.phone ?? "",
    });
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setEditMember({
      name: "",
      role: "USER",
      phone: "",
    });
  };

  const saveMemberProfile = async (member: Member) => {
    setError("");
    setNotice("");
    setWarning("");
    setSavingMember(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editMember.name,
          role: editMember.role,
          phone: editMember.phone,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to update team member",
        );
      }

      await loadMembers();
      setNotice(
        `Updated profile for ${editMember.name.trim() || member.name}.`,
      );
      cancelEditMember();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setSavingMember(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
      </div>
    );
  }

  const statusLabel = (status: Member["invitationStatus"]) => {
    if (status === "ACTIVATED") return "Activated";
    if (status === "INVITE_EXPIRED") return "Invite expired";
    return "Invited - Pending";
  };

  const statusClasses = (status: Member["invitationStatus"]) => {
    if (status === "ACTIVATED") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    }

    if (status === "INVITE_EXPIRED") {
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    }

    return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
  };

  if (user.role !== "SUPER_ADMIN") {
    return (
      <DashboardLayout>
        <p className="text-gray-600 dark:text-gray-400">
          Only department heads can manage team members.
        </p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-8">
        <div>
          <Link
            href="/teams"
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            <ArrowLeft className="h-4 w-4" />
            All teams
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {loading && !teamName ? "Team" : teamName || "Team"}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Add staff by email address. They'll receive a magic link to set up
            their account.
          </p>
        </div>

        <form
          onSubmit={onAdd}
          className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Staff email
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
              />
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Role
              </label>
              <div className="mt-1">
                <SelectMenu
                  value={role}
                  onChange={(value) => setRole(value as "USER" | "SUPER_ADMIN")}
                  options={[
                    { value: "USER", label: "Admin" },
                    { value: "SUPER_ADMIN", label: "Super Admin" },
                  ]}
                  className="w-full"
                  triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-lg bg-brand-600 px-5 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add to team"}
            </button>
          </div>
        </form>

        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {notice}
          </div>
        )}

        {warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {warning}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900">
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="flex flex-col gap-3 px-4 py-4">
                <SkeletonRow />
              </li>
            ))}
          </ul>
        ) : members.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Add someone by email to start building this team."
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
          />
        ) : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900">
            {members.map((m) => (
                <li
                  key={m.membershipId}
                  className="flex flex-col gap-3 px-4 py-4 text-gray-900 dark:text-white sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {m.email}
                      </p>
                      {m.phone ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Phone: {m.phone}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {m.role.replace("_", " ")}
                      </p>
                      <span
                        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(m.invitationStatus)}`}
                      >
                        {statusLabel(m.invitationStatus)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.invitationStatus !== "ACTIVATED" && (
                      <button
                        type="button"
                        onClick={() => {
                          void onResendInvite(m);
                        }}
                        disabled={resendingForUserId === m.userId}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {resendingForUserId === m.userId
                          ? "Sending..."
                          : "Resend invite"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => beginEditMember(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberToRemove(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <UserMinus className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                  {editingMemberId === m.userId ? (
                    <div className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40 sm:max-w-xl">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          type="text"
                          value={editMember.name}
                          onChange={(e) =>
                            setEditMember((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Full name"
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                        />
                        <SelectMenu
                          value={editMember.role}
                          onChange={(value) =>
                            setEditMember((prev) => ({
                              ...prev,
                              role: value as "USER" | "SUPER_ADMIN",
                            }))
                          }
                          options={[
                            { value: "USER", label: "Admin" },
                            { value: "SUPER_ADMIN", label: "Super Admin" },
                          ]}
                          className="w-full"
                          triggerClassName="border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                        />
                        <input
                          type="text"
                          value={editMember.phone}
                          onChange={(e) =>
                            setEditMember((prev) => ({
                              ...prev,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="Phone (optional)"
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void saveMemberProfile(m);
                          }}
                          disabled={savingMember || !editMember.name.trim()}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          {savingMember ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditMember}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={memberToRemove !== null}
        title="Remove team member"
        message={
          memberToRemove
            ? `Remove ${memberToRemove.name} from this team? This only removes team membership and does not delete the user account.`
            : ""
        }
        confirmLabel="Remove"
        busy={removing}
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => {
          void onRemove();
        }}
      />
    </DashboardLayout>
  );
}
