"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Zap,
  Eye,
  Tag,
  GripVertical,
  ListTodo,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SprintSelector } from "@/components/SprintSelector";
import { SelectMenu } from "@/components/SelectMenu";

interface Ticket {
  id: string;
  selectorId?: number | null;
  title: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  client?: {
    id: string;
    name: string;
    email: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
  project?: {
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
      email: string;
    } | null;
  } | null;
  sprint?: {
    id: string;
    name: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
}

function ticketDisplayId(ticket: Ticket): string {
  if (typeof ticket.selectorId === "number") {
    return `#${ticket.selectorId}`;
  }
  return "No selector ID";
}

interface KanbanBoardProps {
  tickets: Ticket[];
  onStatusChange: (ticketId: string, newStatus: string) => void;
  onTicketClick: (ticket: Ticket) => void;
  userRole: string;
  onCreateTicket: () => void;
  activeTeamId?: string;
  onTicketSprintChange?: () => void;
}

const statusConfig = {
  BACKLOG: {
    label: "Backlog",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    icon: Clock,
    bgColor: "bg-gray-500/10",
  },
  TODO: {
    label: "To Do",
    color:
      "bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30",
    icon: ListTodo,
    bgColor: "bg-slate-500/10",
  },
  REFINE: {
    label: "Refine",
    color:
      "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 border-indigo-500/30",
    icon: Filter,
    bgColor: "bg-indigo-500/10",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Zap,
    bgColor: "bg-blue-500/10",
  },
  IN_REVIEW: {
    label: "In Review",
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    icon: Eye,
    bgColor: "bg-cyan-500/10",
  },
  QA: {
    label: "QA",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: AlertCircle,
    bgColor: "bg-orange-500/10",
  },
  REVISIONS: {
    label: "Revisions",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: AlertCircle,
    bgColor: "bg-yellow-500/10",
  },
  COMPLETE: {
    label: "Complete",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: CheckCircle,
    bgColor: "bg-green-500/10",
  },
  CLIENT_REVIEW: {
    label: "Client Review",
    color:
      "bg-brand-500/15 text-brand-700 border border-brand-500/25 dark:text-brand-300 dark:border-brand-500/30",
    icon: Eye,
    bgColor: "bg-brand-500/10",
  },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  LOW: {
    label: "Low",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  },
  MEDIUM: {
    label: "Medium",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  },
  HIGH: {
    label: "High",
    className:
      "bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/20",
  },
  URGENT: {
    label: "Urgent",
    className:
      "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
  },
  NONE: {
    label: "None",
    className:
      "bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20",
  },
};

const statusColorMap: Record<string, string> = {
  BACKLOG: "#6b7280",
  TODO: "#4A4A4A",
  REFINE: "#1B2A4A",
  IN_PROGRESS: "#3498DB",
  IN_REVIEW: "#3498DB",
  QA: "#F39C12",
  REVISIONS: "#F39C12",
  COMPLETE: "#2ECC71",
  CLIENT_REVIEW: "#3498DB",
};

function getPriorityDisplay(priority?: string | null) {
  const normalized = (priority ?? "NONE").toUpperCase();
  return priorityConfig[normalized] ?? priorityConfig.NONE;
}

function SortableTicket({
  ticket,
  onClick,
  activeTeamId,
  onTicketSprintChange,
}: {
  ticket: Ticket;
  onClick: () => void;
  activeTeamId?: string;
  onTicketSprintChange?: () => void;
}) {
  const priority = getPriorityDisplay(ticket.priority);
  const effectiveTeamId = ticket.team?.id ?? activeTeamId ?? "";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-move transition-all duration-300 border bg-white/60 dark:bg-neutral-800/60 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-neutral-700/70 rounded-xl",
        isDragging && "opacity-75 scale-105 shadow-2xl",
      )}
      draggable
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              {ticketDisplayId(ticket)}
            </p>
            <GripVertical className="w-5 h-5 text-neutral-500 dark:text-neutral-400 cursor-move shrink-0 ml-2" />
          </div>

          <div
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }}
          >
            <h4 className="line-clamp-2 h-10 font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
              {ticket.title}
            </h4>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">
              {ticket.project?.name || "No project"}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                priority.className,
              )}
            >
              {priority.label}
            </span>
          </div>

          {ticket.sprint && effectiveTeamId ? (
            <div className="text-xs" onClick={(e) => e.stopPropagation()}>
              <SprintSelector
                ticketId={ticket.id}
                currentSprintId={ticket.sprint?.id}
                currentSprintName={ticket.sprint?.name}
                teamId={effectiveTeamId}
                onSprintChange={() => {
                  onTicketSprintChange?.();
                }}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2 border-t border-neutral-200/30 dark:border-neutral-700/30 gap-3">
            <div
              className="min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectMenu
                value={ticket.assignee?.id || ""}
                onChange={(id) => {
                  // Assignee update is intentionally scoped to existing behavior.
                  console.log("Assignee changed to:", id);
                }}
                options={[
                  { value: "", label: "No assignee" },
                  ...(ticket.assignee
                    ? [
                        {
                          value: ticket.assignee.id,
                          label: ticket.assignee.name,
                        },
                      ]
                    : []),
                ]}
                size="sm"
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400 shrink-0">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DraggedTicket({ ticket }: { ticket: Ticket }) {
  const priority = getPriorityDisplay(ticket.priority);

  return (
    <Card className="cursor-move border bg-white/60 dark:bg-neutral-800/60 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-neutral-700/70 rounded-xl shadow-2xl">
      <CardContent className="p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300 mb-1">
              {ticketDisplayId(ticket)}
            </p>
            <GripVertical className="w-5 h-5 text-neutral-500 dark:text-neutral-400 shrink-0 ml-2" />
          </div>

          <div>
            <h4 className="line-clamp-2 h-10 font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
              {ticket.title}
            </h4>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">
              {ticket.project?.name || "No project"}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                priority.className,
              )}
            >
              {priority.label}
            </span>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-neutral-200/30 dark:border-neutral-700/30">
            <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({
  status,
  children,
}: {
  status: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className="h-full min-w-[350px] w-[360px] shrink-0 snap-start"
    >
      {children}
    </div>
  );
}

export default function KanbanBoard({
  tickets,
  onStatusChange,
  onTicketClick,
  userRole,
  onCreateTicket,
  activeTeamId,
  onTicketSprintChange,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardResetKey = useMemo(
    () => tickets.map((ticket) => `${ticket.id}:${ticket.status}`).join("|"),
    [tickets],
  );

  useEffect(() => {
    const scroller = boardScrollRef.current;
    if (!scroller) return;

    // Keep the board anchored to the first column after data refreshes.
    requestAnimationFrame(() => {
      scroller.scrollTo({ left: 0, behavior: "auto" });
    });
  }, [boardResetKey]);

  const groupedTickets = tickets.reduce(
    (acc, ticket) => {
      if (!acc[ticket.status]) {
        acc[ticket.status] = [];
      }
      acc[ticket.status].push(ticket);
      return acc;
    },
    {} as Record<string, Ticket[]>,
  );

  Object.keys(statusConfig).forEach((status) => {
    if (!groupedTickets[status]) {
      groupedTickets[status] = [];
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    let currentStatus = "";
    Object.entries(groupedTickets).forEach(([status, tickets]) => {
      if (tickets.find((t) => t.id === activeId)) {
        currentStatus = status;
      }
    });

    let targetStatus = "";

    if (Object.keys(statusConfig).includes(overId)) {
      targetStatus = overId;
    } else {
      Object.entries(groupedTickets).forEach(([status, columnTickets]) => {
        if (columnTickets.some((ticket) => ticket.id === overId)) {
          targetStatus = status;
        }
      });
    }

    if (targetStatus && currentStatus !== targetStatus) {
      onStatusChange(activeId, targetStatus);
    }
  };

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={boardScrollRef}
        className="hover-scrollbar flex gap-6 overflow-x-auto pb-6 snap-x"
      >
        {Object.entries(groupedTickets).map(([status, tickets]) => {
          const config = statusConfig[status as keyof typeof statusConfig];

          return (
            <DroppableColumn key={status} status={status}>
              <div className="min-h-[600px] rounded-3xl border border-border bg-white/20 dark:bg-neutral-900/20 backdrop-blur-xl dark:border-neutral-700/50 p-5">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor: statusColorMap[status] || "#6B7280",
                      }}
                    />
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {config.label}
                    </h3>
                    <span className="rounded-full bg-neutral-100/80 dark:bg-neutral-800/80 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:text-neutral-200 border-neutral-200/50 dark:border-neutral-600/50 border">
                      {tickets.length}
                    </span>
                  </div>
                  {(userRole === "USER" || userRole === "SUPER_ADMIN") && (
                    <button
                      onClick={onCreateTicket}
                      className="p-1 rounded-full bg-white/30 dark:bg-neutral-800/30 hover:bg-white/50 dark:hover:bg-neutral-700/50 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <SortableContext
                    items={tickets.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {tickets.map((ticket) => (
                      <SortableTicket
                        key={ticket.id}
                        ticket={ticket}
                        onClick={() => onTicketClick(ticket)}
                        activeTeamId={activeTeamId}
                        onTicketSprintChange={onTicketSprintChange}
                      />
                    ))}
                  </SortableContext>

                  {tickets.length === 0 && (
                    <div className="text-center py-8 text-neutral-500 text-sm">
                      <div className="w-8 h-8 bg-neutral-200/40 dark:bg-neutral-700/40 rounded-lg flex items-center justify-center mx-auto mb-2 backdrop-blur-sm border border-neutral-200/30 dark:border-neutral-700/30">
                        <Tag className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                      </div>
                      No tickets
                    </div>
                  )}
                </div>
              </div>
            </DroppableColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTicket ? <DraggedTicket ticket={activeTicket} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
