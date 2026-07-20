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
  addProjectTaskChecklistItem,
  addProjectTaskComment,
  addProjectTaskAttachment,
  archiveProjectTaskAttachment,
  listMyProjectTasks,
  transitionProjectTask,
  toggleProjectTaskChecklistItem,
  type ProjectTaskCard
} from "@/server/services/projectTasks";
import {
  archiveProjectRecordLink,
  createProjectRecordLink,
  listProjectTaskRecordLinks,
  type ProjectRecordLinkSummary
} from "@/server/services/projectRecordLinks";

export const dynamic = "force-dynamic";

type MyWorkPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function transitionTaskAction(formData: FormData) {
  "use server";

  try {
    await transitionProjectTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function createLinkAction(formData: FormData) {
  "use server";

  try {
    await createProjectRecordLink(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function archiveLinkAction(formData: FormData) {
  "use server";

  try {
    await archiveProjectRecordLink(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function addChecklistItemAction(formData: FormData) {
  "use server";

  try {
    await addProjectTaskChecklistItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function toggleChecklistItemAction(formData: FormData) {
  "use server";

  try {
    await toggleProjectTaskChecklistItem(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function addCommentAction(formData: FormData) {
  "use server";

  try {
    await addProjectTaskComment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function addAttachmentAction(formData: FormData) {
  "use server";

  try {
    await addProjectTaskAttachment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
}

async function archiveAttachmentAction(formData: FormData) {
  "use server";

  try {
    await archiveProjectTaskAttachment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/my-work", error));
  }
  redirect("/my-work");
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

function dueTone(task: ProjectTaskCard) {
  if (task.dueState === "OVERDUE") {
    return "warning" as const;
  }
  if (task.dueState === "DUE_TODAY") {
    return "info" as const;
  }
  return "neutral" as const;
}

function nextTaskAction(task: ProjectTaskCard) {
  if (!task.canMutate || task.status === "CANCELLED") {
    return "View task context";
  }
  if (task.status === "COMPLETED") {
    return "Reopen with reason";
  }
  if (task.status === "BLOCKED") {
    return "Resolve blocker or complete";
  }
  if (task.status === "IN_PROGRESS" || task.status === "FOR_REVIEW") {
    return "Complete or add evidence";
  }
  return "Start task";
}

function TaskActions({
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
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {task.status !== "IN_PROGRESS" && task.status !== "COMPLETED" ? (
        <form action={transitionTaskAction}>
          <input name="taskId" type="hidden" value={task.id} />
          <input name="expectedVersion" type="hidden" value={task.version} />
          <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
          <button className="min-h-11 w-full rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100">
            Start
          </button>
        </form>
      ) : null}
      {task.status !== "COMPLETED" ? (
        <form action={transitionTaskAction}>
          <input name="taskId" type="hidden" value={task.id} />
          <input name="expectedVersion" type="hidden" value={task.version} />
          <input name="nextStatus" type="hidden" value="COMPLETED" />
          <button className="min-h-11 w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
            Complete
          </button>
        </form>
      ) : (
        <div className="sm:col-span-2">
          <EntryModal title="Reopen Task" triggerLabel="Reopen">
            <form action={transitionTaskAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <input name="expectedVersion" type="hidden" value={task.version} />
              <input name="nextStatus" type="hidden" value="IN_PROGRESS" />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="reason"
                placeholder="Reopen reason"
                required
              />
              <button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-fit">
                Reopen
              </button>
            </form>
          </EntryModal>
        </div>
      )}
      {task.status !== "BLOCKED" && task.status !== "COMPLETED" ? (
        <div className="sm:col-span-2">
          <EntryModal title="Mark Task Blocked" triggerLabel="Block">
            <form action={transitionTaskAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
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
              <button className="min-h-11 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-800 hover:bg-amber-100 sm:w-fit">
                Block
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </div>
  );
}

function SourceLinks({ links }: { links: ProjectRecordLinkSummary[] }) {
  if (links.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        No ERP source links.
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      {links.map((link) => (
        <div
          className="ogfi-record-summary p-3 text-xs"
          key={link.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-slate-800">
                {link.visible ? link.label : "Restricted linked record"}
              </p>
              <p className="text-slate-500">
                {link.sourceRecordType.replaceAll("_", " ")} / {link.relationType}
              </p>
            </div>
            {link.href ? (
              <a
                className="inline-flex min-h-10 items-center rounded-md border border-blue-200 bg-blue-50 px-3 font-bold text-blue-700"
                href={link.href}
              >
                Open
              </a>
            ) : (
              <Badge>Restricted</Badge>
            )}
          </div>
          {link.visible ? (
            <p className="mt-2 text-slate-500">
              {link.status} / {link.scopeLabel} / {link.primaryDate ?? "No date"}
            </p>
          ) : null}
          <div className="mt-2">
            <EntryModal title="Remove ERP Link" triggerLabel="Remove">
              <form action={archiveLinkAction} className="mt-4 grid gap-3">
                <input name="linkId" type="hidden" value={link.id} />
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  name="archiveReason"
                  placeholder="Archive reason"
                  required
                />
                <button className="min-h-11 rounded-md border border-slate-300 px-3 font-bold text-slate-700 sm:w-fit">
                  Remove
                </button>
              </form>
            </EntryModal>
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkForm({ task }: { task: ProjectTaskCard }) {
  if (!task.canMutate) {
    return null;
  }

  return (
    <div className="mt-3">
      <EntryModal title="Link ERP Record" triggerLabel="Link ERP Record">
        <form action={createLinkAction} className="mt-4 grid gap-3">
          <input name="projectId" type="hidden" value={task.projectId} />
          <input name="taskId" type="hidden" value={task.id} />
          <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="sourceRecordType">
              <option value="PURCHASE_REQUEST">Purchase Request</option>
              <option value="PURCHASE_ORDER">Purchase Order</option>
              <option value="GOODS_RECEIPT">Goods Receipt</option>
              <option value="INVENTORY_TRANSFER">Transfer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="INVENTORY_MOVEMENT">Inventory Movement</option>
              <option value="INVENTORY_BALANCE">Inventory Balance</option>
              <option value="APPROVAL_INSTANCE">Approval</option>
              <option value="WASTAGE_REPORT">Wastage Report</option>
              <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
            </select>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              name="sourceRecordId"
              placeholder="Source record UUID"
              required
            />
          </div>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            name="linkLabel"
            placeholder="Display label"
            required
          />
          <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
            Link ERP Record
          </button>
        </form>
      </EntryModal>
    </div>
  );
}

function TaskChecklist({ task }: { task: ProjectTaskCard }) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase text-slate-500">Checklist</p>
        <Badge>
          {task.checklistCompleted}/{task.checklistTotal}
        </Badge>
      </div>
      {task.checklistItems.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No checklist items.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {task.checklistItems.map((item) => (
            <form
              action={toggleChecklistItemAction}
              className="flex items-center justify-between gap-2 text-xs"
              key={item.id}
            >
              <input name="checklistItemId" type="hidden" value={item.id} />
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
        <button className="min-h-11 rounded-md border border-slate-300 px-3 font-bold text-slate-700">
          {item.isCompleted ? "Reopen" : "Done"}
        </button>
              ) : null}
            </form>
          ))}
        </div>
      )}
      {task.canMutate ? (
        <div className="mt-3">
          <EntryModal title="Add Checklist Item" triggerLabel="Add Checklist Item">
            <form action={addChecklistItemAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="title"
                placeholder="Checklist item"
                required
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input name="isRequired" type="checkbox" />
                Required
              </label>
              <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Add Checklist Item
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </div>
  );
}

function TaskComments({ task }: { task: ProjectTaskCard }) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase text-slate-500">Comments</p>
      {task.comments.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No comments yet.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {task.comments.slice(0, 3).map((comment) => (
            <div className="ogfi-record-summary p-3 text-xs" key={comment.id}>
              <p className="font-bold text-slate-700">{comment.authorName}</p>
              <p className="mt-1 text-slate-600">{comment.body}</p>
            </div>
          ))}
        </div>
      )}
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
              <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Add Comment
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${Math.round(sizeBytes / (1024 * 1024))} MB`;
}

function TaskAttachments({ task }: { task: ProjectTaskCard }) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase text-slate-500">Attachments</p>
        <Badge>{task.attachmentCount}</Badge>
      </div>
      {task.attachments.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No attachment metadata linked.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          {task.attachments.map((attachment) => (
            <div className="ogfi-record-summary p-3 text-xs" key={attachment.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800">{attachment.originalFilename}</p>
                  <p className="text-slate-500">
                    {attachment.purpose.replaceAll("_", " ")} / {attachment.mimeType} / {formatBytes(attachment.sizeBytes)}
                  </p>
                  {attachment.caption ? (
                    <p className="mt-1 text-slate-600">{attachment.caption}</p>
                  ) : null}
                </div>
                <Badge>{attachment.createdByName}</Badge>
              </div>
              {task.canMutate ? (
                <form action={archiveAttachmentAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input name="projectAttachmentId" type="hidden" value={attachment.id} />
                  <input
                    className="rounded-md border border-slate-300 px-2 py-1"
                    name="archiveReason"
                    placeholder="Archive reason"
                    required
                  />
                  <button className="min-h-11 rounded-md border border-slate-300 px-3 font-bold text-slate-700">
                    Archive
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {task.canMutate ? (
        <div className="mt-3">
          <EntryModal title="Add Attachment" triggerLabel="Add Attachment">
            <form action={addAttachmentAction} className="mt-4 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="purpose" defaultValue="EVIDENCE">
                  <option value="EVIDENCE">Evidence</option>
                  <option value="REFERENCE">Reference</option>
                  <option value="COMPLETION_SUPPORT">Completion support</option>
                  <option value="ISSUE_SUPPORT">Issue support</option>
                </select>
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  name="attachmentId"
                  placeholder="Attachment metadata UUID"
                  required
                />
              </div>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                name="caption"
                placeholder="Caption"
              />
              <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Add Attachment
              </button>
            </form>
          </EntryModal>
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  links,
  blockerReasonRequired
}: {
  task: ProjectTaskCard;
  links: ProjectRecordLinkSummary[];
  blockerReasonRequired: boolean;
}) {
  return (
    <Panel className="border border-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {task.taskKey}
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-950">{task.title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {task.projectCode} / {task.projectName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</Badge>
          <Badge tone={dueTone(task)}>
            {task.dueState === "OVERDUE"
              ? `Overdue ${task.overdueDays}d`
              : task.dueState.replaceAll("_", " ")}
          </Badge>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Next action
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {nextTaskAction(task)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Owner: {task.ownerName}
          {task.assigneeNames.length > 0 ? ` / Assignees: ${task.assigneeNames.join(", ")}` : ""}
        </p>
      </div>
      <Link
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700"
        href={`/my-work/${task.id}`}
      >
        Open task detail
      </Link>
      {task.description ? (
        <p className="mt-3 text-sm text-slate-600">{task.description}</p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span>Priority: {task.priority}</span>
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
          Checklist: {task.checklistCompleted}/{task.checklistTotal}
        </span>
        <span>Comments: {task.commentCount}</span>
        <span>Open blockers: {task.openBlockerCount}</span>
        {task.nextBlockerReviewAt ? (
          <span className="font-semibold text-amber-700">
            Blocker review: {new Date(task.nextBlockerReviewAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      {task.blockedReason ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {task.blockedReason}
        </div>
      ) : null}
      <TaskChecklist task={task} />
      <TaskComments task={task} />
      <TaskAttachments task={task} />
      <SourceLinks links={links} />
      <LinkForm task={task} />
      <TaskActions blockerReasonRequired={blockerReasonRequired} task={task} />
    </Panel>
  );
}

export default async function MyWorkPage({ searchParams }: MyWorkPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseProjects(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const [tasks, taskPolicy] = await Promise.all([
    listMyProjectTasks(session),
    getProjectTaskPolicy(session)
  ]);
  const linkEntries = await Promise.all(
    tasks.map(async (task) => [task.id, await listProjectTaskRecordLinks(session, task.id)] as const)
  );
  const linksByTaskId = new Map(linkEntries);
  const activeTasks = tasks.filter(
    (task) => task.status !== "COMPLETED" && task.status !== "CANCELLED"
  );
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");

  return (
    <AppShell
      session={session}
      title="My Work"
      subtitle="Assigned project tasks with controlled status transitions"
      activeNav="my-work"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>My Work is your task queue.</strong> It brings assigned project
              tasks, blockers, comments, attachments, and ERP links together without
              changing linked source records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Use the labeled actions on mobile; source PR, PO, receiving, transfer,
              and inventory records remain controlled in their own modules.
            </p>
          </div>
          <span>Task-first</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-5">
        <Panel className="p-4">
          <p className="text-sm font-semibold text-slate-500">Assigned tasks</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{tasks.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold text-slate-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">{activeTasks.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold text-slate-500">Blocked</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {tasks.filter((task) => task.status === "BLOCKED").length}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold text-slate-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-red-700">
            {tasks.filter((task) => task.isOverdue).length}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-sm font-semibold text-slate-500">Completed</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {completedTasks.length}
          </p>
        </Panel>
      </div>

      {tasks.length === 0 ? (
        <Panel className="ogfi-detail-card">
          <p className="font-semibold text-slate-900">No assigned project tasks</p>
          <p className="mt-1 text-sm text-slate-600">
            Tasks assigned to you from scoped projects will appear here.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <section className="grid gap-4">
            {activeTasks.map((task) => (
              <TaskCard
                blockerReasonRequired={taskPolicy.blockerReasonRequired}
                key={task.id}
                links={linksByTaskId.get(task.id) ?? []}
                task={task}
              />
            ))}
          </section>
          <aside className="grid content-start gap-3">
            <h2 className="text-sm font-bold uppercase text-slate-500">
              Recently Completed
            </h2>
            {completedTasks.slice(0, 5).map((task) => (
              <TaskCard
                blockerReasonRequired={taskPolicy.blockerReasonRequired}
                key={task.id}
                links={linksByTaskId.get(task.id) ?? []}
                task={task}
              />
            ))}
          </aside>
        </div>
      )}
    </AppShell>
  );
}
