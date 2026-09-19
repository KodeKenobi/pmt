"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ComponentType,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Search,
  LogOut,
  Menu,
  X,
  Settings,
  User,
  ChevronDown,
  ChevronRight,
  Power,
  Moon,
  Sun,
  BarChart3,
  Bell,
  GitPullRequest,
  Ticket,
  Rocket,
  ShieldAlert,
  MessageSquare,
  Info,
  ArrowUpRight,
  Download,
  Monitor,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTeam } from "@/contexts/TeamContext";
import { SelectMenu } from "@/components/SelectMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { onRealtimeChange } from "@/lib/realtime-events";
import { AtomIcon } from "@/components/icons/atom-icon";
import { SquareStackIcon } from "@/components/icons/square-stack-icon";
import { TornadoIcon } from "@/components/icons/tornado-icon";
import { CalendarCogIcon } from "@/components/icons/calendar-cog-icon";
import { ReceiptTextIcon } from "@/components/icons/receipt-text-icon";
import { FileTextIcon } from "@/components/icons/file-text-icon";
import { FolderCodeIcon } from "@/components/icons/folder-code-icon";
import { UsersIcon } from "@/components/icons/users-icon";
import { WaypointsIcon } from "@/components/icons/waypoints-icon";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNotifications,
  invalidateNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  selectNotifications,
  selectNotificationsStatus,
} from "@/store/slices/notificationsSlice";
import type { AppNotification } from "@/store/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

type ElectronAPI = {
  getPlatform: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  onUpdateAvailable: (cb: (info: { version?: string }) => void) => () => void;
  onUpdateDownloaded: (cb: (info: { version?: string }) => void) => () => void;
  onUpdateProgress: (
    cb: (progress: { percent?: number }) => void,
  ) => () => void;
  checkForUpdates: () => Promise<{ version: string | null }>;
  installUpdate: () => Promise<void>;
};

// ── Notification grouping ────────────────────────────────────────────────────
const NOTIF_GROUPS: {
  key: string;
  label: string;
  match: (type: string) => boolean;
}[] = [
  {
    key: "system",
    label: "System updates",
    match: (t) => t.startsWith("SYSTEM_") || t === "DEPLOYMENT_SUCCEEDED",
  },
  {
    key: "review",
    label: "Review activity",
    match: (t) => t.startsWith("PR_") || t.startsWith("GH_"),
  },
  {
    key: "workflow",
    label: "Ticket activity",
    match: (t) =>
      [
        "ASSIGNMENT",
        "COMMENT",
        "CHECKLIST",
        "ATTACHMENT",
        "CLIENT_OBLIGATION",
        "TICKET_COMPLETED",
        "CREATED",
        "REPO_CONTEXT_INHERITED",
        "GITHUB_REPO_CONTEXT",
      ].includes(t),
  },
  {
    key: "monitor",
    label: "Monitoring alerts",
    match: (t) => t.startsWith("MONITORING_"),
  },
  {
    key: "feedback",
    label: "Client messages",
    match: (t) => t === "CLIENT_FEEDBACK",
  },
  { key: "other", label: "Other updates", match: () => true },
];

const GROUP_META: Record<
  string,
  { icon: React.ReactNode; accent: string; bg: string }
> = {
  system: {
    icon: <Rocket className="h-3.5 w-3.5" />,
    accent: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
  },
  review: {
    icon: <GitPullRequest className="h-3.5 w-3.5" />,
    accent: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-500/15",
  },
  workflow: {
    icon: <Ticket className="h-3.5 w-3.5" />,
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
  },
  monitor: {
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    accent: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-500/15",
  },
  feedback: {
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    accent: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
  },
  other: {
    icon: <Info className="h-3.5 w-3.5" />,
    accent: "text-gray-500 dark:text-gray-400",
    bg: "bg-gray-100 dark:bg-gray-700/40",
  },
};

function groupNotifications(notifications: AppNotification[]) {
  const result: { key: string; label: string; items: AppNotification[] }[] = [];
  const placed = new Set<string>();
  for (const group of NOTIF_GROUPS) {
    const items = notifications.filter(
      (n) => !placed.has(n.id) && group.match(n.type.trim().toUpperCase()),
    );
    if (items.length === 0) continue;
    items.forEach((n) => placed.add(n.id));
    result.push({ key: group.key, label: group.label, items });
  }
  return result;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function toFriendlyNotificationType(type: string): string {
  const normalized = type.trim().toUpperCase();
  if (!normalized) return "Update";

  const exact: Record<string, string> = {
    ASSIGNMENT: "Assigned to you",
    COMMENT: "New comment",
    CHECKLIST: "Checklist updated",
    ATTACHMENT: "Attachment added",
    CLIENT_OBLIGATION: "Client requirement updated",
    TICKET_COMPLETED: "Ticket completed",
    CREATED: "Ticket created",
    REPO_CONTEXT_INHERITED: "Repository linked",
    GITHUB_REPO_CONTEXT: "Repository context updated",
    CLIENT_FEEDBACK: "Client feedback",
    DEPLOYMENT_SUCCEEDED: "Deployment completed",
    PR_OPENED: "Pull request opened",
    PR_READY_FOR_REVIEW: "Ready for review",
    PR_APPROVED: "Pull request approved",
    PR_CHANGES_REQUESTED: "Changes requested",
  };

  if (exact[normalized]) return exact[normalized];
  if (normalized.startsWith("SYSTEM_")) return "System update";
  if (normalized.startsWith("PR_") || normalized.startsWith("GH_")) {
    return "Code review update";
  }
  if (normalized.startsWith("MONITORING_")) return "Monitoring alert";

  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  children?: NavItem[];
};

const sidebarIconAnimations: Record<string, { hover: any; transition: any }> = {
  Dashboard: {
    hover: { scale: 1.05 },
    transition: { duration: 0.22, ease: "easeOut" },
  },
  Executive: {
    hover: { scale: 1.1, rotate: -3 },
    transition: { duration: 0.2, ease: "easeOut" },
  },
  Clients: {
    hover: { rotate: [0, -7, 7, 0], scale: 1.05 },
    transition: { duration: 0.35, ease: "easeOut" },
  },
  Workload: {
    hover: { rotate: [0, -5, 5, 0], scale: 1.05 },
    transition: { duration: 0.32, ease: "easeOut" },
  },
  Sprints: {
    hover: { y: -3, rotate: -5, scale: 1.06 },
    transition: { duration: 0.28, ease: "easeOut" },
  },
  Tickets: {
    hover: { scale: [1, 1.12, 1], rotate: [0, -6, 0] },
    transition: { duration: 0.3, ease: "easeOut" },
  },
  Docs: {
    hover: { y: -2.5, rotate: -4, scale: 1.06 },
    transition: { duration: 0.25, ease: "easeOut" },
  },
  Projects: {
    hover: { rotate: [0, -6, 6, 0], scale: 1.07 },
    transition: { duration: 0.32, ease: "easeOut" },
  },
  Teams: {
    hover: { scale: [1, 1.12, 1], y: -2 },
    transition: { duration: 0.3, ease: "easeOut" },
  },
  Workspace: {
    hover: { scale: [1, 1.1, 1], rotate: -3 },
    transition: { duration: 0.3, ease: "easeOut" },
  },
  Monitoring: {
    hover: {
      opacity: [1, 0.82, 1],
      scale: [1, 1.12, 1],
      rotate: [0, -4, 4, 0],
    },
    transition: { duration: 0.42, ease: "easeOut" },
  },
};

function SidebarNavIcon({
  icon: Icon,
  itemName,
  className,
  isRowHovered,
}: {
  icon: ComponentType<{ className?: string; size?: number }>;
  itemName: string;
  className: string;
  isRowHovered: boolean;
}) {
  const animation = sidebarIconAnimations[itemName] ?? {
    hover: { scale: 1.06 },
    transition: { duration: 0.2, ease: "easeOut" },
  };

  if (itemName === "Dashboard") {
    return (
      <AtomIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Clients") {
    return (
      <SquareStackIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Workload") {
    return (
      <TornadoIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Sprints") {
    return (
      <CalendarCogIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Tickets") {
    return (
      <ReceiptTextIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Docs") {
    return (
      <FileTextIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Projects") {
    return (
      <FolderCodeIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Teams") {
    return (
      <UsersIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  if (itemName === "Monitoring") {
    return (
      <UsersIcon
        size={18}
        externalAnimate={isRowHovered}
        className={className}
      />
    );
  }

  return (
    <motion.span
      className="inline-flex shrink-0"
      animate={
        isRowHovered
          ? animation.hover
          : { scale: 1, x: 0, y: 0, rotate: 0, opacity: 1 }
      }
      transition={animation.transition}
    >
      <Icon className={className} size={18} />
    </motion.span>
  );
}

// ── Rich Notification Panel (accordion) ─────────────────────────────────────
function NotificationPanel({
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
  onNavigate,
}: {
  notifications: AppNotification[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (ids: string[]) => void;
  onNavigate: (ticketId: string | null) => void;
}) {
  const groups = groupNotifications(notifications);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.key)),
  );

  const toggle = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  return (
    <div className="absolute right-0 top-12 z-50 flex w-[min(100vw-1rem,26rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700/60 dark:bg-[#16161f]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="max-h-[32rem] overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            <SkeletonLine className="h-9 w-full rounded-md" />
            <SkeletonLine className="h-14 w-full rounded-lg" />
            <SkeletonLine className="h-14 w-full rounded-lg" />
            <SkeletonLine className="h-9 w-full rounded-md" />
            <SkeletonLine className="h-14 w-full rounded-lg" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Bell className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
              You're all caught up
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const meta = GROUP_META[group.key] ?? GROUP_META.other;
            const unread = group.items.filter((n) => !n.read).length;
            const isOpen = openGroups.has(group.key);
            return (
              <div
                key={group.key}
                className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
              >
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      meta.bg,
                      meta.accent,
                    )}
                  >
                    {meta.icon}
                  </span>
                  <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {group.label}
                  </span>
                  {unread > 0 && (
                    <span
                      className={cn(
                        "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        meta.bg,
                        meta.accent,
                      )}
                    >
                      {unread}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200",
                      isOpen ? "rotate-180" : "",
                    )}
                  />
                </button>

                {/* Accordion body */}
                {isOpen && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {group.items.map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => {
                          if (!n.read) onMarkRead([n.id]);
                          onNavigate(n.ticketId);
                        }}
                        className={cn(
                          "group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                          !n.read &&
                            "bg-brand-600/[0.05] dark:bg-brand-600/[0.09]",
                        )}
                      >
                        {/* Unread dot */}
                        {!n.read && (
                          <span className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full bg-brand-500" />
                        )}

                        {/* Icon bubble */}
                        <span
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            meta.bg,
                            meta.accent,
                          )}
                        >
                          {meta.icon}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm leading-snug text-gray-900 dark:text-white",
                                !n.read ? "font-semibold" : "font-medium",
                              )}
                            >
                              {n.title}
                            </p>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                          </div>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                              {n.body}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                meta.bg,
                                meta.accent,
                              )}
                            >
                              {toFriendlyNotificationType(n.type)}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {relativeTime(n.createdAt)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [desktopWorkspaceOpen, setDesktopWorkspaceOpen] = useState(false);
  const [mobileNavGroups, setMobileNavGroups] = useState<
    Record<string, boolean>
  >({});
  const [desktopNavGroups, setDesktopNavGroups] = useState<
    Record<string, boolean>
  >({});
  const [hoveredNavItem, setHoveredNavItem] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updatePercent, setUpdatePercent] = useState<number>(0);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState<string>("");
  const notifications = useAppSelector(selectNotifications);
  const notificationsStatus = useAppSelector(selectNotificationsStatus);

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    teams,
    activeTeamId,
    setActiveTeamId,
    isAllTeams,
    setAllTeamsMode,
    loading: teamNavLoading,
  } = useTeam();

  const navigation: NavItem[] = useMemo(
    () =>
      user?.role === "CLIENT"
        ? [
            {
              name: "Dashboard",
              href: "/client/dashboard",
              icon: AtomIcon,
            },
          ]
        : user?.role === "SUPER_ADMIN"
          ? [
              { name: "Dashboard", href: "/dashboard", icon: AtomIcon },
              { name: "Executive", href: "/executive", icon: BarChart3 },
              { name: "Clients", href: "/clients", icon: SquareStackIcon },
              // { name: "Feedback", href: "/feedback", icon: Bell },
              { name: "Workload", href: "/workload", icon: TornadoIcon },
              { name: "Sprints", href: "/sprints", icon: CalendarCogIcon },
              { name: "Tickets", href: "/tickets", icon: ReceiptTextIcon },
              { name: "Docs", href: "/docs", icon: FileTextIcon },
              { name: "Projects", href: "/projects", icon: FolderCodeIcon },
              { name: "Teams", href: "/teams", icon: UsersIcon },
              { name: "Monitoring", href: "/monitoring", icon: UsersIcon },
            ]
          : [
              { name: "Dashboard", href: "/dashboard", icon: AtomIcon },
              { name: "Clients", href: "/clients", icon: SquareStackIcon },
              // { name: "Feedback", href: "/feedback", icon: Bell },
              { name: "Workload", href: "/workload", icon: TornadoIcon },
              { name: "Sprints", href: "/sprints", icon: CalendarCogIcon },
              { name: "Tickets", href: "/tickets", icon: ReceiptTextIcon },
              { name: "Docs", href: "/docs", icon: FileTextIcon },
              { name: "Projects", href: "/projects", icon: FolderCodeIcon },
            ],
    [user?.role],
  );
  const pathname = usePathname();
  const downloadUrl =
    process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL ||
    "https://github.com/enable/project-management-tool/releases/latest";

  const electronAPI: ElectronAPI | undefined =
    typeof window !== "undefined"
      ? (window as Window & { electronAPI?: ElectronAPI }).electronAPI
      : undefined;
  const isElectronRuntime = Boolean(electronAPI);
  const isWindowsRuntime = platform === "win32";

  const isNavActive = useCallback(
    (item: NavItem): boolean => {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return true;
      }
      return item.children?.some((child) => isNavActive(child)) ?? false;
    },
    [pathname],
  );

  const flatNavigation = useMemo(() => {
    const items: NavItem[] = [];
    const visit = (nodes: NavItem[]) => {
      for (const node of nodes) {
        items.push(node);
        if (node.children?.length) {
          visit(node.children);
        }
      }
    };
    visit(navigation);
    return items;
  }, [navigation]);

  const isClient = user?.role === "CLIENT";
  const breadcrumbLabel =
    flatNavigation
      .slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find(
        (nav) => pathname === nav.href || pathname.startsWith(`${nav.href}/`),
      )?.name || "Workspace";

  useEffect(() => {
    if (!user || isClient) return;
    void dispatch(fetchNotifications());
  }, [user, isClient, pathname, dispatch]);

  useEffect(() => {
    if (!user || isClient) return;

    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table !== "Notification") return;
      dispatch(invalidateNotifications());
      void dispatch(fetchNotifications({ force: true }));
    });

    return unsubscribe;
  }, [user, isClient, dispatch]);

  useEffect(() => {
    if (!electronAPI) return;

    let mounted = true;
    void electronAPI
      .getPlatform()
      .then((value) => {
        if (mounted) setPlatform(value);
      })
      .catch(() => {
        if (mounted) setPlatform(null);
      });

    const offAvailable = electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus("available");
      setUpdateVersion(info?.version ?? null);
      setUpdateNote("Update found. Downloading in background...");
    });

    const offProgress = electronAPI.onUpdateProgress((progress) => {
      setUpdateStatus("downloading");
      setUpdatePercent(
        Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
      );
      setUpdateNote("Downloading update...");
    });

    const offDownloaded = electronAPI.onUpdateDownloaded((info) => {
      setUpdateStatus("downloaded");
      setUpdatePercent(100);
      setUpdateVersion(info?.version ?? null);
      setUpdateNote("Update downloaded. Restart to install.");
    });

    return () => {
      mounted = false;
      offAvailable?.();
      offProgress?.();
      offDownloaded?.();
    };
  }, [electronAPI]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const monitoringAlertCount = notifications.filter((n) => {
    if (n.read) return false;
    return (
      n.type === "PR_READY_FOR_REVIEW" ||
      n.type === "MONITORING_ERROR" ||
      n.type.startsWith("MONITORING_")
    );
  }).length;

  const handleMarkNotificationsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await dispatch(markNotificationsRead(ids));
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await dispatch(markAllNotificationsRead());
    } catch {
      /* ignore */
    }
  };

  const executeLogout = async () => {
    setLogoutBusy(true);
    try {
      await logout();
      window.location.replace("/");
    } catch (error) {
      console.error("Logout error:", error);
      window.location.replace("/");
    } finally {
      setLogoutBusy(false);
      setShowLogoutConfirm(false);
    }
  };

  const requestLogout = () => {
    setShowUserMenu(false);
    setShowQuickActions(false);
    setNotifOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log("Searching for:", searchQuery);
    }
  };

  const handleHeaderDownloadClick = async () => {
    if (isElectronRuntime && isWindowsRuntime) {
      if (updateStatus === "downloaded") {
        try {
          await electronAPI?.installUpdate();
        } catch {
          setUpdateStatus("error");
          setUpdateNote("Could not install update. Try again.");
        }
        return;
      }

      setUpdateStatus("checking");
      setUpdateNote("Checking for updates...");
      try {
        const result = await electronAPI?.checkForUpdates();
        if (result?.version) {
          setUpdateStatus("available");
          setUpdateVersion(result.version);
          setUpdateNote("Update found. Downloading in background...");
        } else {
          setUpdateStatus("idle");
          setUpdateNote("");
        }
      } catch {
        setUpdateStatus("error");
        setUpdateNote("Update check is unavailable in development mode.");
      }
      return;
    }

    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--app-canvas)] text-[var(--text-primary)]">
      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          sidebarOpen ? "block" : "hidden",
        )}
      >
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
        <div className="fixed left-0 top-0 h-full w-64 border-r border-[var(--border)] bg-gradient-to-b from-slate-50/95 to-[var(--sidebar)] dark:border-gray-800 dark:from-[#16161c] dark:to-[#13131a]">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                PMT HUB
              </h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-700 hover:text-gray-900 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Mobile Search */}
          <div className="border-b border-[var(--border)] p-4 dark:border-gray-800">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900/80 dark:text-white dark:focus:bg-gray-900"
              />
            </form>
          </div>

          <nav className="flex-1 space-y-0.5 p-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const isExpanded =
                mobileNavGroups[item.name] ??
                item.children?.some(
                  (child) =>
                    pathname === child.href ||
                    pathname.startsWith(`${child.href}/`),
                ) ??
                false;

              if (item.children?.length) {
                return (
                  <div key={item.name} className="mb-1">
                    <div
                      onMouseEnter={() => setHoveredNavItem(item.name)}
                      onMouseLeave={() => setHoveredNavItem(null)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
                        isNavActive(item)
                          ? "bg-brand-600/[0.08] text-brand-800 ring-1 ring-brand-500/15 dark:bg-brand-600/10 dark:text-brand-200 dark:ring-brand-400/20"
                          : "text-gray-600 hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                      )}
                    >
                      <SidebarNavIcon
                        icon={item.icon}
                        itemName={item.name}
                        isRowHovered={hoveredNavItem === item.name}
                        className={cn(
                          "h-[18px] w-[18px]",
                          isNavActive(item)
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400",
                        )}
                      />
                      <Link
                        href={item.href}
                        className="flex-1 text-left"
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setMobileNavGroups((prev) => ({
                            ...prev,
                            [item.name]: !isExpanded,
                          }))
                        }
                        className="rounded-md p-1 text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-1 space-y-1 pl-9">
                        {item.children.map((child) => {
                          const isChildActive =
                            pathname === child.href ||
                            pathname.startsWith(`${child.href}/`);
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                                isChildActive
                                  ? "bg-gray-100 text-gray-900 ring-1 ring-gray-300 shadow-sm dark:bg-brand-600/15 dark:text-brand-200 dark:ring-brand-400/25"
                                  : "text-gray-600 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                              )}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              <span>{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onMouseEnter={() => setHoveredNavItem(item.name)}
                  onMouseLeave={() => setHoveredNavItem(null)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
                    isActive
                      ? "bg-gray-100 text-gray-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] ring-1 ring-gray-300 dark:bg-brand-600/15 dark:text-brand-200 dark:ring-brand-400/25"
                      : "text-gray-600 hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <SidebarNavIcon
                    icon={item.icon}
                    itemName={item.name}
                    isRowHovered={hoveredNavItem === item.name}
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive
                        ? "text-gray-800 dark:text-brand-400"
                        : "text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400",
                    )}
                  />
                  <span className="flex-1 text-left">{item.name}</span>
                  {item.name === "Monitoring" && monitoringAlertCount > 0 ? (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {monitoringAlertCount > 99 ? "99+" : monitoringAlertCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {user?.role === "SUPER_ADMIN" && !isClient ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setMobileWorkspaceOpen((prev) => !prev)}
                  onMouseEnter={() => setHoveredNavItem("Workspace")}
                  onMouseLeave={() => setHoveredNavItem(null)}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-all duration-200 ease-out hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <SidebarNavIcon
                    icon={WaypointsIcon}
                    itemName="Workspace"
                    isRowHovered={hoveredNavItem === "Workspace"}
                    className="h-[18px] w-[18px] text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400"
                  />
                  <span className="flex-1 text-left">Workspace</span>
                  {mobileWorkspaceOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {mobileWorkspaceOpen ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-white/70 p-2 dark:border-gray-800 dark:bg-white/[0.03]">
                    {teamNavLoading ? (
                      <div className="space-y-2 px-2 py-2">
                        <SkeletonLine className="h-3 w-28" />
                        <SkeletonLine className="h-3 w-full" />
                        <SkeletonLine className="h-3 w-4/5" />
                      </div>
                    ) : user.role === "SUPER_ADMIN" ? (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Scope
                          </span>
                          <Link
                            href="/teams"
                            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                            onClick={() => setSidebarOpen(false)}
                          >
                            Manage
                          </Link>
                        </div>
                        <div className="max-h-44 space-y-1 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setAllTeamsMode(true);
                              setSidebarOpen(false);
                            }}
                            className={cn(
                              "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                              isAllTeams
                                ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/50 dark:text-brand-200"
                                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5",
                            )}
                          >
                            All teams
                          </button>
                          {teams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => {
                                setAllTeamsMode(false);
                                setActiveTeamId(team.id);
                                setSidebarOpen(false);
                              }}
                              className={cn(
                                "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                                !isAllTeams && activeTeamId === team.id
                                  ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
                                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5",
                              )}
                            >
                              {team.name}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <SelectMenu
                        value={activeTeamId}
                        onChange={(v) => {
                          setActiveTeamId(v);
                          setSidebarOpen(false);
                        }}
                        disabled={teams.length === 0}
                        options={teams.map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))}
                        placeholder="Choose team"
                        className="w-full"
                      />
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>

          {/* Mobile User Info */}
          <div className="border-t border-[var(--border)] p-4 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {user.role}
                </p>
              </div>
              <button
                onClick={requestLogout}
                className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64">
        <div className="flex h-full flex-col border-r border-[var(--border)] bg-gradient-to-b from-slate-50/95 to-[var(--sidebar)] dark:border-gray-800 dark:from-[#16161c] dark:to-[#13131a]">
          <div className="h-20 flex items-center gap-2 border-b border-[var(--border)] p-4 dark:border-gray-800">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Lighthouse
              <br />
              <span className="-mt-1 block text-sm font-normal text-gray-500 dark:text-gray-400">
                Project Management Tool
              </span>
            </h1>
          </div>

          <div className="border-b border-[var(--border)] p-4 dark:border-gray-800">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900/80 dark:text-white dark:focus:bg-gray-900"
              />
            </form>
          </div>

          <nav className="flex-1 space-y-0.5 p-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const isExpanded =
                desktopNavGroups[item.name] ??
                item.children?.some(
                  (child) =>
                    pathname === child.href ||
                    pathname.startsWith(`${child.href}/`),
                ) ??
                false;

              if (item.children?.length) {
                return (
                  <div key={item.name} className="mb-1">
                    <div
                      onMouseEnter={() => setHoveredNavItem(item.name)}
                      onMouseLeave={() => setHoveredNavItem(null)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
                        isNavActive(item)
                          ? "bg-gray-100 text-gray-900 ring-1 ring-gray-300 shadow-sm dark:bg-brand-600/10 dark:text-brand-200 dark:ring-brand-400/20"
                          : "text-gray-600 hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                      )}
                    >
                      <SidebarNavIcon
                        icon={item.icon}
                        itemName={item.name}
                        isRowHovered={hoveredNavItem === item.name}
                        className={cn(
                          "h-[18px] w-[18px]",
                          isNavActive(item)
                            ? "text-gray-800 dark:text-brand-400"
                            : "text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400",
                        )}
                      />
                      <Link href={item.href} className="flex-1 text-left">
                        {item.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setDesktopNavGroups((prev) => ({
                            ...prev,
                            [item.name]: !isExpanded,
                          }))
                        }
                        className="rounded-md p-1 text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-1 space-y-1 pl-9">
                        {item.children.map((child) => {
                          const isChildActive =
                            pathname === child.href ||
                            pathname.startsWith(`${child.href}/`);
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                                isChildActive
                                  ? "bg-gray-100 text-gray-900 ring-1 ring-gray-300 shadow-sm dark:bg-brand-600/15 dark:text-brand-200 dark:ring-brand-400/25"
                                  : "text-gray-600 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                              )}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                              <span>{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onMouseEnter={() => setHoveredNavItem(item.name)}
                  onMouseLeave={() => setHoveredNavItem(null)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out mb-1",
                    isActive
                      ? "bg-brand-600/[0.12] text-brand-800 ring-1 ring-brand-500/20 dark:bg-brand-600/15 dark:text-brand-200 dark:ring-brand-400/25"
                      : "text-gray-600 hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
                  )}
                >
                  <SidebarNavIcon
                    icon={item.icon}
                    itemName={item.name}
                    isRowHovered={hoveredNavItem === item.name}
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400",
                    )}
                  />
                  <span className="flex-1 text-left">{item.name}</span>
                  {item.name === "Monitoring" && monitoringAlertCount > 0 ? (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {monitoringAlertCount > 99 ? "99+" : monitoringAlertCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {user?.role === "SUPER_ADMIN" && !isClient ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setDesktopWorkspaceOpen((prev) => !prev)}
                  onMouseEnter={() => setHoveredNavItem("Workspace")}
                  onMouseLeave={() => setHoveredNavItem(null)}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-all duration-200 ease-out hover:bg-white/80 hover:text-gray-900 hover:shadow-sm dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <SidebarNavIcon
                    icon={WaypointsIcon}
                    itemName="Workspace"
                    isRowHovered={hoveredNavItem === "Workspace"}
                    className="h-[18px] w-[18px] text-gray-500 group-hover:text-brand-600 dark:text-gray-500 dark:group-hover:text-brand-400"
                  />
                  <span className="flex-1 text-left">Workspace</span>
                  {desktopWorkspaceOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {desktopWorkspaceOpen ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-white/70 p-2 dark:border-gray-800 dark:bg-white/[0.03]">
                    {teamNavLoading ? (
                      <div className="space-y-2 px-2 py-2">
                        <SkeletonLine className="h-3 w-28" />
                        <SkeletonLine className="h-3 w-full" />
                        <SkeletonLine className="h-3 w-4/5" />
                      </div>
                    ) : user.role === "SUPER_ADMIN" ? (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Scope
                          </span>
                          <Link
                            href="/teams"
                            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                          >
                            Manage
                          </Link>
                        </div>
                        <div className="max-h-44 space-y-1 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => setAllTeamsMode(true)}
                            className={cn(
                              "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                              isAllTeams
                                ? "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/50 dark:text-brand-200"
                                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5",
                            )}
                          >
                            All teams
                          </button>
                          {teams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => {
                                setAllTeamsMode(false);
                                setActiveTeamId(team.id);
                              }}
                              className={cn(
                                "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                                !isAllTeams && activeTeamId === team.id
                                  ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-white"
                                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5",
                              )}
                            >
                              {team.name}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <SelectMenu
                        value={activeTeamId}
                        onChange={setActiveTeamId}
                        disabled={teams.length === 0}
                        options={teams.map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))}
                        placeholder="Choose team"
                        className="w-full"
                      />
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>

          {/* Desktop User Info */}
          <div className="relative border-t border-[var(--border)] p-4 dark:border-gray-800">
            <div
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/5"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white mouse-pointer">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* User Menu Dropdown */}
            {showUserMenu && (
              <div className="absolute bottom-16 left-3 right-3 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-card dark:border-gray-700 dark:bg-[#1c1c24]">
                <div className="space-y-0.5 p-2">
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">Profile</span>
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    <Settings className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">Settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    {theme === "light" ? (
                      <Moon className="h-4 w-4 text-gray-500" />
                    ) : (
                      <Sun className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="font-medium">
                      {theme === "light" ? "Dark mode" : "Light mode"}
                    </span>
                  </button>
                  <div className="my-1 h-px bg-[var(--border)] dark:bg-gray-700" />
                  <button
                    type="button"
                    onClick={requestLogout}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Power className="h-4 w-4" />
                    <span className="font-medium">Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="lg:pl-64">
        <div className="fixed left-0 right-0 top-0 z-40 border-b border-[var(--border)] bg-[var(--surface-elevated)]/95 backdrop-blur-md dark:border-gray-800 dark:bg-[#16161c]/95 lg:left-64">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            {/* Left side - Navigation and Search */}
            <div className="flex items-center space-x-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-gray-700 hover:text-gray-900 transition-colors p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu className="w-6 h-6" />
              </button>

              {/* Breadcrumb and Page Title */}
              <div className="hidden lg:flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="cursor-pointer transition-colors hover:text-gray-900 dark:hover:text-white">
                    Home
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {breadcrumbLabel}
                  </span>
                </div>
              </div>

              {/* Desktop Search */}
              <div className="relative hidden lg:block">
                <form onSubmit={handleSearch} className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search workspace…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-72 rounded-md border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900/80 dark:text-white dark:focus:bg-gray-900 xl:w-80"
                  />
                </form>
              </div>

              {/* Mobile Search */}
              <div className="lg:hidden">
                <button className="text-gray-700 hover:text-gray-900 transition-colors p-2 hover:bg-gray-100 rounded-lg">
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Right side - Actions and User */}
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={() => {
                  void handleHeaderDownloadClick();
                }}
                className="group inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-900"
                title={
                  isElectronRuntime && isWindowsRuntime
                    ? updateStatus === "downloaded"
                      ? "Restart and install update"
                      : "Check for updates"
                    : "Download for Windows"
                }
              >
                {updateStatus === "checking" ||
                updateStatus === "downloading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <Monitor className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span className="hidden sm:inline">
                  {isElectronRuntime && isWindowsRuntime
                    ? updateStatus === "downloaded"
                      ? "Restart to Update"
                      : "Windows Update"
                    : "Windows App"}
                </span>
              </button>

              {user?.role !== "SUPER_ADMIN" && !isClient ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickActions(false);
                      setShowUserMenu(false);
                      setNotifOpen((prev) => {
                        const next = !prev;
                        if (next) void dispatch(fetchNotifications());
                        return next;
                      });
                    }}
                    className="relative rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                    title="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {notifOpen ? (
                    <NotificationPanel
                      notifications={notifications}
                      loading={notificationsStatus === "loading"}
                      unreadCount={unreadCount}
                      onMarkAllRead={() =>
                        void handleMarkAllNotificationsRead()
                      }
                      onMarkRead={(ids) =>
                        void handleMarkNotificationsRead(ids)
                      }
                      onNavigate={(ticketId) => {
                        setNotifOpen(false);
                        if (ticketId) router.push(`/tickets/${ticketId}`);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* User Menu (Desktop) */}
              <div className="hidden lg:flex items-center space-x-4">
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user.name}
                    </p>
                    <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
                      {user.role.toLowerCase().replace(/_/g, " ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
                    aria-expanded={showUserMenu}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white shadow-sm ring-2 ring-white transition-colors hover:bg-brand-600 dark:ring-gray-900">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  </button>
                </div>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={requestLogout}
                  className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                  title="Sign out"
                >
                  <Power className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {updateStatus !== "idle" && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-200/80 bg-gradient-to-r from-sky-50 to-cyan-50 px-4 py-2 text-xs dark:border-gray-800 dark:from-sky-950/25 dark:to-cyan-950/20 sm:px-6">
              <div className="min-w-0">
                <p className="truncate font-semibold text-sky-900 dark:text-sky-200">
                  {updateStatus === "checking" && "Checking for updates"}
                  {updateStatus === "available" && "Update available"}
                  {updateStatus === "downloading" &&
                    `Downloading update ${updatePercent}%`}
                  {updateStatus === "downloaded" && "Ready to install"}
                  {updateStatus === "error" && "Update check failed"}
                  {updateVersion ? ` v${updateVersion}` : ""}
                </p>
                {updateNote ? (
                  <p className="truncate text-sky-700 dark:text-sky-300/90">
                    {updateNote}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {updateStatus === "downloaded" && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleHeaderDownloadClick();
                    }}
                    className="rounded-md bg-sky-600 px-2 py-1 font-semibold text-white hover:bg-sky-700"
                  >
                    Restart now
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUpdateStatus("idle");
                    setUpdateNote("");
                    setUpdatePercent(0);
                  }}
                  className="rounded-md border border-sky-300 px-2 py-1 font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-900/30"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="pt-[73px] lg:pl-64">
        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>

      {/* Backdrop for dropdowns */}
      {(showQuickActions || showUserMenu || notifOpen) && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => {
            setShowQuickActions(false);
            setShowUserMenu(false);
            setNotifOpen(false);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        confirmVariant="danger"
        busy={logoutBusy}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          void executeLogout();
        }}
      />
    </div>
  );
}
