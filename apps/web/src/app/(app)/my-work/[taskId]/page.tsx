import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  addProjectTaskChecklistItem,
  addProjectTaskComment,
  getProjectTaskDetail,
  listProjectTaskAssigneeOptions,
  reassignProjectTask,
  resolveProjectTaskBlocker,
  transitionProjectTask,
  toggleProjectTaskChecklistItem,
  type ProjectTaskCard
} from "@/server/services/projectTasks";
import { listProjectTaskRecordLinks } from "@/server/services/projectRecordLinks";

export const dynamic = "force-dynamic";

type MyWorkTaskPageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function transitionTaskAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await transitionProjectTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
}

async function addChecklistItemAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await addProjectTaskChecklistItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
}

async function toggleChecklistItemAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await toggleProjectTaskChecklistItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
}

async function addCommentAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await addProjectTaskComment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
}

async function reassignTaskAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await reassignProjectTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
}

async function resolveBlockerAction(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  try {
    await resolveProjectTaskBlocker(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/my-work/${taskId}`, error));
  }
  redirect(`/my-work/${taskId}`);
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

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "No due date";
}

function PrimaryTaskActions({
  task,
  blockerReasonRequired
}: {
  task: ProjectTaskCard;
  blockerReasonRequired: boolean;
}) {
  if (!task.canMutate || task.status === "CANCELLED") {
    return null;
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
      <div className="grid gap-2 sm:grid-cols-2">
        {task.status !== "IN_PROGRESS" && task.status !== "COMPLETED" ? (
          <form action={transitionTaskAction}>
            <input name="taskId" type="hidden" value={task.id} />
            <input name="expectedVersion" type="hidden" value={task.version} />
            <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
            <button className="min-h-11 w-full rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700">
              Start Task
            </button>
          </form>
        ) : null}
        {task.status !== "COMPLETED" ? (
          <form action={transitionTaskAction}>
            <input name="taskId" type="hidden" value={task.id} />
            <input name="expectedVersion" type="hidden" value={task.version} />
            <input name="nextStatus" type="hidden" value="COMPLETED" />
            <button className="min-h-11 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
              Complete Task
            </button>
          </form>
        ) : (
          <div className="sm:col-span-2">
            <EntryModal title="Reopen Task" triggerLabel="Reopen Task">
              <form action={transitionTaskAction} className="mt-4 grid gap-3">
                <input name="taskId" type="hidden" value={task.id} />
                <input name="expectedVersion" type="hidden" value={task.version} />
                <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
                <input
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
                  name="reason"
                  placeholder="Reopen reason"
                  required
                />
                <button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 sm:w-fit">
                  Reopen Task
                </button>
              </form>
            </EntryModal>
          </div>
        )}
        {task.status !== "BLOCKED" && task.status !== "COMPLETED" ? (
          <div className="sm:col-span-2">
            <EntryModal title="Mark Task Blocked" triggerLabel="Mark Blocked">
              <form action={transitionTaskAction} className="mt-4 grid gap-3">
                <input name="taskId" type="hidden" value={task.id} />
                <input name="expectedVersion" type="hidden" value={task.version} />
                <input name="nextStatus" type="hidden" value="BLOCKED" />
                <input
                  className="min-h-10 rounded-md border border-amber-300 px-3 text-sm"
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
                  className="min-h-10 rounded-md border border-amber-300 px-3 text-sm"
                  name="nextReviewAt"
                  type="date"
                />
                <button className="min-h-11 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-800 sm:w-fit">
                  Mark Blocked
                </button>
              </form>
            </EntryModal>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Checklist({ task }: { task: ProjectTaskCard }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">Checklist</h2>
        <Badge>
          {task.checklistCompleted}/{task.checklistTotal}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2">
        {task.checklistItems.length === 0 ? (
          <p className="text-sm text-slate-500">No checklist items.</p>
        ) : (
          task.checklistItems.map((item) => (
            <form
              action={toggleChecklistItemAction}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-slate-200 p-3 text-sm"
              key={item.id}
            >
              <input name="checklistItemId" type="hidden" value={item.id} />
              <input name="taskId" type="hidden" value={task.id} />
              <input
                name="isCompleted"
                type="hidden"
                value={item.isCompleted ? "false" : "true"}
              />
              <span className={item.isCompleted ? "text-slate-400 line-through" : "text-slate-700"}>
                {item.title}
                {item.isRequired ? " *" : ""}
              </span>
              {task.canMutate ? (
                <button className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-bold text-slate-700">
                  {item.isCompleted ? "Reopen" : "Done"}
                </button>
              ) : null}
            </form>
          ))
        )}
      </div>
      {task.canMutate ? (
        <div className="mt-3">
          <EntryModal title="Add Checklist Item" triggerLabel="Add Checklist Item">
            <form action={addChecklistItemAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <input
                className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
                name="title"
                placeholder="Checklist item"
                required
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input name="isRequired" type="checkbox" />
                Required
              </label>
              <button className="min-h-10 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700">
                Add Checklist Item
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </Panel>
  );
}

function Comments({ task }: { task: ProjectTaskCard }) {
  return (
    <Panel>
      <h2 className="text-sm font-bold uppercase text-slate-500">Comments</h2>
      <div className="mt-3 grid gap-2">
        {task.comments.length === 0 ? (
          <p className="text-sm text-slate-500">No comments yet.</p>
        ) : (
          task.comments.slice(0, 5).map((comment) => (
            <div className="rounded-md bg-slate-50 p-3 text-sm" key={comment.id}>
              <p className="font-bold text-slate-700">{comment.authorName}</p>
              <p className="mt-1 text-slate-600">{comment.body}</p>
            </div>
          ))
        )}
      </div>
      {task.canMutate ? (
        <div className="mt-3">
          <EntryModal title="Add Comment" triggerLabel="Add Comment">
            <form action={addCommentAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <textarea
                className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="body"
                placeholder="Add comment"
                required
              />
              <button className="min-h-10 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700">
                Add Comment
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </Panel>
  );
}

function OpenBlockers({ task }: { task: ProjectTaskCard }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase text-slate-500">Open Blockers</h2>
        <Badge tone={task.openBlockerCount > 0 ? "warning" : "neutral"}>
          {task.openBlockerCount}
        </Badge>
      </div>
      <div className="mt-3 grid gap-3">
        {task.openBlockers.length === 0 ? (
          <p className="text-sm text-slate-500">No open blockers.</p>
        ) : (
          task.openBlockers.map((blocker) => (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3" key={blocker.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-amber-950">{blocker.severity}</p>
                {blocker.nextReviewAt ? (
                  <span className="text-xs font-semibold text-amber-800">
                    Review {formatDate(blocker.nextReviewAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-amber-900">{blocker.reason}</p>
              <p className="mt-2 text-xs text-amber-800">
                Owner: {blocker.ownerName} / Reported {formatDate(blocker.reportedAt)}
              </p>
              {task.canMutate ? (
                <div className="mt-3">
                  <EntryModal title="Resolve Blocker" triggerLabel="Resolve Blocker">
                    <form action={resolveBlockerAction} className="mt-4 grid gap-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <input name="blockerId" type="hidden" value={blocker.id} />
                      <textarea
                        className="min-h-20 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                        name="resolutionNote"
                        placeholder="Resolution or cancellation note"
                        required
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          className="min-h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm font-bold text-emerald-700"
                          name="nextStatus"
                          value="RESOLVED"
                        >
                          Resolve Blocker
                        </button>
                        <button
                          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
                          name="nextStatus"
                          value="CANCELLED"
                        >
                          Cancel Blocker
                        </button>
                      </div>
                    </form>
                  </EntryModal>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

export default async function MyWorkTaskPage({
  params,
  searchParams
}: MyWorkTaskPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { taskId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  const task = await getProjectTaskDetail(session, taskId);
  if (!task) {
    notFound();
  }
  const [links, assigneeOptions, taskPolicy] = await Promise.all([
    listProjectTaskRecordLinks(session, task.id),
    task.canMutate
      ? listProjectTaskAssigneeOptions(session, task.projectId)
      : Promise.resolve([]),
    getProjectTaskPolicy(session)
  ]);

  return (
    <AppShell
      session={session}
      title={task.taskKey}
      subtitle="Mobile task detail and completion"
      activeNav="my-work"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Task detail is action-focused.</strong> Status, owner, due date,
              blockers, checklist, comments, attachments, and ERP links stay visible for
              branch and project users.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Linked records are opened in their source modules; this task page does not
              approve, post, or mutate operational source records.
            </p>
          </div>
          <span>Source-safe</span>
        </div>
      </div>
      <Link className="mb-4 inline-flex text-sm font-bold text-blue-700" href="/my-work">
        Back to My Work
      </Link>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="grid content-start gap-4">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  {task.projectCode} / {task.projectName}
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-950">{task.title}</h1>
              </div>
              <Badge tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</Badge>
            </div>
            {task.description ? (
              <p className="mt-3 text-sm text-slate-600">{task.description}</p>
            ) : null}
            <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <span>Owner: {task.ownerName}</span>
              <span>Priority: {task.priority}</span>
              <span>Due: {formatDate(task.dueAt)}</span>
              {task.dueState === "OVERDUE" ? (
                <span className="font-semibold text-red-700">
                  Overdue {task.overdueDays}d
                </span>
              ) : task.dueState === "DUE_TODAY" ? (
                <span className="font-semibold text-blue-700">Due today</span>
              ) : null}
              <span>
                Checklist: {task.checklistCompleted}/{task.checklistTotal}
              </span>
              <span>Comments: {task.commentCount}</span>
              <span>Open blockers: {task.openBlockerCount}</span>
              {task.nextBlockerReviewAt ? (
                <span className="font-semibold text-amber-700">
                  Blocker review: {formatDate(task.nextBlockerReviewAt)}
                </span>
              ) : null}
            </div>
            {task.blockedReason ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {task.blockedReason}
              </div>
            ) : null}
            <PrimaryTaskActions
              blockerReasonRequired={taskPolicy.blockerReasonRequired}
              task={task}
            />
          </Panel>
          <Checklist task={task} />
          <Comments task={task} />
        </section>
        <aside className="grid content-start gap-4">
          <OpenBlockers task={task} />
          {task.canMutate && assigneeOptions.length > 0 ? (
            <Panel>
              <h2 className="text-sm font-bold uppercase text-slate-500">Reassign</h2>
              <div className="mt-3">
                <EntryModal title="Reassign Task" triggerLabel="Reassign Task">
                  <form action={reassignTaskAction} className="mt-4 grid gap-3">
                    <input name="taskId" type="hidden" value={task.id} />
                    <input name="expectedVersion" type="hidden" value={task.version} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      New owner
                      <select
                        className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
                        name="assigneeUserId"
                        defaultValue=""
                        required
                      >
                        <option disabled value="">
                          Select project member
                        </option>
                        {assigneeOptions.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName} / {member.projectRole}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      name="reason"
                      placeholder="Reason required for blocked, overdue, waiting, high, or critical tasks"
                    />
                    <button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 sm:w-fit">
                      Reassign Task
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}
          <Panel>
            <h2 className="text-sm font-bold uppercase text-slate-500">ERP Links</h2>
            {links.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No ERP source links.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {links.map((link) => (
                  <div className="rounded-md border border-slate-200 p-3 text-sm" key={link.id}>
                    <p className="font-bold text-slate-800">
                      {link.visible ? link.label : "Restricted linked record"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {link.sourceRecordType.replaceAll("_", " ")} / {link.relationType}
                    </p>
                    {link.href ? (
                      <Link className="mt-2 inline-flex text-xs font-bold text-blue-700" href={link.href}>
                        Open source record
                      </Link>
                    ) : (
                      <Badge>Restricted</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}
