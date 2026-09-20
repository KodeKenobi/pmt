"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, X } from "lucide-react";
import { SelectMenu } from "@/components/SelectMenu";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SkeletonDropdown } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string;
  isInvited: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
  teamId?: string | null;
  clientId?: string | null;
  githubRepos?: Array<{
    id: string;
    owner: string;
    name: string;
    url: string;
  }>;
}

interface AssigneeOption {
  userId: string;
  name: string;
}

interface SprintOption {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED";
}

interface CreateTicketModalProps {
  isOpen: boolean;
  defaultTeamId: string;
  teams?: { id: string; name: string }[];
}

export type CreateTicketPayload = {
  title: string;
  status: string;
  workType: string;
  clientId?: string;
  teamId: string;
  sprintId?: string;
  assigneeId?: string;
  projectId?: string;
  description?: string;
  acceptanceCriteria?: string;
  priority: string;
  startDate?: string;
  dueDate?: string;
};

export type CreateTicketSubmitDetail = {
  payload: CreateTicketPayload;
  openAfterCreate: boolean;
  attachments?: File[];
};

export type CreateTicketResultDetail = {
  ok: boolean;
  message?: string;
};

const statusOptions = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To Do" },
  { value: "REFINE", label: "Refine" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "QA", label: "QA" },
  { value: "REVISIONS", label: "Revisions" },
  { value: "COMPLETE", label: "Complete" },
  { value: "CLIENT_REVIEW", label: "Client Review" },
];

const priorityOptions = [
  { value: "NONE", label: "None" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const workTypeOptions = [
  { value: "feat", label: "feat" },
  { value: "fix", label: "fix" },
  { value: "bugfix", label: "bugfix" },
  { value: "chore", label: "chore" },
  { value: "docs", label: "docs" },
  { value: "refactor", label: "refactor" },
  { value: "test", label: "test" },
  { value: "perf", label: "perf" },
  { value: "hotfix", label: "hotfix" },
];

export default function CreateTicketModal({
  isOpen,
  defaultTeamId,
  teams = [],
}: CreateTicketModalProps) {
  const safeTeams = useMemo(() => (Array.isArray(teams) ? teams : []), [teams]);
  const wasOpenRef = useRef(false);

  const [formData, setFormData] = useState({
    title: "",
    status: "BACKLOG",
    clientId: "",
    teamId: "",
    projectId: "",
    sprintId: "",
    assigneeId: "",
    description: "",
    acceptanceCriteria: "",
    workType: "chore",
    priority: "MEDIUM",
    startDate: "",
    dueDate: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [sprints, setSprints] = useState<SprintOption[]>([]);
  const [isLoadingSprints, setIsLoadingSprints] = useState(false);
  const [formError, setFormError] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchInvitedClients();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onSubmitResult = (event: Event) => {
      const customEvent = event as CustomEvent<CreateTicketResultDetail>;
      const detail = customEvent.detail;
      setIsSubmitting(false);

      if (detail?.ok) {
        setFormError("");
        setFormData({
          title: "",
          status: "BACKLOG",
          clientId: "",
          teamId: defaultTeamId || safeTeams[0]?.id || "",
          projectId: "",
          sprintId: "",
          assigneeId: "",
          description: "",
          acceptanceCriteria: "",
          workType: "chore",
          priority: "MEDIUM",
          startDate: "",
          dueDate: "",
        });
        setProjects([]);
        setAssignees([]);
        setAttachmentFiles([]);
        window.dispatchEvent(new CustomEvent("create-ticket-modal-close"));
        return;
      }

      setFormError(detail?.message || "Failed to create ticket.");
    };

    window.addEventListener(
      "create-ticket-modal-result",
      onSubmitResult as EventListener,
    );

    return () => {
      window.removeEventListener(
        "create-ticket-modal-result",
        onSubmitResult as EventListener,
      );
    };
  }, [isOpen, defaultTeamId, safeTeams]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) return;

    wasOpenRef.current = true;
    const initialTeamId =
      defaultTeamId ||
      (safeTeams.length === 1 ? safeTeams[0].id : safeTeams[0]?.id || "");
    setFormData((prev) => ({
      ...prev,
      teamId: initialTeamId,
      projectId: "",
      sprintId: "",
      assigneeId: "",
    }));
  }, [isOpen, defaultTeamId, safeTeams]);

  useEffect(() => {
    if (!formData.teamId) {
      setSprints([]);
      setAssignees([]);
      setProjects([]);
      setIsLoadingSprints(false);
      setIsLoadingAssignees(false);
      setIsLoadingProjects(false);
      setFormData((prev) => ({ ...prev, sprintId: "", projectId: "" }));
      return;
    }

    let canceled = false;

    const loadTeamDependencies = async () => {
      setIsLoadingSprints(true);
      setIsLoadingAssignees(true);
      setIsLoadingProjects(true);

      const [sprintsRes, membersRes, projectsRes] = await Promise.allSettled([
        fetch(`/api/sprints?teamId=${formData.teamId}`),
        fetch(`/api/teams/${formData.teamId}/members`),
        fetch(`/api/projects?teamId=${formData.teamId}`),
      ]);

      if (canceled) return;

      try {
        if (sprintsRes.status === "fulfilled" && sprintsRes.value.ok) {
          const data = (await sprintsRes.value.json()) as SprintOption[];
          const activeSprints = (Array.isArray(data) ? data : []).filter(
            (sprint) =>
              sprint.status === "ACTIVE" || sprint.status === "PLANNED",
          );
          setSprints(activeSprints);
        } else {
          setSprints([]);
        }
      } catch (error) {
        console.error("Failed to load sprints:", error);
        setSprints([]);
      }

      try {
        if (membersRes.status === "fulfilled" && membersRes.value.ok) {
          const data = await membersRes.value.json();
          setAssignees(Array.isArray(data.members) ? data.members : []);
        } else {
          setAssignees([]);
        }
      } catch (error) {
        console.error("Failed to load assignees:", error);
        setAssignees([]);
      }

      try {
        if (projectsRes.status === "fulfilled" && projectsRes.value.ok) {
          const data = (await projectsRes.value.json()) as ProjectOption[];
          setProjects(Array.isArray(data) ? data : []);
        } else {
          setProjects([]);
        }
      } catch (error) {
        console.error("Failed to load client projects:", error);
        setProjects([]);
      } finally {
        setIsLoadingSprints(false);
        setIsLoadingAssignees(false);
        setIsLoadingProjects(false);
      }
    };

    void loadTeamDependencies();

    return () => {
      canceled = true;
    };
  }, [formData.teamId]);

  const fetchInvitedClients = async () => {
    setIsLoadingClients(true);
    try {
      const response = await fetch("/api/clients");
      if (!response.ok) return;
      const allClients = await response.json();
      const invitedClients = (allClients as Client[]).filter(
        (client) => client.isInvited,
      );
      setClients(invitedClients);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setIsLoadingClients(false);
    }
  };

  const handleClose = () => {
    setFormError("");
    setFormData({
      title: "",
      status: "BACKLOG",
      clientId: "",
      teamId: defaultTeamId || safeTeams[0]?.id || "",
      projectId: "",
      sprintId: "",
      assigneeId: "",
      description: "",
      acceptanceCriteria: "",
      workType: "chore",
      priority: "MEDIUM",
      startDate: "",
      dueDate: "",
    });
    setProjects([]);
    setAssignees([]);
    setAttachmentFiles([]);
    window.dispatchEvent(new CustomEvent("create-ticket-modal-close"));
  };

  const submitTicket = async (openAfterCreate = false) => {
    setFormError("");

    if (!formData.title.trim()) {
      setFormError("Ticket title is required.");
      return;
    }

    if (!formData.teamId) {
      setFormError("Please select a team.");
      return;
    }

    if (formData.startDate && formData.dueDate) {
      const start = new Date(formData.startDate);
      const due = new Date(formData.dueDate);
      if (start > due) {
        setFormError("Start date cannot be after due date.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload: CreateTicketPayload = {
        title: formData.title.trim(),
        teamId: formData.teamId,
        status: formData.status,
        priority: formData.priority,
        workType: formData.workType,
        ...(formData.clientId ? { clientId: formData.clientId } : {}),
        ...(formData.projectId ? { projectId: formData.projectId } : {}),
        ...(formData.sprintId ? { sprintId: formData.sprintId } : {}),
        ...(formData.assigneeId ? { assigneeId: formData.assigneeId } : {}),
        ...(formData.description.trim()
          ? { description: formData.description.trim() }
          : {}),
        ...(formData.acceptanceCriteria.trim()
          ? { acceptanceCriteria: formData.acceptanceCriteria.trim() }
          : {}),
        ...(formData.startDate ? { startDate: formData.startDate } : {}),
        ...(formData.dueDate ? { dueDate: formData.dueDate } : {}),
      };

      window.dispatchEvent(
        new CustomEvent<CreateTicketSubmitDetail>(
          "create-ticket-modal-submit",
          {
            detail: {
              payload,
              openAfterCreate,
              attachments: attachmentFiles,
            },
          },
        ),
      );
    } catch (error) {
      console.error("Failed to create ticket:", error);
      setIsSubmitting(false);
      setFormError("Failed to create ticket.");
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitTicket(false);
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const safeAssignees = Array.isArray(assignees) ? assignees : [];
  const safeSprints = Array.isArray(sprints) ? sprints : [];
  const safeClients = Array.isArray(clients) ? clients : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const titleValue = typeof formData.title === "string" ? formData.title : "";
  const teamIdValue =
    typeof formData.teamId === "string" ? formData.teamId : "";
  const assigneeIdValue =
    typeof formData.assigneeId === "string" ? formData.assigneeId : "";
  const priorityValue =
    typeof formData.priority === "string" ? formData.priority : "";
  const descriptionValue =
    typeof formData.description === "string" ? formData.description : "";
  const acceptanceCriteriaValue =
    typeof formData.acceptanceCriteria === "string"
      ? formData.acceptanceCriteria
      : "";
  const sprintIdValue =
    typeof formData.sprintId === "string" ? formData.sprintId : "";
  const projectIdValue =
    typeof formData.projectId === "string" ? formData.projectId : "";
  const clientIdValue =
    typeof formData.clientId === "string" ? formData.clientId : "";

  const projectsForSelectedClient = teamIdValue
    ? safeProjects.filter(
        (project) =>
          (!project.teamId || project.teamId === teamIdValue) &&
          (!clientIdValue ||
            !project.clientId ||
            project.clientId === clientIdValue),
      )
    : safeProjects;

  const selectedProject = projectsForSelectedClient.find(
    (project) => project.id === projectIdValue,
  );

  const selectedProjectRepos = Array.isArray(selectedProject?.githubRepos)
    ? selectedProject.githubRepos
    : [];
  const canSelectProject = Boolean(teamIdValue);
  const completionChecks = [
    titleValue.trim().length > 0,
    teamIdValue.length > 0,
    assigneeIdValue.length > 0,
    priorityValue.length > 0,
    descriptionValue.trim().length > 0,
    acceptanceCriteriaValue.trim().length > 0,
    sprintIdValue.length > 0,
    projectIdValue.length > 0,
  ];
  const completionPercent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="animate-fade-in relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Create New Ticket
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Add a new task to your project
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 p-3 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div className="rounded-none border border-gray-200 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-800">
              <div
                className="h-full bg-brand-600 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>

          {formError ? (
            <div className="rounded-none border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {formError}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
              Ticket Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Enter ticket title..."
              className="w-full rounded-none border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
            />
          </div>

          {(safeTeams.length > 1 || !defaultTeamId) && safeTeams.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Team *
              </label>
              <SelectMenu
                value={formData.teamId}
                onChange={(teamId) => {
                  setFormData((prev) => ({
                    ...prev,
                    teamId,
                    projectId: "",
                    sprintId: "",
                  }));
                }}
                options={[
                  { value: "", label: "Select team..." },
                  ...safeTeams.map((team) => ({
                    value: team.id,
                    label: team.name,
                  })),
                ]}
                searchable={safeTeams.length > 8}
                searchPlaceholder="Search teams"
                className="w-full"
                triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
              />
            </div>
          )}

          {teamIdValue && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Assignee
              </label>
              {isLoadingAssignees ? (
                <SkeletonDropdown className="w-full rounded-none" />
              ) : (
                <SelectMenu
                  value={formData.assigneeId}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      assigneeId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Unassigned" },
                    ...safeAssignees.map((member) => ({
                      value: member.userId,
                      label: member.name,
                    })),
                  ]}
                  disabled={isLoadingAssignees}
                  searchable={safeAssignees.length > 10}
                  searchPlaceholder="Search assignees"
                  className="w-full"
                  triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              )}
            </div>
          )}

          <div className="space-y-6 border-t border-gray-200 pt-2 dark:border-slate-800">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Sprint (Optional)
              </label>
              <SelectMenu
                value={formData.sprintId}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, sprintId: value }))
                }
                disabled={!teamIdValue || isLoadingSprints}
                options={
                  !teamIdValue
                    ? [{ value: "", label: "Select a team first" }]
                    : [
                        { value: "", label: "Backlog (No sprint)" },
                        ...safeSprints.map((sprint) => ({
                          value: sprint.id,
                          label: `${sprint.name} (${sprint.status})`,
                        })),
                      ]
                }
                className="w-full"
                searchable={safeSprints.length > 8}
                searchPlaceholder="Search sprints"
                triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
              />
              {isLoadingSprints ? (
                <SkeletonDropdown className="mt-2 w-full rounded-none" />
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Client (Optional)
              </label>
              {isLoadingClients ? (
                <SkeletonDropdown className="w-full rounded-none" />
              ) : (
                <SelectMenu
                  value={formData.clientId}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      clientId: value,
                      projectId: "",
                    }))
                  }
                  options={
                    safeClients.length === 0
                      ? [
                          {
                            value: "",
                            label: "No invited clients available",
                            disabled: true,
                          },
                        ]
                      : [
                          { value: "", label: "No client selected" },
                          ...safeClients.map((client) => ({
                            value: client.id,
                            label: `${client.name} • ${client.email}`,
                          })),
                        ]
                  }
                  disabled={isLoadingClients || safeClients.length === 0}
                  placeholder="No client selected"
                  searchable={safeClients.length > 8}
                  searchPlaceholder="Search clients"
                  className="w-full"
                  triggerClassName="rounded-none border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Project (From selected client)
              </label>
              {isLoadingProjects ? (
                <SkeletonDropdown className="w-full rounded-none" />
              ) : (
                <SelectMenu
                  value={formData.projectId}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, projectId: value }))
                  }
                  disabled={!canSelectProject || isLoadingProjects}
                  options={
                    !canSelectProject
                      ? [
                          {
                            value: "",
                            label: "Select a team to link a project (optional)",
                          },
                        ]
                      : [
                          { value: "", label: "No project selected" },
                          ...projectsForSelectedClient.map((project) => ({
                            value: project.id,
                            label: project.name,
                          })),
                        ]
                  }
                  searchable={projectsForSelectedClient.length > 8}
                  searchPlaceholder="Search projects"
                  className="w-full"
                  triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              )}
              {selectedProject && selectedProjectRepos.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedProjectRepos.map((repo) => (
                    <span
                      key={repo.id}
                      className="rounded-md border border-brand-400/40 bg-slate-900/70 px-2 py-1 text-xs text-slate-100"
                    >
                      {repo.owner}/{repo.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe the ticket details..."
                rows={4}
                className="w-full resize-none rounded-none border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Acceptance Criteria (QA)
              </label>
              <textarea
                value={formData.acceptanceCriteria}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    acceptanceCriteria: e.target.value,
                  }))
                }
                placeholder="List clear acceptance criteria for QA validation..."
                rows={4}
                className="w-full resize-none rounded-none border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Priority
                </label>
                <SelectMenu
                  value={formData.priority}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, priority: value }))
                  }
                  options={priorityOptions.map((priority) => ({
                    value: priority.value,
                    label: priority.label,
                  }))}
                  className="w-full"
                  triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Work Type
                </label>
                <SelectMenu
                  value={formData.workType}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, workType: value }))
                  }
                  options={workTypeOptions}
                  className="w-full"
                  triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Initial Status
                </label>
                <SelectMenu
                  value={formData.status}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, status: value }))
                  }
                  options={statusOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  className="w-full"
                  triggerClassName="rounded-none border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:border-brand-500 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  menuClassName="bg-white text-gray-900 dark:bg-[#0F1419] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Start date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start rounded-none px-4 py-3 text-left font-normal",
                        !formData.startDate &&
                          "text-gray-500 dark:text-slate-400",
                      )}
                    >
                      {formData.startDate
                        ? format(new Date(formData.startDate), "PPP")
                        : "No start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        formData.startDate
                          ? new Date(formData.startDate)
                          : undefined
                      }
                      onSelect={(date) => {
                        setFormData((prev) => ({
                          ...prev,
                          startDate: date ? date.toISOString() : "",
                        }));
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Due date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start rounded-none px-4 py-3 text-left font-normal",
                        !formData.dueDate &&
                          "text-gray-500 dark:text-slate-400",
                      )}
                    >
                      {formData.dueDate
                        ? format(new Date(formData.dueDate), "PPP")
                        : "No due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        formData.dueDate
                          ? new Date(formData.dueDate)
                          : undefined
                      }
                      onSelect={(date) => {
                        setFormData((prev) => ({
                          ...prev,
                          dueDate: date ? date.toISOString() : "",
                        }));
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              Tip: You can create a complete ticket without linking a project or
              client, then enrich it later.
            </p>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-200">
                Attachments (Optional)
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) {
                    setAttachmentFiles((prev) => [...prev, ...files]);
                  }
                  e.target.value = "";
                }}
                className="w-full rounded-none border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 file:mr-3 file:rounded-none file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-white hover:file:bg-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {attachmentFiles.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {attachmentFiles.map((file, idx) => (
                    <li
                      key={`${file.name}-${file.size}-${idx}`}
                      className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-xs dark:border-slate-700"
                    >
                      <span className="truncate pr-3 text-gray-700 dark:text-slate-300">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                        title="Remove attachment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 border-t border-gray-200 pt-6 dark:border-slate-700">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting || !formData.title.trim() || !formData.teamId
              }
              className={cn(
                "btn-primary",
                (isSubmitting || !formData.title.trim() || !formData.teamId) &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  <span>Creating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Create Ticket</span>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => void submitTicket(true)}
              disabled={
                isSubmitting || !formData.title.trim() || !formData.teamId
              }
              className={cn(
                "btn-primary bg-brand-700 hover:bg-brand-600",
                (isSubmitting || !formData.title.trim() || !formData.teamId) &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              Create and Open
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
