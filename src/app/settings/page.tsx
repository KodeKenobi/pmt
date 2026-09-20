"use client";

import {
  Suspense,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Github,
  Settings as SettingsIcon,
  Key,
  CheckCircle2,
  AlertCircle,
  Shield,
  User,
  Loader2,
  Trash2,
  ExternalLink,
  Lock,
  Database,
  Download,
  Upload,
  Power,
  RefreshCcw,
  RotateCcw,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setResourceFailed,
  setResourcePending,
  setResourceSuccess,
} from "@/store/slices/resourceCacheSlice";

interface GithubUser {
  login: string;
  avatarUrl: string;
}

interface GithubRepoItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch?: string;
  private?: boolean;
  owner: {
    login: string;
  };
}

interface GithubBranchItem {
  name: string;
  protected?: boolean;
}

interface GithubPullRequestItem {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  user?: {
    login?: string;
  };
}

type GithubConnectionSource = "system" | "user";

type BackupHistoryItem = {
  id: string;
  label: string;
  triggerType: string;
  generatedAt: string;
  generatedByName: string | null;
  generatedByEmail: string | null;
  restoredAt: string | null;
  restoredById: string | null;
  tableCounts: Record<string, number>;
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex h-full w-full items-center justify-center p-8">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading settings...
            </div>
          </div>
        </DashboardLayout>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const notificationPrefsCache = useAppSelector(
    (state) => state.resourceCache.byKey.settings_notification_prefs,
  );
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [activeTab, setActiveTab] = useState<
    "profile" | "github" | "notifications" | "security" | "backup"
  >("github");

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState({
    ticketWorkflow: true,
    codeReview: true,
    systemReleases: true,
    monitoringAlerts: true,
    clientFeedback: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notifError, setNotifError] = useState("");

  // GitHub integration state
  const [githubToken, setGithubToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [githubUser, setGithubUser] = useState<GithubUser | null>(null);
  const [githubSource, setGithubSource] =
    useState<GithubConnectionSource | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState("");
  const [testEmailError, setTestEmailError] = useState("");
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState("");
  const [diagnosticError, setDiagnosticError] = useState("");
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showSwitchGithubForm, setShowSwitchGithubForm] = useState(false);
  const [superGithubLoading, setSuperGithubLoading] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GithubRepoItem[]>([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState("");
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [selectedRepoBranches, setSelectedRepoBranches] = useState<
    GithubBranchItem[]
  >([]);
  const [selectedRepoPullRequests, setSelectedRepoPullRequests] = useState<
    GithubPullRequestItem[]
  >([]);
  const [selectedRepoLoading, setSelectedRepoLoading] = useState(false);
  const [selectedRepoError, setSelectedRepoError] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupNowLoading, setBackupNowLoading] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");
  const [backupSummary, setBackupSummary] = useState<Record<
    string,
    number
  > | null>(null);
  const [backupRecords, setBackupRecords] = useState<BackupHistoryItem[]>([]);
  const [backupRecordsLoading, setBackupRecordsLoading] = useState(false);
  const [backupRecordsError, setBackupRecordsError] = useState("");
  const [selectedRestoreBackup, setSelectedRestoreBackup] =
    useState<BackupHistoryItem | null>(null);
  const [restoringBackupId, setRestoringBackupId] = useState("");
  const importBackupInputRef = useRef<HTMLInputElement | null>(null);

  // Backup settings state
  const [backupAutomatic, setBackupAutomatic] = useState(true);
  const [originalBackupAutomatic, setOriginalBackupAutomatic] = useState(true);
  const [backupSettingsSaving, setBackupSettingsSaving] = useState(false);
  const [backupSettingsError, setBackupSettingsError] = useState("");
  const [backupSettingsSuccess, setBackupSettingsSuccess] = useState(false);
  const [backupColumnExists, setBackupColumnExists] = useState(true);

  // User Profile display state (dummy/read-only for beauty)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editedName, setEditedName] = useState("");
  const [editedEmail, setEditedEmail] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setEditedName(user.name);
      setEditedEmail(user.email);
      void checkGithubStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!isSuperAdmin && activeTab === "security") {
      setActiveTab("github");
    }
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    const cachedPrefs =
      notificationPrefsCache?.data &&
      typeof notificationPrefsCache.data === "object"
        ? (notificationPrefsCache.data as typeof notifPrefs)
        : null;
    const hasFreshCache =
      cachedPrefs &&
      notificationPrefsCache?.fetchedAt &&
      Date.now() - notificationPrefsCache.fetchedAt < 300_000;

    if (hasFreshCache) {
      setNotifPrefs((prev) => ({ ...prev, ...cachedPrefs }));
      setNotifLoading(false);
      return;
    }

    setNotifLoading(true);
    setNotifError("");
    dispatch(setResourcePending({ key: "settings_notification_prefs" }));
    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((data: { preferences?: typeof notifPrefs }) => {
        if (data.preferences) {
          setNotifPrefs({ ...notifPrefs, ...data.preferences });
          dispatch(
            setResourceSuccess({
              key: "settings_notification_prefs",
              data: data.preferences,
            }),
          );
        }
      })
      .catch(() => {
        dispatch(
          setResourceFailed({
            key: "settings_notification_prefs",
            error: "Failed to load notification preferences.",
          }),
        );
        setNotifError("Failed to load notification preferences.");
      })
      .finally(() => setNotifLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    dispatch,
    notificationPrefsCache?.data,
    notificationPrefsCache?.fetchedAt,
  ]);

  async function saveNotifPrefs() {
    setNotifSaving(true);
    setNotifSaved(false);
    setNotifError("");
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: notifPrefs }),
      });
      if (!res.ok) throw new Error("Save failed");
      dispatch(
        setResourceSuccess({
          key: "settings_notification_prefs",
          data: notifPrefs,
        }),
      );
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch {
      setNotifError("Failed to save preferences. Please try again.");
    } finally {
      setNotifSaving(false);
    }
  }

  useEffect(() => {
    const githubStatus = searchParams.get("github");
    if (!githubStatus) return;

    if (githubStatus === "connected") {
      setSuccessMsg("Successfully authenticated with GitHub OAuth.");
      setConnectError("");
      void checkGithubStatus();
      return;
    }

    if (githubStatus === "oauth_not_configured") {
      setConnectError(
        "GitHub OAuth is not configured on this deployment. Ask your admin to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
      return;
    }

    if (githubStatus === "oauth_failed") {
      setConnectError("GitHub OAuth failed. Please try connecting again.");
      return;
    }

    if (githubStatus === "oauth_state_invalid") {
      setConnectError("GitHub OAuth state validation failed. Please retry.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== "backup" || !isSuperAdmin) return;
    void loadBackups();
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (activeTab !== "backup" || !isSuperAdmin) return;
    const loadOrgSettings = async () => {
      try {
        const res = await fetch("/api/organization");
        if (res.ok) {
          const data = await res.json();
          const value = data.backupAutomatic ?? true;
          setBackupAutomatic(value);
          setOriginalBackupAutomatic(value);
          setBackupColumnExists(true);
          if (typeof window !== "undefined") {
            localStorage.setItem("backupAutomatic", JSON.stringify(value));
          }
          return;
        }
      } catch (error) {
        console.error("Failed to load organization settings:", error);
      }

      // Check if column exists by calling the migration endpoint
      try {
        const migrationRes = await fetch("/api/admin/migrate-backup-auto", {
          method: "POST",
        });
        if (migrationRes.ok) {
          const migrationData = await migrationRes.json();
          setBackupColumnExists(migrationData.columnExists ?? false);
        }
      } catch (error) {
        console.error("Failed to check migration status:", error);
      }

      // Fallback to localStorage
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("backupAutomatic");
        if (stored !== null) {
          try {
            const value = JSON.parse(stored);
            setBackupAutomatic(value);
            setOriginalBackupAutomatic(value);
          } catch (e) {
            // Default to true if parsing fails
            setBackupAutomatic(true);
            setOriginalBackupAutomatic(true);
          }
        }
      }
    };
    void loadOrgSettings();
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (!githubUser || !selectedRepoFullName) {
      setSelectedRepoBranches([]);
      setSelectedRepoPullRequests([]);
      setSelectedRepoError("");
      return;
    }

    void loadSelectedRepoDetails(selectedRepoFullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubUser, selectedRepoFullName]);

  async function sendTestEmail() {
    setTestEmailLoading(true);
    setTestEmailMessage("");
    setTestEmailError("");

    console.log("[Email test] starting", {
      userEmail: email,
      userName: name,
    });

    try {
      console.log("[Email test] sending POST /api/settings/test-email");
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
      });

      const body = await res.json().catch(() => ({}));

      console.log("[Email test] response", {
        status: res.status,
        ok: res.ok,
        body,
      });

      if (!res.ok) {
        console.error("[Email test] failed", body);
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to send test email",
        );
      }

      console.log("[Email test] success", body);
      setTestEmailMessage(
        typeof body.message === "string"
          ? body.message
          : "Test email sent successfully.",
      );
    } catch (error) {
      console.error("[Email test] exception", error);
      setTestEmailError(
        error instanceof Error ? error.message : "Failed to send test email",
      );
    } finally {
      setTestEmailLoading(false);
    }
  }

  async function runEmailDiagnostics() {
    setDiagnosticLoading(true);
    setDiagnosticMessage("");
    setDiagnosticError("");

    console.log("[Email diagnostics] starting");
    try {
      console.log(
        "[Email diagnostics] sending GET /api/settings/smtp-diagnostic",
      );
      const res = await fetch("/api/settings/smtp-diagnostic");

      const body = await res.json().catch(() => ({}));

      console.log("[Email diagnostics] response", {
        status: res.status,
        ok: res.ok,
        body,
      });

      if (!res.ok) {
        console.error("[Email diagnostics] failed", body);
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to run email diagnostics",
        );
      }

      const diagnostics = body.diagnostics ?? {};
      console.log("[Email diagnostics] success", diagnostics);

      const provider =
        typeof diagnostics.provider === "string"
          ? diagnostics.provider
          : "email";
      const configured = diagnostics.configured ? "configured" : "missing env";
      const verified = diagnostics.verified ? "verified" : "not verified";
      const detail = diagnostics.verifyError
        ? ` (${diagnostics.verifyError})`
        : "";
      setDiagnosticMessage(
        `${provider} is ${configured}, ${verified}${detail}`,
      );
    } catch (error) {
      console.error("[Email diagnostics] exception", error);
      setDiagnosticError(
        error instanceof Error
          ? error.message
          : "Failed to run email diagnostics",
      );
    } finally {
      setDiagnosticLoading(false);
    }
  }

  const loadGithubProjectAccount = useCallback(async () => {
    setGithubReposLoading(true);
    setGithubReposError("");

    try {
      const response = await fetch("/api/github/repos", {
        method: "GET",
      });

      const body = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Failed to load GitHub repositories",
        );
      }

      const repos = Array.isArray(body) ? (body as GithubRepoItem[]) : [];
      setGithubRepos(repos);

      if (!repos.length) {
        setSelectedRepoFullName("");
        return;
      }

      setSelectedRepoFullName((current) => {
        if (current && repos.some((repo) => repo.full_name === current)) {
          return current;
        }

        return repos[0].full_name;
      });
    } catch (error) {
      setGithubRepos([]);
      setSelectedRepoFullName("");
      setSelectedRepoBranches([]);
      setSelectedRepoPullRequests([]);
      setGithubReposError(
        error instanceof Error
          ? error.message
          : "Failed to load GitHub repositories",
      );
    } finally {
      setGithubReposLoading(false);
    }
  }, []);

  const loadSelectedRepoDetails = useCallback(
    async (fullName: string) => {
      const repoMatch = githubRepos.find((repo) => repo.full_name === fullName);

      if (!repoMatch) {
        setSelectedRepoError("Select a repository to view branches and PRs.");
        return;
      }

      setSelectedRepoLoading(true);
      setSelectedRepoError("");

      const owner = encodeURIComponent(repoMatch.owner.login);
      const repo = encodeURIComponent(repoMatch.name);

      try {
        const [branchesResponse, pullRequestsResponse] = await Promise.all([
          fetch(`/api/github/branches?owner=${owner}&repo=${repo}`),
          fetch(`/api/github/pull-requests?owner=${owner}&repo=${repo}`),
        ]);

        const [branchesBody, pullRequestsBody] = await Promise.all([
          branchesResponse.json().catch(() => []),
          pullRequestsResponse.json().catch(() => []),
        ]);

        if (!branchesResponse.ok) {
          throw new Error(
            typeof branchesBody?.error === "string"
              ? branchesBody.error
              : "Failed to load repository branches",
          );
        }

        if (!pullRequestsResponse.ok) {
          throw new Error(
            typeof pullRequestsBody?.error === "string"
              ? pullRequestsBody.error
              : "Failed to load repository pull requests",
          );
        }

        setSelectedRepoBranches(
          Array.isArray(branchesBody)
            ? (branchesBody as GithubBranchItem[])
            : [],
        );
        setSelectedRepoPullRequests(
          Array.isArray(pullRequestsBody)
            ? (pullRequestsBody as GithubPullRequestItem[])
            : [],
        );
      } catch (error) {
        setSelectedRepoBranches([]);
        setSelectedRepoPullRequests([]);
        setSelectedRepoError(
          error instanceof Error
            ? error.message
            : "Failed to load repository details",
        );
      } finally {
        setSelectedRepoLoading(false);
      }
    },
    [githubRepos],
  );

  const checkGithubStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch("/api/github/auth");
      const data = await res.json();
      if (res.ok && data.connected) {
        setGithubUser(data.githubUser);
        setGithubSource(data.source ?? "user");
        await loadGithubProjectAccount();
      } else {
        setGithubUser(null);
        setGithubSource(null);
        setGithubRepos([]);
        setSelectedRepoFullName("");
        setSelectedRepoBranches([]);
        setSelectedRepoPullRequests([]);
        setGithubReposError("");
        setSelectedRepoError("");
      }
    } catch (e) {
      console.error("Check status error:", e);
    } finally {
      setCheckingStatus(false);
    }
  }, [loadGithubProjectAccount]);

  const handleSaveProfile = useCallback(async () => {
    setProfileError("");
    setProfileSuccess(false);
    setProfileSaving(true);

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName, email: editedEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setProfileError(data.error || "Failed to update profile");
        return;
      }

      setName(editedName);
      setEmail(editedEmail);
      setProfileSuccess(true);
      setProfileEditing(false);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (error) {
      console.error("Save profile error:", error);
      setProfileError("An error occurred while saving your profile");
    } finally {
      setProfileSaving(false);
    }
  }, [editedName, editedEmail]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-brand-500 dark:text-blue-400 animate-spin-slow" />
            Settings
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your profile, security, and repository integrations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar tabs */}
          <div className="md:col-span-1 flex flex-col space-y-1 bg-white/60 dark:bg-[#1A1F2E]/60 backdrop-blur-md border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-card h-fit">
            <button
              onClick={() => setActiveTab("profile")}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                activeTab === "profile"
                  ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
              )}
            >
              <User className="w-4 h-4" />
              My Profile
            </button>
            <button
              onClick={() => setActiveTab("github")}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                activeTab === "github"
                  ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
              )}
            >
              <Github className="w-4 h-4" />
              GitHub Integration
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                activeTab === "notifications"
                  ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
              )}
            >
              <Bell className="w-4 h-4" />
              Notifications
            </button>
            {isSuperAdmin ? (
              <button
                onClick={() => setActiveTab("security")}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  activeTab === "security"
                    ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
                )}
              >
                <Shield className="w-4 h-4" />
                Security
              </button>
            ) : null}
            {isSuperAdmin ? (
              <button
                onClick={() => setActiveTab("backup")}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  activeTab === "backup"
                    ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5",
                )}
              >
                <Database className="w-4 h-4" />
                Backup
              </button>
            ) : null}
          </div>

          {/* Settings Panels */}
          <div className="md:col-span-3">
            {activeTab === "profile" && (
              <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-card space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Profile Details
                    </h2>
                    <p className="text-sm text-gray-500">
                      Your basic account information
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        if (profileEditing) {
                          setEditedName(name);
                          setEditedEmail(email);
                          setProfileEditing(false);
                          setProfileError("");
                        } else {
                          setProfileEditing(true);
                        }
                      }}
                      disabled={profileSaving}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                    >
                      {profileEditing ? "Cancel" : "Edit"}
                    </button>
                  )}
                </div>

                {profileError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
                    {profileError}
                  </div>
                )}

                {profileSuccess && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl p-4 text-sm text-green-700 dark:text-green-300">
                    Profile updated successfully
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileEditing ? editedName : name}
                      onChange={(e) => setEditedName(e.target.value)}
                      disabled={!profileEditing}
                      className={cn(
                        "w-full input-modern",
                        profileEditing
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50 dark:bg-gray-900 cursor-not-allowed opacity-70"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileEditing ? editedEmail : email}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      disabled={!profileEditing}
                      className={cn(
                        "w-full input-modern",
                        profileEditing
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50 dark:bg-gray-900 cursor-not-allowed opacity-70"
                      )}
                    />
                  </div>
                </div>

                {profileEditing && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveProfile}
                      disabled={profileSaving || !editedName || !editedEmail}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setProfileEditing(false);
                        setEditedName(name);
                        setEditedEmail(email);
                        setProfileError("");
                      }}
                      disabled={profileSaving}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!isSuperAdmin && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 flex gap-3 text-sm text-blue-700 dark:text-blue-300">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Profile updates are managed by IT
                      </p>
                      <p className="mt-0.5 text-xs opacity-90">
                        To change your profile details, contact your supervisor or
                        administrative team.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "github" && (
              <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 p-6 lg:p-8 rounded-2xl shadow-card space-y-8">
                <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Github className="w-6 h-6" />
                      GitHub Developer Flow
                    </h2>
                    <p className="text-sm text-gray-500">
                      Use GitHub access to sync branches, tickets, and PR status
                    </p>
                    {githubSource === "system" && !isSuperAdmin ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Department-managed GitHub access is active for every
                        signed-in user.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0">
                    {checkingStatus ? (
                      <div className="w-24">
                        <SkeletonLine className="h-6 w-full rounded-full" />
                      </div>
                    ) : githubUser ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/25 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/25">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Not Connected
                      </span>
                    )}
                  </div>
                </div>

                {successMsg && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-4 flex gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{successMsg}</p>
                    </div>
                  </div>
                )}

                {statusError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex gap-3 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Failed to load connection details
                      </p>
                      <p className="mt-0.5 text-xs opacity-90">{statusError}</p>
                    </div>
                  </div>
                )}

                {isSuperAdmin ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                          Super admin GitHub controls
                        </p>
                        <p className="text-xs text-indigo-700/90 dark:text-indigo-300/90">
                          Run privileged connection actions and maintain your
                          fallback user token.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void checkGithubStatus();
                          }}
                          disabled={
                            checkingStatus || connecting || superGithubLoading
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Refresh status
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void clearSavedGithubToken();
                          }}
                          disabled={superGithubLoading || connecting}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          {superGithubLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          Clear saved user token
                        </button>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-indigo-800/90 dark:text-indigo-300/90">
                      Auth source: {githubSource || "none"}. If source is
                      <span className="font-semibold"> system</span>, active
                      access comes from the department environment token and
                      cannot be revoked from this page.
                    </p>
                  </div>
                ) : null}

                {githubUser ? (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-slate-50/70 p-5 dark:border-gray-800 dark:bg-slate-900/20 lg:p-6">
                      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-4">
                          {githubUser.avatarUrl ? (
                            <Image
                              src={githubUser.avatarUrl}
                              alt={githubUser.login}
                              width={56}
                              height={56}
                              unoptimized
                              loader={({ src }) => src}
                              className="w-14 h-14 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-lg">
                              {githubUser.login.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Connected Account
                            </p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              @{githubUser.login}
                              <a
                                href={`https://github.com/${githubUser.login}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-brand-500 transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                          {githubSource !== "system" ? (
                            <button
                              onClick={() => setShowDisconnectConfirm(true)}
                              disabled={connecting}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-200 dark:border-red-900/50 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                              Disconnect Account
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1A1F2E] space-y-5 lg:p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Project account explorer
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Review repositories, branches, and pull requests for
                            your connected GitHub account.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void loadGithubProjectAccount();
                          }}
                          disabled={githubReposLoading || connecting}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
                        >
                          {githubReposLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-3.5 w-3.5" />
                          )}
                          Refresh repositories
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-slate-900/40">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">
                            Repositories
                          </p>
                          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {githubRepos.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-slate-900/40">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">
                            Branches
                          </p>
                          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {selectedRepoBranches.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-slate-900/40">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">
                            Pull requests
                          </p>
                          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {selectedRepoPullRequests.length}
                          </p>
                        </div>
                      </div>

                      {githubReposError ? (
                        <p className="text-sm text-red-600 dark:text-red-300">
                          {githubReposError}
                        </p>
                      ) : null}

                      {githubRepos.length ? (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Repository
                            </label>
                            <select
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-[#1A1F2E] dark:text-white"
                              value={selectedRepoFullName}
                              onChange={(event) => {
                                setSelectedRepoFullName(event.target.value);
                              }}
                            >
                              {githubRepos.map((repo) => {
                                const value = repo.full_name;
                                return (
                                  <option key={repo.id} value={value}>
                                    {repo.full_name}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                            <div className="max-h-52 overflow-auto divide-y divide-gray-200 dark:divide-gray-800">
                              {githubRepos.map((repo) => {
                                const isSelected =
                                  repo.full_name === selectedRepoFullName;
                                return (
                                  <button
                                    key={repo.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedRepoFullName(repo.full_name);
                                    }}
                                    className={cn(
                                      "w-full px-4 py-3 text-left transition-colors",
                                      isSelected
                                        ? "bg-brand-50 dark:bg-brand-500/10"
                                        : "bg-white hover:bg-gray-50 dark:bg-[#0F1419] dark:hover:bg-[#1A1F2E]",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {repo.full_name}
                                      </p>
                                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-500">
                                        {repo.private ? "Private" : "Public"}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                      Default branch:{" "}
                                      {repo.default_branch || "main"}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {selectedRepoError ? (
                            <p className="text-sm text-red-600 dark:text-red-300">
                              {selectedRepoError}
                            </p>
                          ) : null}

                          {selectedRepoLoading ? (
                            <div className="space-y-2">
                              <SkeletonLine className="h-9 w-full" />
                              <SkeletonLine className="h-9 w-full" />
                              <SkeletonLine className="h-9 w-3/4" />
                            </div>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-slate-900/40">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                  Branches
                                </p>
                                <div className="mt-3 max-h-56 space-y-1.5 overflow-auto">
                                  {selectedRepoBranches.length ? (
                                    selectedRepoBranches.map((branch) => (
                                      <div
                                        key={branch.name}
                                        className="rounded-md border border-gray-200 bg-white px-3 py-2.5 text-xs text-slate-800 dark:border-gray-700 dark:bg-[#0F1419] dark:text-slate-200"
                                      >
                                        <p className="font-semibold">
                                          {branch.name}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">
                                          {branch.protected
                                            ? "Protected branch"
                                            : "Standard branch"}
                                        </p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-gray-500">
                                      No branches returned for this repository.
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-slate-900/40">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                  Pull requests
                                </p>
                                <div className="mt-3 max-h-56 space-y-1.5 overflow-auto">
                                  {selectedRepoPullRequests.length ? (
                                    selectedRepoPullRequests.map((pr) => (
                                      <a
                                        key={pr.id}
                                        href={pr.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block rounded-md border border-gray-200 bg-white px-3 py-2.5 text-xs text-slate-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-[#0F1419] dark:text-slate-200 dark:hover:bg-[#1A1F2E]"
                                      >
                                        <p className="font-semibold">
                                          #{pr.number} {pr.title}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">
                                          {pr.state} ·{" "}
                                          {pr.user?.login || "unknown"}
                                        </p>
                                      </a>
                                    ))
                                  ) : (
                                    <p className="text-xs text-gray-500">
                                      No pull requests returned for this
                                      repository.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : githubReposLoading ? (
                        <div className="space-y-2">
                          <SkeletonLine className="h-10 w-full" />
                          <SkeletonLine className="h-10 w-full" />
                          <SkeletonLine className="h-10 w-5/6" />
                        </div>
                      ) : (
                        <p className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm text-gray-500 dark:border-gray-800 dark:bg-slate-900/30">
                          No repositories found for this account.
                        </p>
                      )}
                    </div>

                    {!isSuperAdmin && showSwitchGithubForm ? (
                      <div className="space-y-2 rounded-xl border border-gray-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#1A1F2E]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Connect using personal token
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            type="password"
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={githubToken}
                            onChange={(e) => setGithubToken(e.target.value)}
                            className="flex-1 input-modern font-mono"
                            disabled={connecting}
                          />
                          <button
                            onClick={handleConnect}
                            disabled={connecting || !githubToken}
                            className="btn-primary px-6 shrink-0 inline-flex items-center gap-2"
                          >
                            {connecting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <Github className="w-4 h-4" />
                                Save and switch
                              </>
                            )}
                          </button>
                        </div>
                        {connectError ? (
                          <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {connectError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-slate-50 dark:bg-[#1A1F2E] p-5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                          One-click connect (recommended)
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                          Connect with GitHub OAuth so you do not need to
                          manually paste personal access tokens.
                        </p>
                        <button
                          onClick={handleOAuthConnect}
                          disabled={connecting}
                          className="btn-primary inline-flex items-center gap-2"
                        >
                          <Github className="w-4 h-4" />
                          Connect with GitHub
                        </button>
                      </div>

                      <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-xl p-5 border border-gray-200 dark:border-gray-800/80 text-sm space-y-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Key className="w-4 h-4 text-brand-500" />
                          How to connect your GitHub account:
                        </p>
                        <ol className="list-decimal pl-5 space-y-1.5 text-gray-600 dark:text-gray-400 text-xs">
                          <li>
                            Go to your GitHub{" "}
                            <a
                              href="https://github.com/settings/tokens/new?scopes=repo&description=PMT%20Hub%20Integration"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Personal Access Tokens (Classic){" "}
                              <ExternalLink className="w-3 h-3 inline" />
                            </a>{" "}
                            settings.
                          </li>
                          <li>
                            Generate a token with the{" "}
                            <code className="font-semibold text-brand-600 bg-brand-50 dark:bg-brand-500/10 px-1 py-0.5 rounded">
                              repo
                            </code>{" "}
                            scope selected.
                          </li>
                          <li>
                            Copy the generated token and paste it in the field
                            below.
                          </li>
                        </ol>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1A1F2E]">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                        GitHub Personal Access Token (Classic)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="password"
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          className="flex-1 input-modern font-mono"
                          disabled={connecting}
                        />
                        <button
                          onClick={handleConnect}
                          disabled={connecting || !githubToken}
                          className="btn-primary px-6 shrink-0 inline-flex items-center gap-2"
                        >
                          {connecting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Github className="w-4 h-4" />
                              Connect GitHub
                            </>
                          )}
                        </button>
                      </div>
                      {connectError && (
                        <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {connectError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-card space-y-6">
                <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Bell className="w-5 h-5" />
                      Notification Preferences
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Choose which events send you in-app notifications.
                    </p>
                  </div>
                  {notifSaved && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/50 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                </div>

                {notifError && (
                  <div className="flex gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    {notifError}
                  </div>
                )}

                {notifLoading ? (
                  <div className="space-y-3">
                    <SkeletonLine className="h-16 w-full rounded-xl" />
                    <SkeletonLine className="h-16 w-full rounded-xl" />
                    <SkeletonLine className="h-16 w-full rounded-xl" />
                    <SkeletonLine className="h-16 w-full rounded-xl" />
                    <SkeletonLine className="h-16 w-full rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(
                      [
                        {
                          key: "ticketWorkflow" as const,
                          label: "Ticket workflow",
                          desc: "Assignments, comments, status changes, completions, and new tickets.",
                        },
                        {
                          key: "codeReview" as const,
                          label: "Code review",
                          desc: "Pull request events, review requests, approvals, and revision requests.",
                        },
                        {
                          key: "systemReleases" as const,
                          label: "System releases",
                          desc: "Merges to develop or main, deployments, and release announcements.",
                        },
                        {
                          key: "monitoringAlerts" as const,
                          label: "Monitoring alerts",
                          desc: "Error rate spikes, downtime events, and performance threshold breaches.",
                        },
                        {
                          key: "clientFeedback" as const,
                          label: "Client feedback",
                          desc: "New feedback submissions from client users.",
                        },
                      ] as const
                    ).map(({ key, label, desc }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-slate-50/60 p-4 transition-colors dark:border-gray-800 dark:bg-slate-900/25"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {label}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={notifPrefs[key]}
                          onClick={() =>
                            setNotifPrefs((prev) => ({
                              ...prev,
                              [key]: !prev[key],
                            }))
                          }
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#1A1F2E]",
                            notifPrefs[key]
                              ? "bg-brand-600"
                              : "bg-gray-200 dark:bg-gray-700",
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
                              notifPrefs[key]
                                ? "translate-x-5"
                                : "translate-x-0",
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      void saveNotifPrefs();
                    }}
                    disabled={notifSaving || notifLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {notifSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save preferences"
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "security" && isSuperAdmin && (
              <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-card space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Security Settings
                  </h2>
                  <p className="text-sm text-gray-500">
                    Manage password security and safety policies
                  </p>
                </div>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/20 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <Lock className="w-8 h-8 text-gray-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      SSO & Identity Provider Active
                    </p>
                    <p className="text-xs">
                      Your credential credentials are secured via Google
                      Workspace Single Sign-On. Direct password modification is
                      deactivated.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1F2E] p-4 space-y-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Email delivery test
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Send a direct test message to your current account and
                      inspect the active delivery provider.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void sendTestEmail();
                      }}
                      disabled={testEmailLoading}
                      className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {testEmailLoading ? "Sending..." : "Send test email"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void runEmailDiagnostics();
                      }}
                      disabled={diagnosticLoading}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {diagnosticLoading
                        ? "Checking..."
                        : "Run email diagnostics"}
                    </button>
                  </div>

                  {testEmailMessage ? (
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      {testEmailMessage}
                    </p>
                  ) : null}

                  {testEmailError ? (
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {testEmailError}
                    </p>
                  ) : null}

                  {diagnosticMessage ? (
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {diagnosticMessage}
                    </p>
                  ) : null}

                  {diagnosticError ? (
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {diagnosticError}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
            {activeTab === "backup" && isSuperAdmin ? (
              <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-card space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Backup & Restore
                    </h2>
                    <p className="text-sm text-gray-500">
                      Export a point-in-time JSON backup of the app database.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void loadBackups();
                      }}
                      disabled={backupRecordsLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {backupRecordsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Refresh history
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void createBackupNow();
                      }}
                      disabled={backupNowLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {backupNowLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4" />
                      )}
                      Backup now
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void downloadBackup();
                      }}
                      disabled={backupLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {backupLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating backup...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Download backup
                        </>
                      )}
                    </button>

                    <input
                      ref={importBackupInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => {
                        void handleImportBackupFile(event);
                      }}
                    />
                    <button
                      type="button"
                      onClick={triggerImportBackupFile}
                      disabled={importingBackup}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/20"
                    >
                      {importingBackup ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Import backup
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                  This exports the current database snapshot as JSON. Keep the
                  file private, because it includes application data and
                  credentials stored in the database.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-slate-50/50 dark:bg-slate-900/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      How it works
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      The server reads every core table directly from the
                      database and returns a downloadable JSON file with
                      timestamps, counts, and row data.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-slate-50/50 dark:bg-slate-900/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Backup contents
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      Teams, users, clients, projects, tickets, audit logs,
                      documents, automations, GitHub links, notifications,
                      settings, and recovery tokens.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1F2E] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Automatic nightly backups
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Scheduled backups run automatically every night at 2:00 AM UTC
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setBackupAutomatic(!backupAutomatic)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          backupAutomatic
                            ? "bg-green-600"
                            : "bg-gray-400 dark:bg-gray-500"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200",
                            backupAutomatic ? "bg-white translate-x-5" : "bg-gray-700 dark:bg-gray-300 translate-x-0"
                          )}
                        />
                      </button>
                      {backupAutomatic !== originalBackupAutomatic && (
                        <button
                          onClick={() => void saveBackupSettings()}
                          disabled={backupSettingsSaving}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                        >
                          {backupSettingsSaving ? "Saving..." : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                  {backupSettingsError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {backupSettingsError}
                    </p>
                  )}
                  {backupSettingsSuccess && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ Settings saved successfully
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Note: This setting is saved on your device for now. It will stay saved when we update the system.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1F2E] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Backup history
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Nightly backups arrive automatically from the scheduled
                        workflow. Manual exports also appear here.
                      </p>
                    </div>
                    {backupSummary ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Latest snapshot includes{" "}
                        {Object.values(backupSummary).reduce(
                          (sum, value) => sum + value,
                          0,
                        )}{" "}
                        total rows.
                      </p>
                    ) : null}
                  </div>

                  {backupRecordsError ? (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-300">
                      {backupRecordsError}
                    </p>
                  ) : null}

                  <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                    {backupRecordsLoading ? (
                      <div className="space-y-px">
                        <SkeletonLine className="h-12 w-full rounded-none" />
                        <SkeletonLine className="h-12 w-full rounded-none" />
                        <SkeletonLine className="h-12 w-full rounded-none" />
                      </div>
                    ) : backupRecords.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">
                        No backups yet. Create the first manual backup or wait
                        for the nightly schedule.
                      </div>
                    ) : (
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead className="bg-gray-50 dark:bg-gray-900/60">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Backup
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Created
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Status
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {backupRecords.map((backup) => (
                            <tr key={backup.id}>
                              <td className="px-4 py-4 align-top">
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {backup.label}
                                </div>
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  By{" "}
                                  {backup.generatedByName ||
                                    backup.generatedByEmail ||
                                    "system"}
                                </div>
                                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                                  {Object.values(backup.tableCounts).reduce(
                                    (sum, value) => sum + value,
                                    0,
                                  )}{" "}
                                  rows
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-sm text-gray-600 dark:text-gray-300">
                                {backup.triggerType.replace(/_/g, " ")}
                              </td>
                              <td className="px-4 py-4 align-top text-sm text-gray-600 dark:text-gray-300">
                                {new Date(backup.generatedAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-4 align-top text-sm text-gray-600 dark:text-gray-300">
                                {backup.restoredAt ? (
                                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                                    Restored
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                    Ready
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBackupError("");
                                      setBackupMessage("");
                                      window.location.href = `/api/settings/backups/${backup.id}?download=1`;
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    Download
                                  </button>

                                  {isSuperAdmin ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        requestRestoreBackup(backup)
                                      }
                                      disabled={restoringBackupId === backup.id}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/20"
                                    >
                                      {restoringBackupId === backup.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      )}
                                      Restore
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {backupMessage ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    {backupMessage}
                  </p>
                ) : null}

                {backupError ? (
                  <p className="text-sm text-red-600 dark:text-red-300">
                    {backupError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={showDisconnectConfirm}
        title="Disconnect GitHub"
        message="Are you sure you want to disconnect GitHub? You will not be able to link branches or pull requests."
        confirmLabel="Disconnect"
        onCancel={() => setShowDisconnectConfirm(false)}
        onConfirm={() => {
          setShowDisconnectConfirm(false);
          void handleDisconnect();
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(selectedRestoreBackup) && isSuperAdmin}
        title="Restore backup"
        message={
          selectedRestoreBackup
            ? `Restore ${selectedRestoreBackup.label}? This will replace current app data with the selected snapshot. A safety backup is created first.`
            : "Restore selected backup?"
        }
        confirmLabel="Restore"
        onCancel={() => setSelectedRestoreBackup(null)}
        onConfirm={() => {
          if (!selectedRestoreBackup) return;
          void restoreBackup(selectedRestoreBackup);
        }}
      />
    </DashboardLayout>
  );

  async function handleConnect() {
    setConnecting(true);
    setConnectError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/github/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setGithubUser(data.githubUser);
        setGithubSource(data.source ?? "user");
        setGithubReposError("");
        setSelectedRepoError("");
        setSuccessMsg(
          "Successfully authenticated with GitHub! Your repositories and branches are now active.",
        );
        setGithubToken("");
        setShowSwitchGithubForm(false);
        await loadGithubProjectAccount();
      } else {
        setConnectError(
          data.error ||
            "Failed to authenticate. Make sure the token is correct.",
        );
      }
    } catch (e: any) {
      setConnectError(e.message || "An unexpected error occurred.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setConnecting(true);
    setConnectError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/github/auth", {
        method: "DELETE",
      });
      if (res.ok) {
        setGithubUser(null);
        setGithubSource(null);
        setGithubRepos([]);
        setSelectedRepoFullName("");
        setSelectedRepoBranches([]);
        setSelectedRepoPullRequests([]);
        setGithubReposError("");
        setSelectedRepoError("");
        setShowSwitchGithubForm(false);
        setSuccessMsg("GitHub connection removed successfully.");
      } else {
        setConnectError("Failed to disconnect from GitHub.");
      }
    } catch (_e: any) {
      setConnectError("An error occurred during disconnection.");
    } finally {
      setConnecting(false);
    }
  }

  async function clearSavedGithubToken() {
    if (!isSuperAdmin) return;

    setSuperGithubLoading(true);
    setConnectError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/github/auth?forceUserToken=1", {
        method: "DELETE",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to clear saved GitHub token",
        );
      }

      setSuccessMsg(
        "Saved personal GitHub token cleared. Department-managed access remains active if configured.",
      );
      await checkGithubStatus();
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Failed to clear saved GitHub token",
      );
    } finally {
      setSuperGithubLoading(false);
    }
  }

  function handleOAuthConnect() {
    setConnectError("");
    setSuccessMsg("");
    window.location.href = "/api/github/oauth/start";
  }

  async function loadBackups() {
    setBackupRecordsLoading(true);
    setBackupRecordsError("");

    try {
      const res = await fetch("/api/settings/backups?take=20");
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to load backup history",
        );
      }

      const backups = Array.isArray(body.backups)
        ? (body.backups as BackupHistoryItem[])
        : [];
      setBackupRecords(backups);

      if (backups[0]) {
        setBackupSummary(backups[0].tableCounts ?? null);
      }
    } catch (error) {
      setBackupRecordsError(
        error instanceof Error
          ? error.message
          : "Failed to load backup history",
      );
    } finally {
      setBackupRecordsLoading(false);
    }
  }

  function requestRestoreBackup(backup: BackupHistoryItem) {
    if (!isSuperAdmin) return;
    setSelectedRestoreBackup(backup);
  }

  async function restoreBackup(backup: BackupHistoryItem) {
    setRestoringBackupId(backup.id);
    setBackupError("");
    setBackupMessage("");

    try {
      const res = await fetch(`/api/settings/backups/${backup.id}`, {
        method: "POST",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to restore backup",
        );
      }

      setBackupMessage(
        `Restored backup ${backup.label}. A safety snapshot was created before the restore.`,
      );
      await loadBackups();
    } catch (error) {
      setBackupError(
        error instanceof Error ? error.message : "Failed to restore backup",
      );
    } finally {
      setRestoringBackupId("");
      setSelectedRestoreBackup(null);
    }
  }

  async function downloadBackup() {
    setBackupLoading(true);
    setBackupMessage("");
    setBackupError("");

    try {
      const res = await fetch("/api/settings/backup?download=1", {
        method: "GET",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to create backup",
        );
      }

      const blob = new Blob([JSON.stringify(body, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pmt-backup-${String(body.generatedAt || new Date().toISOString()).replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setBackupSummary(body.tableCounts ?? null);
      setBackupMessage(
        "Backup created and downloaded successfully. Store it in a secure location.",
      );
      await loadBackups();
    } catch (error) {
      setBackupError(
        error instanceof Error ? error.message : "Failed to create backup",
      );
    } finally {
      setBackupLoading(false);
    }
  }

  async function createBackupNow() {
    setBackupNowLoading(true);
    setBackupMessage("");
    setBackupError("");

    try {
      const res = await fetch("/api/settings/backup", {
        method: "GET",
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to create backup",
        );
      }

      setBackupSummary(body.tableCounts ?? null);
      setBackupMessage("Backup snapshot created successfully.");
      await loadBackups();
    } catch (error) {
      setBackupError(
        error instanceof Error ? error.message : "Failed to create backup",
      );
    } finally {
      setBackupNowLoading(false);
    }
  }

  function triggerImportBackupFile() {
    if (!isSuperAdmin) return;
    setBackupError("");
    setBackupMessage("");
    importBackupInputRef.current?.click();
  }

  async function handleImportBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setImportingBackup(true);
    setBackupError("");
    setBackupMessage("");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch("/api/settings/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: parsed,
          label: file.name.replace(/\.json$/i, ""),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to import backup",
        );
      }

      setBackupSummary(body.tableCounts ?? null);
      setBackupMessage(
        "Backup imported and restored successfully. A safety snapshot was created first.",
      );
      await loadBackups();
    } catch (error) {
      setBackupError(
        error instanceof Error ? error.message : "Failed to import backup",
      );
    } finally {
      setImportingBackup(false);
    }
  }

  async function saveBackupSettings() {
    setBackupSettingsSaving(true);
    setBackupSettingsError("");
    setBackupSettingsSuccess(false);

    try {
      // First try to save to the database
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupAutomatic }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // If it fails due to missing column, we'll still save to localStorage
        console.warn(
          "Note: backupAutomatic database column not yet available. Using local storage for now."
        );
      }

      // Save to localStorage as fallback/local preference
      if (typeof window !== "undefined") {
        localStorage.setItem("backupAutomatic", JSON.stringify(backupAutomatic));
      }

      setOriginalBackupAutomatic(backupAutomatic);
      setBackupSettingsSuccess(true);
      setTimeout(() => setBackupSettingsSuccess(false), 3000);
    } catch (error) {
      setBackupSettingsError(
        error instanceof Error ? error.message : "Failed to save backup settings",
      );
    } finally {
      setBackupSettingsSaving(false);
    }
  }
}
