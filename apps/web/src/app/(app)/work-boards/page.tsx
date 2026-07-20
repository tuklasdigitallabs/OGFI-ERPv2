import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { canUseProjects, getDefaultAppRoute } from "@/server/services/authorization";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getSessionContext } from "@/server/services/context";
import { getProjectTaskPolicy } from "@/server/services/policySettings";
import {
  createProjectTask,
  listProjectTaskAssigneeOptions,
  listProjectBoardTasks,
  listProjectBoardStatuses,
  transitionProjectTask,
  type ProjectTaskCard,
  type ProjectTaskPriority,
  type ProjectTaskStatus
} from "@/server/services/projectTasks";
import { listProjects } from "@/server/services/projects";

export const dynamic = "force-dynamic";

type WorkBoardsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const boardColumnLabels: Record<ProjectTaskStatus, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_APPROVAL: "Waiting",
  BLOCKED: "Blocked",
  FOR_REVIEW: "Review",
  COMPLETED: "Done",
  CANCELLED: "Cancelled"
};

const defaultBoardColumns: ProjectTaskStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED"
];

const preferredColumnOrder: ProjectTaskStatus[] = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
];

const priorities: ProjectTaskPriority[] = ["LOW", "NORMAL", "HIGH", "CRITICAL"];

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

async function createTaskAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  try {
    await createProjectTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/work-boards?projectId=${projectId}`, error));
  }
  redirect(`/work-boards?projectId=${projectId}`);
}

async function transitionTaskAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  try {
    await transitionProjectTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/work-boards?projectId=${projectId}`, error));
  }
  redirect(`/work-boards?projectId=${projectId}`);
}

function statusTone(status: ProjectTaskCard["status"]) {
  if (status === "COMPLETED") {
    return "success" as const;
  }
  if (status === "BLOCKED" || status === "CANCELLED") {
    return "warning" as const;
  }
  if (status === "IN_PROGRESS" || status === "FOR_REVIEW") {
    return "info" as const;
  }
  return "neutral" as const;
}

function BoardTaskCard({
  task,
  enabledStatuses,
  blockerReasonRequired
}: {
  task: ProjectTaskCard;
  enabledStatuses: Set<ProjectTaskStatus>;
  blockerReasonRequired: boolean;
}) {
  const canStart = enabledStatuses.has("IN_PROGRESS");
  const canComplete = enabledStatuses.has("COMPLETED");
  const canBlock = enabledStatuses.has("BLOCKED");

  return (
    <article className="ogfi-board-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">{task.taskKey}</p>
          <h3 className="mt-1 text-sm font-bold text-slate-950">{task.title}</h3>
        </div>
        <Badge tone={statusTone(task.status)}>{task.priority}</Badge>
      </div>
      {task.description ? (
        <p className="mt-2 line-clamp-3 text-xs text-slate-600">{task.description}</p>
      ) : null}
      <div className="mt-3 grid gap-1 text-xs text-slate-500">
        <span>Owner: {task.ownerName}</span>
        <span>
          Due: {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "No due date"}
        </span>
        {task.dueState === "OVERDUE" ? (
          <span className="font-semibold text-red-700">
            Overdue {task.overdueDays}d
          </span>
        ) : task.dueState === "DUE_TODAY" ? (
          <span className="font-semibold text-blue-700">Due today</span>
        ) : null}
        <span>
          Checks {task.checklistCompleted}/{task.checklistTotal} / Comments{" "}
          {task.commentCount}
        </span>
        {task.openBlockerCount > 0 ? (
          <span className="font-semibold text-amber-700">
            {task.openBlockerCount} open blocker
            {task.openBlockerCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {task.nextBlockerReviewAt ? (
          <span className="font-semibold text-amber-700">
            Review blocker: {new Date(task.nextBlockerReviewAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      <Link
        className="ogfi-mobile-action mt-3 inline-flex items-center rounded-md border border-slate-300 px-3 text-xs font-bold text-slate-700"
        href={`/my-work/${task.id}`}
      >
        Details
      </Link>
      {task.canMutate ? (
        <div className="mt-3 grid gap-2">
          {canStart && task.status !== "IN_PROGRESS" && task.status !== "COMPLETED" ? (
            <form action={transitionTaskAction}>
              <input name="taskId" type="hidden" value={task.id} />
              <input name="projectId" type="hidden" value={task.projectId} />
              <input name="expectedVersion" type="hidden" value={task.version} />
              <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
              <button className="ogfi-mobile-action w-full rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700">
                Start
              </button>
            </form>
          ) : null}
          {canComplete && task.status !== "COMPLETED" ? (
            <form action={transitionTaskAction}>
              <input name="taskId" type="hidden" value={task.id} />
              <input name="projectId" type="hidden" value={task.projectId} />
              <input name="expectedVersion" type="hidden" value={task.version} />
              <input name="nextStatus" type="hidden" value="COMPLETED" />
              <button className="ogfi-mobile-action w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                Complete
              </button>
            </form>
          ) : null}
          {canBlock && task.status !== "BLOCKED" && task.status !== "COMPLETED" ? (
            <EntryModal title="Mark Task Blocked" triggerLabel="Block">
              <form action={transitionTaskAction} className="mt-4 grid gap-3">
                <input name="taskId" type="hidden" value={task.id} />
                <input name="projectId" type="hidden" value={task.projectId} />
                <input name="expectedVersion" type="hidden" value={task.version} />
                <input name="nextStatus" type="hidden" value="BLOCKED" />
                <input
                  className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                  minLength={blockerReasonRequired ? 5 : undefined}
                  name="reason"
                  placeholder={blockerReasonRequired ? "Blocker reason" : "Optional blocker note"}
                  required={blockerReasonRequired}
                />
                <p className="text-xs text-slate-500">
                  {blockerReasonRequired
                    ? "Company policy requires a blocker reason before this task can be marked blocked."
                    : "Company policy allows an optional blocker reason, but a short note is recommended."}
                </p>
                <input
                  className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                  name="nextReviewAt"
                  type="date"
                />
                <button className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-800 sm:w-fit">
                  Block
                </button>
              </form>
            </EntryModal>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default async function WorkBoardsPage({ searchParams }: WorkBoardsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const [projects, taskPolicy] = await Promise.all([
    listProjects(session),
    getProjectTaskPolicy(session)
  ]);
  const requestedProjectId = getParam(params, "projectId");
  const selectedProject =
    projects.find((project) => project.id === requestedProjectId) ?? projects[0] ?? null;
  const [tasks, enabledBoardStatuses, assigneeOptions] = selectedProject
    ? await Promise.all([
        listProjectBoardTasks(session, selectedProject.id),
        listProjectBoardStatuses(session, selectedProject.id),
        listProjectTaskAssigneeOptions(session, selectedProject.id)
      ])
    : [[], defaultBoardColumns, []];
  const enabledStatusSet = new Set(enabledBoardStatuses);
  const visibleBoardColumns = preferredColumnOrder
    .filter((status) => enabledStatusSet.has(status))
    .map((status) => ({ status, label: boardColumnLabels[status] }));

  return (
    <AppShell
      session={session}
      title="Work Boards"
      subtitle="Scoped project boards backed by project task records"
      activeNav="work-boards"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Coordination board only.</strong> Task cards organize work,
              blockers, owners, due dates, and evidence without changing linked ERP
              source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Mobile users can use the labeled task actions below; drag-and-drop is not
              required for status changes.
            </p>
          </div>
          <span>Phase 1.5</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Visible projects</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{projects.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Board tasks</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{tasks.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Blocked</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {tasks.filter((task) => task.status === "BLOCKED").length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {tasks.filter((task) => task.isOverdue).length}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Completed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {tasks.filter((task) => task.status === "COMPLETED").length}
          </p>
        </Panel>
      </div>

      {projects.length === 0 ? (
        <Panel className="ogfi-empty-state">
          <p className="font-semibold text-slate-900">No visible projects yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Create a scoped project before adding board tasks.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          <div className="flex justify-end">
            <EntryModal title="Add Task" triggerLabel="Add Task">
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Tasks coordinate work only; source ERP records stay in their modules.
                </p>
                <Badge tone="info">{selectedProject?.code}</Badge>
              </div>
              {assigneeOptions.length === 0 ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Task creation is unavailable for your role on this project.
                </div>
              ) : (
                <form action={createTaskAction} className="mt-4 grid gap-3">
                  <input name="projectId" type="hidden" value={selectedProject?.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Title
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="title"
                      placeholder="Confirm branch training roster"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Priority
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="priority"
                        defaultValue="NORMAL"
                      >
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Owner
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="assigneeUserId"
                        defaultValue={session.user.id}
                      >
                        {assigneeOptions.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName} / {member.projectRole}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Due date
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2"
                        name="dueAt"
                        type="date"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Description
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                      name="description"
                      placeholder="Owner context, blockers, and next action"
                    />
                  </label>
                  <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Add Task
                  </button>
                </form>
              )}
            </EntryModal>
          </div>

          <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
          <aside className="grid content-start gap-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Projects</h2>
            {projects.map((project) => (
              <Link
                className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                  selectedProject?.id === project.id
                    ? "border-blue-300 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                href={`/work-boards?projectId=${project.id}`}
                key={project.id}
              >
                <span className="block">{project.name}</span>
                <span className="text-xs font-medium text-slate-500">
                  {project.code} / {project.scopeLabel}
                </span>
              </Link>
            ))}
          </aside>

          <section className="overflow-x-auto pb-2">
            <div className="grid min-w-[62rem] gap-3 lg:grid-cols-5">
              {visibleBoardColumns.map((column) => {
                const columnTasks = tasks.filter((task) => task.status === column.status);
                return (
                  <div
                    className="ogfi-board-column"
                    key={column.status}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-800">{column.label}</h2>
                      <Badge>{columnTasks.length}</Badge>
                    </div>
                    <div className="grid gap-3">
                      {columnTasks.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-4 text-sm text-slate-600">
                          No {column.label.toLowerCase()} tasks for this project.
                        </div>
                      ) : (
                        columnTasks.map((task) => (
                          <BoardTaskCard
                            blockerReasonRequired={taskPolicy.blockerReasonRequired}
                            enabledStatuses={enabledStatusSet}
                            key={task.id}
                            task={task}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          </div>
        </div>
      )}
    </AppShell>
  );
}
