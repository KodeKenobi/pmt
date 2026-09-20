"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import TipTapEditor from "@/components/TipTapEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SelectMenu } from "@/components/SelectMenu";
import { cn } from "@/lib/utils";
import { onRealtimeChange } from "@/lib/realtime-events";
import { buildTicketBranchCommands } from "@/lib/ticket-branching";
import {
  ArrowLeft,
  Trash2,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Send,
  Activity,
  MessageSquare,
  Github,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
  Search,
  CalendarIcon,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SkeletonDropdown,
  SkeletonLine,
  SkeletonText,
} from "@/components/ui/Skeleton";

const PRIORITIES = [
  { value: "NONE", label: "None" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

const STATUSES = [
  "BACKLOG",
  "TODO",
  "REFINE",
  "IN_PROGRESS",
  "IN_REVIEW",
  "QA",
  "REVISIONS",
  "COMPLETE",
  "CLIENT_REVIEW",
] as const;

interface ClientObligation {
  id: string;
  ticketId: string;
  title: string;
  description?: string | null;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "OVERDUE";
  dueAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  evidenceNote?: string | null;
  evidenceUrl?: string | null;
  createdAt: string;
}

interface AssignableUser {
  id: string;
  name: string;
  email: string;
}

interface SprintOption {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED";
}

type EditableField =
  | "status"
  | "priority"
  | "assignee"
  | "sprint"
  | "startDate"
  | "dueDate";

export default function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingCount, setSavingCount] = useState(0);
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [savedField, setSavedField] = useState<EditableField | null>(null);
  const [commentText, setCommentText] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState<
    number | null
  >(null);
  const [obligations, setObligations] = useState<ClientObligation[]>([]);
  const [obligationsLoading, setObligationsLoading] = useState(false);
  const [creatingObligation, setCreatingObligation] = useState(false);
  const [obligationTitle, setObligationTitle] = useState("");
  const [obligationDueAt, setObligationDueAt] = useState<Date | undefined>(
    undefined,
  );

  // GitHub integration states
  const [_checkingGithub, setCheckingGithub] = useState(true);
  const [githubConnected, setGithubConnected] = useState(false);
  const [_githubUser, setGithubUser] = useState<{
    login: string;
    avatarUrl: string;
  } | null>(null);

  // Modals state
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: "unlinkBranch"; id: string }
    | { type: "unlinkPr"; id: string }
    | { type: "deleteTicket" }
    | null
  >(null);

  // Lists from APIs
  const [availableRepos, setAvailableRepos] = useState<any[]>([]);
  const [availableBranches, setAvailableBranches] = useState<any[]>([]);
  const [availablePRs, setAvailablePRs] = useState<any[]>([]);
  const [liveMatchingBranches, setLiveMatchingBranches] = useState<
    Array<{ name: string; url: string }>
  >([]);
  const [liveWorkflowRun, setLiveWorkflowRun] = useState<{
    workflowName: string;
    conclusion: string;
    status: string;
    url?: string;
  } | null>(null);

  const [searchRepo, setSearchRepo] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(false);
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(false);

  const [activeRepo, setActiveRepo] = useState<{
    owner: string;
    name: string;
  } | null>(null);
  const patchTimersRef = useRef<
    Partial<Record<EditableField, ReturnType<typeof setTimeout>>>
  >({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = savingCount > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (res.status === 404) {
        setError("Ticket not found");
        setTicket(null);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTicket(data);
    } catch {
      setError("Could not load ticket");
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const checkGithubAuth = useCallback(async () => {
    try {
      setCheckingGithub(true);
      const res = await fetch("/api/github/auth");
      const data = await res.json();
      if (res.ok && data.connected) {
        setGithubConnected(true);
        setGithubUser(data.githubUser);
      } else {
        setGithubConnected(false);
        setGithubUser(null);
      }
    } catch {
      setGithubConnected(false);
    } finally {
      setCheckingGithub(false);
    }
  }, []);

  const loadObligations = useCallback(async () => {
    try {
      setObligationsLoading(true);
      const response = await fetch(`/api/tickets/${ticketId}/obligations`);
      if (!response.ok) {
        setObligations([]);
        return;
      }
      const data = (await response.json()) as ClientObligation[];
      setObligations(Array.isArray(data) ? data : []);
    } catch {
      setObligations([]);
    } finally {
      setObligationsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!authLoading && user) {
      void load();
      void loadObligations();
      void checkGithubAuth();
    }
  }, [authLoading, user, load, loadObligations, checkGithubAuth]);

  useEffect(() => {
    if (authLoading || !user) return;

    const unsubscribe = onRealtimeChange(() => {
      void load();
      void loadObligations();
    });

    return unsubscribe;
  }, [authLoading, user, load, loadObligations]);

  useEffect(() => {
    if (authLoading || !user || user.role === "CLIENT") return;

    const teamId = (ticket as { team?: { id: string } | null } | null)?.team
      ?.id;
    if (!teamId) {
      setAssignableUsers([]);
      setSprintOptions([]);
      setLoadingAssignableUsers(false);
      setLoadingSprints(false);
      return;
    }

    let canceled = false;

    const loadTeamDependencies = async () => {
      setLoadingAssignableUsers(true);
      setLoadingSprints(true);

      const [membersRes, sprintsRes] = await Promise.allSettled([
        fetch(`/api/teams/${teamId}/members`),
        fetch(`/api/sprints?teamId=${teamId}`),
      ]);

      if (canceled) return;

      try {
        if (membersRes.status === "fulfilled" && membersRes.value.ok) {
          const body = (await membersRes.value.json()) as {
            members?: Array<{ userId: string; name: string; email: string }>;
          };
          const members = Array.isArray(body.members) ? body.members : [];
          setAssignableUsers(
            members.map((member) => ({
              id: member.userId,
              name: member.name,
              email: member.email,
            })),
          );
        } else {
          setAssignableUsers([]);
        }
      } catch {
        setAssignableUsers([]);
      }

      try {
        if (sprintsRes.status === "fulfilled" && sprintsRes.value.ok) {
          const data = (await sprintsRes.value.json()) as SprintOption[];
          const sprints = Array.isArray(data) ? data : [];
          setSprintOptions(
            sprints.filter((sprint) => sprint.status !== "CLOSED"),
          );
        } else {
          setSprintOptions([]);
        }
      } catch {
        setSprintOptions([]);
      } finally {
        setLoadingAssignableUsers(false);
        setLoadingSprints(false);
      }
    };

    void loadTeamDependencies();

    return () => {
      canceled = true;
    };
  }, [authLoading, user, ticket]);

  useEffect(() => {
    if (authLoading || !user || !githubConnected) {
      setLiveMatchingBranches([]);
      setLiveWorkflowRun(null);
      return;
    }

    const ticketValue = ticket as {
      selectorId?: number | string | null;
      workType?: string | null;
      project?: {
        githubRepos?: Array<{ owner: string; name: string }>;
      } | null;
    } | null;

    const repo = ticketValue?.project?.githubRepos?.[0];
    if (!repo) {
      setLiveMatchingBranches([]);
      setLiveWorkflowRun(null);
      return;
    }

    const selectorIdRaw = ticketValue?.selectorId;
    const selectorId =
      typeof selectorIdRaw === "number"
        ? selectorIdRaw
        : typeof selectorIdRaw === "string"
          ? Number.parseInt(selectorIdRaw, 10)
          : NaN;

    if (!Number.isFinite(selectorId)) {
      setLiveMatchingBranches([]);
      setLiveWorkflowRun(null);
      return;
    }

    const workType =
      typeof ticketValue?.workType === "string" && ticketValue.workType.trim()
        ? ticketValue.workType.trim().toLowerCase()
        : "";

    let canceled = false;

    const run = async () => {
      try {
        const [branchesRes, workflowRunsRes] = await Promise.all([
          fetch(`/api/github/branches?owner=${repo.owner}&repo=${repo.name}`),
          fetch(
            `/api/github/workflows/runs?owner=${repo.owner}&repo=${repo.name}`,
          ),
        ]);

        if (!canceled && branchesRes.ok) {
          const branches = (await branchesRes.json()) as Array<{
            name?: string;
          }>;
          const selectorToken = `${Math.trunc(selectorId)}-`;
          const preferredPrefix = workType
            ? `${workType}/${selectorToken}`
            : null;

          const matched = (Array.isArray(branches) ? branches : [])
            .map((branch) => {
              const name = typeof branch.name === "string" ? branch.name : "";
              return {
                name,
                url: `https://github.com/${repo.owner}/${repo.name}/tree/${name}`,
              };
            })
            .filter((branch) => {
              if (!branch.name) return false;
              if (preferredPrefix && branch.name.startsWith(preferredPrefix)) {
                return true;
              }
              return branch.name.includes(`/${selectorToken}`);
            });

          setLiveMatchingBranches(matched);
        }

        if (!canceled && workflowRunsRes.ok) {
          const payload = (await workflowRunsRes.json()) as {
            runs?: Array<{
              name?: string;
              status?: string;
              conclusion?: string | null;
              html_url?: string;
              head_branch?: string;
            }>;
          };

          const runs = Array.isArray(payload.runs) ? payload.runs : [];
          const selectorToken = `${Math.trunc(selectorId)}-`;
          const matchedRun = runs.find((runItem) => {
            const branchName =
              typeof runItem.head_branch === "string"
                ? runItem.head_branch
                : "";
            return branchName.includes(`/${selectorToken}`);
          });

          setLiveWorkflowRun(
            matchedRun
              ? {
                  workflowName:
                    typeof matchedRun.name === "string"
                      ? matchedRun.name
                      : "Workflow",
                  status:
                    typeof matchedRun.status === "string"
                      ? matchedRun.status
                      : "unknown",
                  conclusion:
                    typeof matchedRun.conclusion === "string"
                      ? matchedRun.conclusion
                      : "unknown",
                  url:
                    typeof matchedRun.html_url === "string"
                      ? matchedRun.html_url
                      : undefined,
                }
              : null,
          );
        }
      } catch {
        if (!canceled) {
          setLiveMatchingBranches([]);
          setLiveWorkflowRun(null);
        }
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [authLoading, githubConnected, ticket, user]);

  const loadBranches = async (owner: string, repo: string) => {
    setLoadingBranches(true);
    try {
      const res = await fetch(
        `/api/github/branches?owner=${owner}&repo=${repo}`,
      );
      if (res.ok) {
        setAvailableBranches(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadPRs = async (owner: string, repo: string) => {
    setLoadingPRs(true);
    try {
      const res = await fetch(
        `/api/github/pull-requests?owner=${owner}&repo=${repo}`,
      );
      if (res.ok) {
        setAvailablePRs(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPRs(false);
    }
  };

  const loadRepos = async (query = "") => {
    setLoadingRepos(true);
    try {
      const url = query
        ? `/api/github/repos?q=${encodeURIComponent(query)}`
        : `/api/github/repos`;
      const res = await fetch(url);
      if (res.ok) {
        setAvailableRepos(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleLinkRepo = async (owner: string, name: string, url: string) => {
    if (!t.project?.id) return;
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: t.project.id,
          owner,
          name,
          url,
        }),
      });
      if (res.ok) {
        setShowRepoModal(false);
        void load();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to link repo");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLinkBranch = async (
    branchName: string,
    repoOwner: string,
    repoName: string,
  ) => {
    const url = `https://github.com/${repoOwner}/${repoName}/tree/${branchName}`;
    try {
      const res = await fetch("/api/github/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          name: branchName,
          url,
        }),
      });
      if (res.ok) {
        setShowBranchModal(false);
        void load();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to link branch");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLinkPR = async (pr: {
    title: string;
    number: number;
    html_url: string;
    state: string;
  }) => {
    try {
      const res = await fetch("/api/github/pull-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          title: pr.title,
          number: pr.number,
          url: pr.html_url,
          state: pr.state,
        }),
      });
      if (res.ok) {
        setShowPRModal(false);
        void load();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to link PR");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlinkBranch = async (id: string) => {
    try {
      const res = await fetch(`/api/github/branches?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) void load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlinkPR = async (id: string) => {
    try {
      const res = await fetch(`/api/github/pull-requests?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) void load();
    } catch (e) {
      console.error(e);
    }
  };

  const patchTicket = async (
    updates: Record<string, unknown>,
    field?: EditableField,
  ) => {
    setSavingCount((current) => current + 1);
    if (field) setSavingField(field);
    setError("");

    const previousTicket = ticket;
    setTicket((current) => {
      if (!current) return current;

      const next: Record<string, unknown> = {
        ...current,
        ...updates,
      };

      if ("assigneeId" in updates) {
        const assigneeId = updates.assigneeId;
        if (assigneeId === null || assigneeId === "") {
          next.assignee = null;
        } else if (typeof assigneeId === "string") {
          const selected = assignableUsers.find(
            (member) => member.id === assigneeId,
          );
          next.assignee = selected
            ? { id: selected.id, name: selected.name, email: selected.email }
            : current.assignee;
        }
      }

      if ("sprintId" in updates) {
        const sprintId = updates.sprintId;
        if (sprintId === null || sprintId === "") {
          next.sprint = null;
        } else if (typeof sprintId === "string") {
          const selectedSprint = sprintOptions.find(
            (sprint) => sprint.id === sprintId,
          );
          if (selectedSprint) {
            next.sprint = selectedSprint;
          }
        }
      }

      return next;
    });

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Save failed",
        );
      }
      const updatedTicket = await res.json().catch(() => null);
      if (updatedTicket && typeof updatedTicket === "object") {
        setTicket(updatedTicket as Record<string, unknown>);
      }
      if (field) {
        if (savedTimerRef.current) {
          clearTimeout(savedTimerRef.current);
        }
        setSavedField(field);
        savedTimerRef.current = setTimeout(() => {
          setSavedField((current) => (current === field ? null : current));
        }, 1000);
      }
    } catch (err) {
      setTicket(previousTicket);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingCount((current) => Math.max(0, current - 1));
      if (field) {
        setSavingField((current) => (current === field ? null : current));
      }
    }
  };

  const queuePatchTicket = (
    field: EditableField,
    updates: Record<string, unknown>,
  ) => {
    const timer = patchTimersRef.current[field];
    if (timer) {
      clearTimeout(timer);
    }

    patchTimersRef.current[field] = setTimeout(() => {
      delete patchTimersRef.current[field];
      void patchTicket(updates, field);
    }, 250);
  };

  useEffect(() => {
    const patchTimers = patchTimersRef.current;
    return () => {
      Object.values(patchTimers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const createObligation = async () => {
    const title = obligationTitle.trim();
    if (!title) return;
    setCreatingObligation(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/obligations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dueAt: obligationDueAt ? obligationDueAt.toISOString() : null,
        }),
      });
      if (response.ok) {
        setObligationTitle("");
        setObligationDueAt(undefined);
        void loadObligations();
      }
    } finally {
      setCreatingObligation(false);
    }
  };

  const updateObligationStatus = async (
    obligationId: string,
    status: ClientObligation["status"],
  ) => {
    const response = await fetch(
      `/api/tickets/${ticketId}/obligations/${obligationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    if (response.ok) {
      void loadObligations();
    }
  };

  const postComment = async () => {
    const rawBody = commentText.trim();
    const body = rawBody.replace(/<[^>]*>/g, "").trim();
    if (!body) return;
    const res = await fetch(`/api/tickets/${ticketId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: rawBody }),
    });
    if (res.ok) {
      setCommentText("");
      void load();
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploadMessage("");
    setUploadError("");
    setUploadBusy(true);
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
            method: "POST",
            body: fd,
          });
          return { ok: res.ok, file: file.name };
        }),
      );

      const failed = results.filter((r) => !r.ok);
      const succeeded = results.length - failed.length;

      if (succeeded > 0) {
        setUploadMessage(
          succeeded === 1
            ? "Attachment uploaded successfully."
            : `${succeeded} attachments uploaded successfully.`,
        );
        await load();
      }
      if (failed.length > 0) {
        setUploadError(
          failed.length === 1
            ? "1 attachment failed to upload."
            : `${failed.length} attachments failed to upload.`,
        );
      }
    } finally {
      setUploadBusy(false);
    }
  };

  const isImageAttachment = (attachment: {
    filename: string;
    mimeType?: string | null;
  }) => {
    const mime = (attachment.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.filename);
  };

  const openAttachmentGallery = (index: number) => {
    setActiveAttachmentIndex(index);
  };

  const closeAttachmentGallery = () => {
    setActiveAttachmentIndex(null);
  };

  const moveAttachment = (direction: -1 | 1, total: number) => {
    setActiveAttachmentIndex((prev) => {
      if (prev === null || total === 0) return prev;
      const next = (prev + direction + total) % total;
      return next;
    });
  };

  const deleteTicket = async () => {
    const res = await fetch(`/api/tickets/${ticketId}`, { method: "DELETE" });
    if (res.ok) router.push("/tickets");
  };

  const confirmTitle =
    confirmAction?.type === "unlinkBranch"
      ? "Unlink branch"
      : confirmAction?.type === "unlinkPr"
        ? "Unlink pull request"
        : "Delete ticket";

  const confirmMessage =
    confirmAction?.type === "unlinkBranch"
      ? "Are you sure you want to unlink this branch?"
      : confirmAction?.type === "unlinkPr"
        ? "Are you sure you want to unlink this pull request?"
        : "Delete this ticket permanently?";

  const runConfirmAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.type === "unlinkBranch") {
      await handleUnlinkBranch(confirmAction.id);
      setConfirmAction(null);
      return;
    }

    if (confirmAction.type === "unlinkPr") {
      await handleUnlinkPR(confirmAction.id);
      setConfirmAction(null);
      return;
    }

    await deleteTicket();
    setConfirmAction(null);
  };

  useEffect(() => {
    if (!ticket || loading) return;
    const title = typeof ticket.title === "string" ? ticket.title.trim() : "";
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · Ticket`;
    return () => {
      document.title = prev;
    };
  }, [ticket, loading]);

  if (authLoading || !user) {
    return (
      <DashboardLayout>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
            <SkeletonText className="h-7 w-2/5" />
            <SkeletonLine className="mt-3 h-4 w-3/5" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonLine className="h-4 w-1/4" />
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-11/12" />
              <SkeletonLine className="h-4 w-4/5" />
            </div>
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
            <SkeletonText className="h-7 w-2/5" />
            <SkeletonLine className="mt-3 h-4 w-3/5" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonLine className="h-4 w-1/4" />
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-11/12" />
              <SkeletonLine className="h-4 w-4/5" />
              <div className="mt-8 space-y-4">
                <SkeletonLine className="h-4 w-1/3" />
                <SkeletonLine className="h-32 w-full" />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1A1F2E]">
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
              <SkeletonDropdown className="w-full" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !ticket) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl py-12 text-center">
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {error || "Not found"}
          </p>
          <Link
            href="/tickets"
            className="mt-4 inline-block text-brand-600 hover:underline"
          >
            Back to tickets
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const t = ticket as {
    id: string;
    selectorId?: number | null;
    workType?: string | null;
    title: string;
    description: string | null;
    acceptanceCriteria?: string | null;
    status: string;
    priority?: string | null;
    startDate: string | null;
    dueDate: string | null;
    sprintId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    creator: { id: string; name: string; email: string };
    assignee?: { id: string; name: string; email: string } | null;
    client?: { id: string; name: string; email: string } | null;
    team?: { id: string; name: string } | null;
    sprint?: {
      id: string;
      name: string;
      status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED";
      startsAt?: string;
      endsAt?: string;
    } | null;
    project?: {
      id: string;
      name: string;
      githubRepos?: Array<{
        id: string;
        owner: string;
        name: string;
        url: string;
      }>;
    } | null;
    githubBranches?: Array<{
      id: string;
      name: string;
      url: string;
      createdAt: string;
    }>;
    githubPullRequests?: Array<{
      id: string;
      title: string;
      number: number;
      url: string;
      state: string;
      createdAt: string;
    }>;
    comments?: Array<{
      id: string;
      body: string;
      createdAt: string;
      author: { id: string; name: string; email: string };
    }>;
    checklistItems?: Array<{
      id: string;
      title: string;
      done: boolean;
      sortOrder: number;
    }>;
    attachments?: Array<{
      id: string;
      filename: string;
      url: string;
      size: number | null;
      mimeType?: string | null;
      uploadedBy?: { id: string; name: string } | null;
      createdAt: string;
    }>;
    activities?: Array<{
      id: string;
      type: string;
      summary: string;
      metadata?: string | null;
      createdAt: string;
      actor: { id: string; name: string };
    }>;
  };

  const normalizedStatus =
    typeof t.status === "string" && t.status.length > 0 ? t.status : "BACKLOG";

  const canEdit =
    user.role === "SUPER_ADMIN" ||
    user.role === "USER" ||
    (user.role === "CLIENT" && normalizedStatus === "CLIENT_REVIEW");
  const statusOptionsForUser =
    user.role === "CLIENT" ? ["REVISIONS", "COMPLETE"] : [...STATUSES];

  const priorityValue = t.priority ?? "MEDIUM";

  const formatWhen = (iso: string | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "—";
    }
  };

  const parseDateOnly = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") return undefined;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
  };

  const parseActivityMetadata = (metadata: string | null | undefined) => {
    if (!metadata || typeof metadata !== "string") return null;
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const statusLabel = (s?: string | null) => {
    if (!s) return "Backlog";
    if (s === "REVISIONS") return "Revisions";
    if (s === "IN_REVIEW") return "In Review";
    if (s === "QA") return "QA";
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const renderCommentHtml = (html: string) => {
    if (!html) return "";
    if (typeof window === "undefined") return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style").forEach((node) => node.remove());
    doc.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.toLowerCase();
        if (name.startsWith("on") || value.startsWith("javascript:")) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return doc.body.innerHTML;
  };

  const primaryProjectRepo = t.project?.githubRepos?.[0] ?? null;
  const effectiveStartDate = t.sprint?.startsAt ?? t.startDate;
  const effectiveDueDate = t.sprint?.endsAt ?? t.dueDate;
  const isSprintScheduleManaged = Boolean(t.sprint?.id);

  const githubCheckRunsByName = new Map<
    string,
    { conclusion: string; status: string; url?: string }
  >();
  let latestWorkflowRun:
    | {
        workflowName: string;
        conclusion: string;
        status: string;
        url?: string;
        environment?: string;
      }
    | undefined;
  let latestDeployment:
    | { state: string; environment?: string; url?: string }
    | undefined;
  let latestThreadCounts:
    | { resolved: number; unresolved: number; total: number }
    | undefined;

  for (const activity of t.activities ?? []) {
    const meta = parseActivityMetadata(activity.metadata);
    if (!meta) continue;

    if (activity.type === "GH_CHECK_RUN") {
      const checkName =
        typeof meta.checkName === "string" ? meta.checkName : "";
      if (!checkName || githubCheckRunsByName.has(checkName)) continue;
      githubCheckRunsByName.set(checkName, {
        conclusion:
          typeof meta.conclusion === "string" ? meta.conclusion : "unknown",
        status: typeof meta.status === "string" ? meta.status : "unknown",
        url: typeof meta.url === "string" ? meta.url : undefined,
      });
      continue;
    }

    if (!latestWorkflowRun && activity.type === "GH_WORKFLOW_RUN") {
      latestWorkflowRun = {
        workflowName:
          typeof meta.workflowName === "string"
            ? meta.workflowName
            : "Workflow",
        conclusion:
          typeof meta.conclusion === "string" ? meta.conclusion : "unknown",
        status: typeof meta.status === "string" ? meta.status : "unknown",
        url: typeof meta.url === "string" ? meta.url : undefined,
        environment:
          typeof meta.environment === "string" ? meta.environment : undefined,
      };
      continue;
    }

    if (!latestDeployment && activity.type === "GH_DEPLOYMENT") {
      latestDeployment = {
        state: typeof meta.state === "string" ? meta.state : "unknown",
        environment:
          typeof meta.environment === "string" ? meta.environment : undefined,
        url: typeof meta.url === "string" ? meta.url : undefined,
      };
      continue;
    }

    if (!latestThreadCounts && activity.type === "GH_REVIEW_THREAD_COUNTS") {
      latestThreadCounts = {
        resolved:
          typeof meta.resolved === "number" ? Math.trunc(meta.resolved) : 0,
        unresolved:
          typeof meta.unresolved === "number" ? Math.trunc(meta.unresolved) : 0,
        total: typeof meta.total === "number" ? Math.trunc(meta.total) : 0,
      };
    }
  }

  const failingChecks = Array.from(githubCheckRunsByName.entries())
    .filter(([, value]) => {
      const conclusion = value.conclusion.toLowerCase();
      return (
        value.status === "completed" &&
        !["success", "neutral", "skipped"].includes(conclusion)
      );
    })
    .map(([name, value]) => ({
      name,
      conclusion: value.conclusion,
      url: value.url,
    }));

  const ticketBranchPlan = buildTicketBranchCommands({
    workType: t.workType ?? "chore",
    selectorId: t.selectorId ?? null,
    title: typeof t.title === "string" ? t.title : "",
  });
  const effectiveWorkflowRun =
    latestWorkflowRun ?? liveWorkflowRun ?? undefined;
  const displayedBranches =
    t.githubBranches && t.githubBranches.length > 0
      ? t.githubBranches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          url: branch.url,
          linked: true,
        }))
      : liveMatchingBranches.map((branch) => ({
          id: `live:${branch.name}`,
          name: branch.name,
          url: branch.url,
          linked: false,
        }));

  return (
    <DashboardLayout>
      <div className="w-full pb-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/tickets"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-brand-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Tickets
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              {t.title || "Untitled ticket"}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm">
              {typeof t.selectorId === "number" ? (
                <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 font-semibold text-brand-700 dark:border-brand-900/40 dark:bg-brand-500/10 dark:text-brand-300">
                  Ticket #{t.selectorId}
                </span>
              ) : null}
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-800 dark:border-gray-700 dark:bg-white/10 dark:text-gray-200">
                {statusLabel(normalizedStatus)}
              </span>
              {t.project ? (
                <span className="rounded-full border border-gray-200 px-2.5 py-1 text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  Project: {t.project.name}
                </span>
              ) : null}
              {t.sprint ? (
                <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-purple-700 dark:border-purple-700/50 dark:bg-purple-500/10 dark:text-purple-300">
                  Sprint: {t.sprint.name}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-500 dark:border-gray-600">
                  Backlog
                </span>
              )}
              {t.client ? (
                <span className="rounded-full border border-gray-200 px-2.5 py-1 text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  Client: {t.client.name}
                </span>
              ) : null}
              {t.assignee ? (
                <span className="rounded-full border border-gray-200 px-2.5 py-1 text-gray-600 dark:border-gray-700 dark:text-gray-400">
                  Assignee: {t.assignee.name}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-500 dark:border-gray-600">
                  Unassigned
                </span>
              )}
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Created {formatWhen(t.createdAt)}
              {t.updatedAt && t.updatedAt !== t.createdAt
                ? ` · Updated ${formatWhen(t.updatedAt)}`
                : null}
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Branch command for this ticket
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {ticketBranchPlan.branchName}
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-100">
                {ticketBranchPlan.commands.join("\n")}
              </pre>
            </div>
            {t.project ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Project repo:{" "}
                {primaryProjectRepo ? (
                  <a
                    href={primaryProjectRepo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {primaryProjectRepo.owner}/{primaryProjectRepo.name}
                  </a>
                ) : (
                  <span>Not linked</span>
                )}
              </p>
            ) : null}
            <p className="mt-2 mb-4 font-mono text-xs text-gray-400 break-all">
              Ticket ID: {t.id}
            </p>
          </div>
          {(user.role === "SUPER_ADMIN" || t.creator.id === user.id) && (
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "deleteTicket" })}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                Description
              </h2>
              {canEdit ? (
                <textarea
                  className="min-h-[160px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  defaultValue={t.description ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (t.description ?? "")) {
                      void patchTicket({ description: e.target.value });
                    }
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                  {t.description || "—"}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                    Client Obligations
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Track client-owned deliverables and hold review timelines
                    accountable.
                  </p>
                </div>
              </div>

              {user.role !== "CLIENT" ? (
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <input
                    value={obligationTitle}
                    onChange={(e) => setObligationTitle(e.target.value)}
                    placeholder="Client action required"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-10 justify-start text-left font-normal border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950 dark:text-white",
                          !obligationDueAt && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {obligationDueAt
                          ? format(obligationDueAt, "PPP")
                          : "Pick due date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={obligationDueAt}
                        onSelect={setObligationDueAt}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    onClick={() => void createObligation()}
                    disabled={creatingObligation}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingObligation ? "Adding..." : "Add"}
                  </button>
                </div>
              ) : null}

              {obligationsLoading ? (
                <div className="space-y-2">
                  <SkeletonLine className="h-4 w-full" />
                  <SkeletonLine className="h-4 w-5/6" />
                  <SkeletonLine className="h-4 w-4/6" />
                </div>
              ) : obligations.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No client obligations yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {obligations.map((obligation) => (
                    <li
                      key={obligation.id}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {obligation.title}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Status: {obligation.status}
                            {obligation.dueAt
                              ? ` · Due ${new Date(obligation.dueAt).toLocaleString()}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {user.role === "CLIENT" &&
                          obligation.status === "PENDING" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void updateObligationStatus(
                                  obligation.id,
                                  "SUBMITTED",
                                )
                              }
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                            >
                              Mark submitted
                            </button>
                          ) : null}

                          {user.role !== "CLIENT" &&
                          obligation.status === "SUBMITTED" ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateObligationStatus(
                                    obligation.id,
                                    "APPROVED",
                                  )
                                }
                                className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateObligationStatus(
                                    obligation.id,
                                    "REJECTED",
                                  )
                                }
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                Acceptance Criteria (QA)
              </h2>
              {canEdit ? (
                <textarea
                  className="min-h-[140px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  defaultValue={t.acceptanceCriteria ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (t.acceptanceCriteria ?? "")) {
                      void patchTicket({ acceptanceCriteria: e.target.value });
                    }
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                  {t.acceptanceCriteria || "—"}
                </p>
              )}
            </section>

            {/* GitHub Integration Section */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200">
                    <Github className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                      GitHub Workspace
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sync branches and pull requests with this ticket
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!githubConnected ? (
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/25"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Connect GitHub in Settings
                    </Link>
                  ) : !t.project ? (
                    <span className="text-xs text-gray-400">
                      Assign a project to link code repositories
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {t.project.githubRepos &&
                      t.project.githubRepos.length > 0 ? (
                        <>
                          <button
                            onClick={() => {
                              const r = t.project!.githubRepos![0];
                              setActiveRepo({ owner: r.owner, name: r.name });
                              void loadBranches(r.owner, r.name);
                              setShowBranchModal(true);
                            }}
                            className="btn-primary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            Link Branch
                          </button>
                          <button
                            onClick={() => {
                              const r = t.project!.githubRepos![0];
                              setActiveRepo({ owner: r.owner, name: r.name });
                              void loadPRs(r.owner, r.name);
                              setShowPRModal(true);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80 cursor-pointer"
                          >
                            <GitPullRequest className="w-3.5 h-3.5" />
                            Link PR
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            void loadRepos();
                            setShowRepoModal(true);
                          }}
                          className="btn-primary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Link Repo to Project
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Failing Checks
                  </p>
                  {failingChecks.length === 0 ? (
                    <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                      No failing checks
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {failingChecks.slice(0, 4).map((check) => (
                        <li
                          key={check.name}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-xs text-red-600 dark:text-red-400">
                            {check.name}
                          </span>
                          {check.url ? (
                            <a
                              href={check.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-brand-500"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Latest Workflow
                  </p>
                  {effectiveWorkflowRun ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-800 dark:text-gray-100">
                        {effectiveWorkflowRun.workflowName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {effectiveWorkflowRun.conclusion ||
                          effectiveWorkflowRun.status}
                        {"environment" in (effectiveWorkflowRun || {}) &&
                        (effectiveWorkflowRun as any).environment
                          ? ` · ${(effectiveWorkflowRun as any).environment}`
                          : ""}
                      </p>
                      {effectiveWorkflowRun.url ? (
                        <a
                          href={effectiveWorkflowRun.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Open workflow <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      No workflow run yet.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Deploy + Review Threads
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">
                      Deploy: {latestDeployment?.state ?? "N/A"}
                      {latestDeployment?.environment
                        ? ` · ${latestDeployment.environment}`
                        : ""}
                    </p>
                    {latestDeployment?.url ? (
                      <a
                        href={latestDeployment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Open deploy <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      Threads: {latestThreadCounts?.unresolved ?? 0} unresolved
                      / {latestThreadCounts?.resolved ?? 0} resolved
                    </p>
                  </div>
                </div>
              </div>

              {/* Linked Items List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Branches */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                    Linked Branches ({displayedBranches.length})
                  </h3>
                  {displayedBranches.length === 0 ? (
                    <p className="text-xs text-gray-500 bg-slate-50/50 dark:bg-white/5 rounded-lg p-3 border border-dashed border-gray-200 dark:border-gray-800">
                      No branches linked yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {displayedBranches.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400 truncate bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
                            >
                              {b.name}
                            </a>
                          </div>
                          {canEdit && b.linked && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  type: "unlinkBranch",
                                  id: b.id,
                                })
                              }
                              className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              Unlink
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* PRs */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <GitPullRequest className="w-3.5 h-3.5 text-red-500" />
                    Linked Pull Requests ({(t.githubPullRequests ?? []).length})
                  </h3>
                  {!t.githubPullRequests ||
                  t.githubPullRequests.length === 0 ? (
                    <p className="text-xs text-gray-500 bg-slate-50/50 dark:bg-white/5 rounded-lg p-3 border border-dashed border-gray-200 dark:border-gray-800">
                      No pull requests linked yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {t.githubPullRequests.map((pr) => {
                        const isMerged = pr.state === "merged";
                        const isOpen = pr.state === "open";
                        return (
                          <li
                            key={pr.id}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5"
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-xs text-brand-700 dark:text-brand-400 truncate hover:underline"
                              >
                                #{pr.number} {pr.title}
                              </a>
                              <span
                                className={cn(
                                  "inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                  isMerged &&
                                    "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                                  isOpen &&
                                    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
                                  !isOpen &&
                                    !isMerged &&
                                    "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                                )}
                              >
                                {pr.state}
                              </span>
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-brand-500"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            {canEdit && (
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    type: "unlinkPr",
                                    id: pr.id,
                                  })
                                }
                                className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-2 py-1 rounded transition-colors cursor-pointer"
                              >
                                Unlink
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-brand-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                  Activity
                </h2>
              </div>
              <ul className="space-y-4">
                {(t.activities ?? []).map((a) => {
                  let githubUrl = "";
                  let githubComment = "";

                  if (typeof a.metadata === "string" && a.metadata) {
                    try {
                      const parsed: any = JSON.parse(a.metadata);
                      githubUrl =
                        typeof parsed.url === "string" ? parsed.url : "";
                      githubComment =
                        typeof parsed.comment === "string"
                          ? parsed.comment
                          : "";
                    } catch {
                      githubUrl = "";
                      githubComment = "";
                    }
                  }

                  return (
                    <li
                      key={a.id}
                      className="flex gap-4 border-b border-gray-100 pb-4 last:border-0 dark:border-gray-800"
                    >
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {a.summary}
                        </p>
                        {githubComment ? (
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                            {githubComment}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-500">
                          {a.actor?.name ?? "System"} ·{" "}
                          {new Date(a.createdAt).toLocaleString()}
                          {githubUrl ? (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={githubUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:underline dark:text-brand-400"
                              >
                                View on GitHub
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {(t.activities?.length ?? 0) === 0 && (
                <p className="text-sm text-gray-500">No activity yet.</p>
              )}
            </section>

            <section className="space-y-6">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
                <div className="mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-brand-600" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                    Comments
                  </h2>
                </div>
                <ul className="space-y-6">
                  {(t.comments ?? []).map((c) => (
                    <li
                      key={c.id}
                      className="border-b border-gray-100 pb-6 last:border-0 dark:border-gray-800"
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {c.author.name}
                      </p>
                      <div
                        className="prose prose-sm mt-1 max-w-none text-sm text-gray-700 dark:prose-invert dark:text-gray-300"
                        dangerouslySetInnerHTML={{
                          __html: renderCommentHtml(c.body),
                        }}
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
                {(t.comments?.length ?? 0) === 0 && (
                  <p className="text-sm text-gray-500">No comments yet.</p>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 dark:border-gray-800 dark:bg-[#1A1F2E]">
                  <TipTapEditor
                    content={commentText}
                    setContent={setCommentText}
                  />
                  <button
                    type="button"
                    onClick={() => void postComment()}
                    className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    <Send className="h-4 w-4" />
                    Comment
                  </button>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <h3 className="mb-3 text-xs font-bold uppercase text-gray-500">
                Edit fields
              </h3>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Status</label>
                    {savingField === "status" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                    )}
                    {savingField !== "status" && savedField === "status" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                  </div>
                  <SelectMenu
                    value={normalizedStatus}
                    onChange={(value) => {
                      queuePatchTicket("status", { status: value });
                    }}
                    disabled={!canEdit}
                    options={statusOptionsForUser.map((s) => ({
                      value: s,
                      label: statusLabel(s),
                    }))}
                    className="w-full"
                    triggerClassName="border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Priority</label>
                    {savingField === "priority" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                    )}
                    {savingField !== "priority" &&
                      savedField === "priority" && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                  </div>
                  <SelectMenu
                    value={priorityValue}
                    onChange={(value) => {
                      queuePatchTicket("priority", { priority: value });
                    }}
                    disabled={!canEdit || user.role === "CLIENT"}
                    options={PRIORITIES.map((p) => ({
                      value: p.value,
                      label: p.label,
                    }))}
                    className="w-full"
                    triggerClassName="border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Assignee</label>
                    {savingField === "assignee" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                    )}
                    {savingField !== "assignee" &&
                      savedField === "assignee" && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                  </div>
                  <SelectMenu
                    value={t.assignee?.id ?? "__unassigned__"}
                    onChange={(value) => {
                      queuePatchTicket("assignee", {
                        assigneeId: value === "__unassigned__" ? null : value,
                      });
                    }}
                    disabled={!canEdit || user.role === "CLIENT"}
                    options={[
                      {
                        value: "__unassigned__",
                        label: "Unassigned",
                      },
                      ...assignableUsers.map((member) => ({
                        value: member.id,
                        label: `${member.name}`,
                      })),
                    ]}
                    className="w-full"
                    triggerClassName="border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Select assignee"
                  />
                  {loadingAssignableUsers ? (
                    <SkeletonDropdown className="mt-2 w-full" />
                  ) : null}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Sprint</label>
                    {savingField === "sprint" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                    )}
                    {savingField !== "sprint" && savedField === "sprint" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                  </div>
                  <SelectMenu
                    value={t.sprint?.id ?? "__backlog__"}
                    onChange={(value) => {
                      queuePatchTicket("sprint", {
                        sprintId: value === "__backlog__" ? null : value,
                      });
                    }}
                    disabled={!canEdit || user.role === "CLIENT"}
                    options={[
                      { value: "__backlog__", label: "Backlog" },
                      ...sprintOptions.map((sprint) => ({
                        value: sprint.id,
                        label: `${sprint.name} (${sprint.status})`,
                      })),
                    ]}
                    className="w-full"
                    triggerClassName="border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                    placeholder="Select sprint"
                  />
                  {loadingSprints ? (
                    <SkeletonDropdown className="mt-2 w-full" />
                  ) : null}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Start date</label>
                    {savingField === "startDate" && (
                      <span className="text-xs text-gray-500">Saving...</span>
                    )}
                    {savingField !== "startDate" &&
                      savedField === "startDate" && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={
                          !canEdit ||
                          user.role === "CLIENT" ||
                          isSprintScheduleManaged
                        }
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !effectiveStartDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />

                        {effectiveStartDate
                          ? format(
                              parseDateOnly(effectiveStartDate) ??
                                new Date(effectiveStartDate),
                              "PPP",
                            )
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={parseDateOnly(effectiveStartDate)}
                        onSelect={(date) => {
                          queuePatchTicket("startDate", {
                            startDate: date ? format(date, "yyyy-MM-dd") : null,
                          });
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-gray-500">Due date</label>
                    {savingField === "dueDate" && (
                      <span className="text-xs text-gray-500">Saving...</span>
                    )}
                    {savingField !== "dueDate" && savedField === "dueDate" && (
                      <span className="text-xs text-emerald-600">Saved</span>
                    )}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={
                          !canEdit ||
                          user.role === "CLIENT" ||
                          isSprintScheduleManaged
                        }
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !effectiveDueDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />

                        {effectiveDueDate
                          ? format(
                              parseDateOnly(effectiveDueDate) ??
                                new Date(effectiveDueDate),
                              "PPP",
                            )
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={parseDateOnly(effectiveDueDate)}
                        onSelect={(date) => {
                          queuePatchTicket("dueDate", {
                            dueDate: date ? format(date, "yyyy-MM-dd") : null,
                          });
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {saving && <p className="mt-2 text-xs text-gray-500">Saving…</p>}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-card dark:border-gray-800 dark:bg-[#1A1F2E]">
              <div className="mb-3 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-brand-600" />
                <h3 className="text-xs font-bold uppercase text-gray-500">
                  Attachments
                </h3>
              </div>

              {(t.attachments ?? []).length === 0 ? (
                <p className="text-xs text-gray-500">No attachments yet.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="inline-flex min-w-full gap-2 px-1">
                    {(t.attachments ?? []).map((a, index) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => openAttachmentGallery(index)}
                        className="group h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition hover:border-brand-400 dark:border-gray-700 dark:bg-gray-950"
                        title={a.filename}
                      >
                        {isImageAttachment(a) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.url}
                            alt={a.filename}
                            className="h-14 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-14 items-center justify-center border-b border-gray-100 text-[11px] font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">
                            FILE
                          </div>
                        )}
                        <div className="px-2 py-1.5">
                          <p className="truncate text-[11px] font-medium text-gray-800 group-hover:text-brand-700 dark:text-gray-200 dark:group-hover:text-brand-400">
                            {a.filename}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {uploadMessage ? (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                  {uploadMessage}
                </p>
              ) : null}
              {uploadError ? (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {uploadError}
                </p>
              ) : null}

              {canEdit && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onUpload}
                    disabled={uploadBusy}
                  />
                  {uploadBusy ? "Uploading…" : "+ Upload file(s)"}
                </label>
              )}
            </div>
          </aside>
        </div>
      </div>

      {activeAttachmentIndex !== null && (t.attachments?.length ?? 0) > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-[#0F1419]">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <p className="truncate pr-3 text-sm font-medium text-gray-200">
                {t.attachments?.[activeAttachmentIndex]?.filename}
              </p>
              <button
                type="button"
                onClick={closeAttachmentGallery}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                title="Close gallery"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <button
                type="button"
                onClick={() => moveAttachment(-1, t.attachments?.length ?? 0)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                title="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex h-full items-center justify-center p-4">
                {isImageAttachment(t.attachments![activeAttachmentIndex]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.attachments![activeAttachmentIndex].url}
                    alt={t.attachments![activeAttachmentIndex].filename}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="rounded-lg border border-gray-700 bg-gray-900/80 p-6 text-center">
                    <p className="text-sm font-semibold text-gray-200">
                      {t.attachments![activeAttachmentIndex].filename}
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      Preview is not available for this file type.
                    </p>
                    <a
                      href={t.attachments![activeAttachmentIndex].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                    >
                      Open file
                    </a>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => moveAttachment(1, t.attachments?.length ?? 0)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                title="Next"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="border-t border-gray-800 p-3">
              <div className="overflow-x-auto">
                <div className="inline-flex gap-2">
                  {t.attachments!.map((a, idx) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setActiveAttachmentIndex(idx)}
                      className={cn(
                        "h-14 w-24 shrink-0 overflow-hidden rounded border",
                        idx === activeAttachmentIndex
                          ? "border-brand-500"
                          : "border-gray-700",
                      )}
                    >
                      {isImageAttachment(a) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url}
                          alt={a.filename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gray-900 text-[10px] font-semibold text-gray-300">
                          FILE
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Modals */}
      {showBranchModal && activeRepo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-[#1A1F2E] dark:to-[#1A1F2E]">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Link Git Branch
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select a branch from {activeRepo.owner}/{activeRepo.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBranchModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-96 space-y-3">
              {loadingBranches ? (
                <div className="space-y-2 p-2">
                  <SkeletonLine className="h-10 w-full rounded-lg" />
                  <SkeletonLine className="h-10 w-full rounded-lg" />
                  <SkeletonLine className="h-10 w-3/4 rounded-lg" />
                </div>
              ) : availableBranches.length === 0 ? (
                <p className="text-center py-8 text-sm text-gray-500">
                  No branches found in this repository.
                </p>
              ) : (
                <div className="space-y-2">
                  {availableBranches.map((branch) => (
                    <button
                      key={branch.name}
                      onClick={() =>
                        void handleLinkBranch(
                          branch.name,
                          activeRepo.owner,
                          activeRepo.name,
                        )
                      }
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-slate-50/50 dark:bg-white/5 hover:border-brand-500/30 hover:bg-brand-50/10 dark:hover:bg-brand-500/5 hover:shadow-sm text-left transition-all duration-150 group cursor-pointer"
                    >
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold group-hover:text-brand-600">
                        {branch.name}
                      </span>
                      <span className="text-[10px] font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        Link Branch &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPRModal && activeRepo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-[#1A1F2E] dark:to-[#1A1F2E]">
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Link Pull Request
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select a pull request from {activeRepo.owner}/
                    {activeRepo.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPRModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-96 space-y-3">
              {loadingPRs ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
                  <span>Loading PRs from GitHub...</span>
                </div>
              ) : availablePRs.length === 0 ? (
                <p className="text-center py-8 text-sm text-gray-500">
                  No pull requests found in this repository.
                </p>
              ) : (
                <div className="space-y-2">
                  {availablePRs.map((pr) => (
                    <button
                      key={pr.id}
                      onClick={() => void handleLinkPR(pr)}
                      className="w-full flex items-center justify-between gap-4 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-slate-50/50 dark:bg-white/5 hover:border-brand-500/30 hover:bg-brand-50/10 dark:hover:bg-brand-500/5 hover:shadow-sm text-left transition-all duration-150 group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-600">
                          #{pr.number} {pr.title}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {pr.created_at
                            ? `Created ${formatWhen(pr.created_at)}`
                            : "Created"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={cn(
                            "inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                            pr.state === "open" &&
                              "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
                            pr.state === "closed" &&
                              "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                          )}
                        >
                          {pr.state}
                        </span>
                        <span className="text-[10px] font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Link &rarr;
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={
          confirmAction?.type === "deleteTicket" ? "Delete" : "Unlink"
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void runConfirmAction();
        }}
      />

      {showRepoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1F2E] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-[#1A1F2E] dark:to-[#1A1F2E]">
              <div className="flex items-center gap-2">
                <Github className="w-5 h-5 text-slate-800 dark:text-white" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Link Git Repository to Project
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Enable branch tracking for this project's tickets
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRepoModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search repository name..."
                  value={searchRepo}
                  onChange={(e) => setSearchRepo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadRepos(searchRepo);
                  }}
                  className="w-full pl-10 input-modern"
                />
                <button
                  onClick={() => void loadRepos(searchRepo)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  Search
                </button>
              </div>

              <div className="overflow-y-auto max-h-80 space-y-3 pr-1">
                {loadingRepos ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
                    <span>Searching GitHub repositories...</span>
                  </div>
                ) : availableRepos.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-500">
                    No repositories found. Enter search term above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() =>
                          void handleLinkRepo(
                            repo.owner.login,
                            repo.name,
                            repo.html_url,
                          )
                        }
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-slate-50/50 dark:bg-white/5 hover:border-brand-500/30 hover:bg-brand-50/10 dark:hover:bg-brand-500/5 hover:shadow-sm text-left transition-all duration-150 group cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-600">
                            {repo.full_name}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {repo.description || "No description"}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          Link to Project &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
