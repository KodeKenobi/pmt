"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { SelectMenu } from "@/components/SelectMenu";
import { SkeletonLine } from "@/components/ui/Skeleton";

const inviteRoleOptions = [
  { value: "USER", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "CLIENT", label: "Client" },
] as const;

export default function AdminInvitePage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<(typeof inviteRoleOptions)[number]["value"]>("USER");
  const { teams, loading: teamsLoading } = useTeam();
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold">Admin Invite</h2>
        <p className="mt-4 text-sm text-gray-500">
          You must be a super admin to access this page.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role, teamId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invite");
      } else {
        setMessage("Invite sent successfully to " + email);
        setName("");
        setEmail("");
        setRole("USER");
        setTeamId("");
      }
    } catch (_err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Invite new user</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}
        {message && <div className="text-sm text-green-600">{message}</div>}

        <div>
          <label className="block text-sm mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-full border rounded px-3 py-2"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Admin invites require @lighthousemediagroup.com. Super admins and
            clients may use any email address.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Role</label>
          <SelectMenu
            value={role}
            onChange={(value) => {
              const nextRole =
                value as (typeof inviteRoleOptions)[number]["value"];
              setRole(nextRole);
              if (nextRole === "CLIENT") {
                setTeamId("");
              }
            }}
            options={inviteRoleOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Team</label>
          <SelectMenu
            value={teamId}
            onChange={setTeamId}
            options={[
              {
                value: "",
                label:
                  role === "CLIENT"
                    ? "Not required for client"
                    : "Select a team",
              },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            disabled={role === "CLIENT"}
            className="w-full"
          />
          {teamsLoading && <SkeletonLine className="mt-2 h-3 w-28" />}
          {role === "CLIENT" && (
            <p className="text-xs text-gray-500 mt-1">
              Client invites are not tied to an internal team.
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded"
          >
            {loading ? "Sending..." : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
