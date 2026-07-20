import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { Badge } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { EntryModal } from "@/components/EntryModal";
import { ExpansionEntrySheet } from "@/components/ExpansionEntrySheet";
import { ExpansionWorkspaceNav } from "@/components/ExpansionWorkspaceNav";
import { FinancePagination, getPaginationState } from "@/components/FinancePagination";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canConfigureProjectTemplates,
  canUseProjects,
  getDefaultAppRoute
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getExpansionOpeningPlaybook,
  archiveProjectTemplate,
  duplicateExpansionOpeningPlaybookRevision,
  publishProjectTemplate,
  removeExpansionOpeningPlaybookChecklistItem,
  removeExpansionOpeningPlaybookEvidenceDefault,
  removeExpansionOpeningPlaybookMilestone,
  removeExpansionOpeningPlaybookSignoffDefault,
  removeExpansionOpeningPlaybookTask,
  updateExpansionOpeningPlaybookReminders,
  updateExpansionOpeningPlaybookOverview,
  upsertExpansionOpeningPlaybookChecklistItem,
  upsertExpansionOpeningPlaybookEvidenceDefault,
  upsertExpansionOpeningPlaybookMilestone,
  upsertExpansionOpeningPlaybookSignoffDefault,
  upsertExpansionOpeningPlaybookTask,
  type ProjectTemplateConfig,
  type ProjectTemplateEvidenceDefault,
  type ProjectTemplateMilestoneDefault,
  type ProjectTemplateSignoffDefault,
  type ProjectTemplateTaskDefault
} from "@/server/services/projectTemplates";

export const dynamic = "force-dynamic";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "milestones", label: "Milestones" },
  { key: "checklists", label: "Checklists" },
  { key: "signoffs", label: "Evidence & Signoffs" },
  { key: "reminders", label: "Reminders" }
] as const;

const priorities = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const statuses = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "WAITING_FOR_APPROVAL",
  "BLOCKED",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED"
] as const;
const ownerRoles = ["PROJECT_MANAGER", "PROJECT_SPONSOR", "CREATOR"] as const;
const evidenceTypes = [
  "DOCUMENT",
  "PHOTO",
  "SOURCE_RECORD_LINK",
  "APPROVAL_NOTE"
] as const;
const signoffStages = [
  "SITE_HANDOVER",
  "PERMIT_READY",
  "CONSTRUCTION_READY",
  "OPS_READY",
  "GO_NO_GO",
  "STABILIZATION"
] as const;
const expansionProjectTypes = [
  "Branch Opening",
  "Renovation",
  "Relocation",
  "Construction",
  "Expansion Project"
] as const;

type OpeningPlaybookDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function upsertTaskAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await upsertExpansionOpeningPlaybookTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=tasks`, error));
  }
  redirect(`/expansion/playbooks/${id}?tab=tasks`);
}

async function updateOverviewAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await updateExpansionOpeningPlaybookOverview(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=overview`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=overview`);
}

async function publishPlaybookAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await publishProjectTemplate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=overview`, error));
  }
  redirect(`/expansion/playbooks/${id}?tab=overview`);
}

async function createDraftRevisionAction(formData: FormData) {
  "use server";

  const sourceTemplateId = String(formData.get("sourceTemplateId"));
  let revisionId: string;
  try {
    revisionId = await duplicateExpansionOpeningPlaybookRevision(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${sourceTemplateId}?tab=overview`, error)
    );
  }
  redirect(`/expansion/playbooks/${revisionId}?tab=overview`);
}

async function archivePlaybookAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await archiveProjectTemplate(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=overview`, error));
  }
  redirect("/expansion/playbooks");
}

async function removeTaskAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await removeExpansionOpeningPlaybookTask(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=tasks`, error));
  }
  redirect(`/expansion/playbooks/${id}?tab=tasks`);
}

async function upsertMilestoneAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await upsertExpansionOpeningPlaybookMilestone(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=milestones`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=milestones`);
}

async function removeMilestoneAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await removeExpansionOpeningPlaybookMilestone(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=milestones`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=milestones`);
}

async function upsertChecklistAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await upsertExpansionOpeningPlaybookChecklistItem(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=checklists`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=checklists`);
}

async function removeChecklistAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await removeExpansionOpeningPlaybookChecklistItem(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=checklists`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=checklists`);
}

async function upsertEvidenceAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await upsertExpansionOpeningPlaybookEvidenceDefault(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=signoffs`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=signoffs`);
}

async function removeEvidenceAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await removeExpansionOpeningPlaybookEvidenceDefault(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=signoffs`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=signoffs`);
}

async function upsertSignoffAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await upsertExpansionOpeningPlaybookSignoffDefault(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=signoffs`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=signoffs`);
}

async function removeSignoffAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await removeExpansionOpeningPlaybookSignoffDefault(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=signoffs`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=signoffs`);
}

async function updateRemindersAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await updateExpansionOpeningPlaybookReminders(formData);
  } catch (error) {
    redirect(
      actionErrorRedirectPath(`/expansion/playbooks/${id}?tab=reminders`, error)
    );
  }
  redirect(`/expansion/playbooks/${id}?tab=reminders`);
}

function firstSearchValue(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function tabHref(id: string, tab: string) {
  return `/expansion/playbooks/${id}?tab=${tab}`;
}

function statusTone(status: string) {
  if (status === "PUBLISHED") {
    return "success" as const;
  }
  if (status === "ARCHIVED") {
    return "neutral" as const;
  }
  return "info" as const;
}

function offsetLabel(value: number | undefined) {
  if (typeof value !== "number") {
    return "No offset";
  }
  if (value === 0) {
    return "Opening date";
  }
  return value > 0 ? `Opening +${value} days` : `Opening ${value} days`;
}

function checklistText(task: ProjectTemplateTaskDefault) {
  return task.checklistItems.map((item) => item.title).join("\n");
}

function TaskForm({
  id,
  version,
  task,
  showSubmit = true
}: {
  id: string;
  version: number;
  task?: ProjectTemplateTaskDefault;
  showSubmit?: boolean;
}) {
  return (
    <form action={upsertTaskAction} className="grid gap-5 pt-5">
      <input name="id" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      {task ? (
        <input name="originalTaskCode" type="hidden" value={task.templateTaskCode} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Task code
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="templateTaskCode"
            defaultValue={task?.templateTaskCode ?? ""}
            placeholder="OPS-001"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Task title
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="title"
            defaultValue={task?.title ?? ""}
            placeholder="Complete operations opening readiness"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Priority
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="priority"
            defaultValue={task?.priority ?? "NORMAL"}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {humanize(priority)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Starting status
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="status"
            defaultValue={task?.status ?? "PLANNED"}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Owner role
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="ownerRole"
            defaultValue={task?.owner.value ?? "PROJECT_MANAGER"}
          >
            {ownerRoles.map((role) => (
              <option key={role} value={role}>
                {humanize(role)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Start offset days
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="startOffsetDays"
            type="number"
            defaultValue={task?.startOffsetDays ?? ""}
            placeholder="-14"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Due offset days
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="dueOffsetDays"
            type="number"
            defaultValue={task?.dueOffsetDays ?? ""}
            placeholder="7"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Description
        <textarea
          className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="description"
          defaultValue={task?.description ?? ""}
          placeholder="Optional task context"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Checklist lines
        <textarea
          className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="checklistItems"
          defaultValue={task ? checklistText(task) : ""}
          placeholder="One required checklist line per row"
        />
      </label>
      {showSubmit ? <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
        Save Task
      </button> : null}
    </form>
  );
}

function MilestoneForm({
  id,
  version,
  milestone,
  showSubmit = true
}: {
  id: string;
  version: number;
  milestone?: ProjectTemplateMilestoneDefault;
  showSubmit?: boolean;
}) {
  return (
    <form action={upsertMilestoneAction} className="grid gap-5 pt-5">
      <input name="id" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      {milestone ? <input name="originalCode" type="hidden" value={milestone.code} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Milestone code
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="code"
            defaultValue={milestone?.code ?? ""}
            placeholder="MS-OPENING"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Milestone title
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="title"
            defaultValue={milestone?.title ?? ""}
            placeholder="Opening go/no-go checkpoint"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Target offset days
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="targetOffsetDays"
            type="number"
            defaultValue={milestone?.targetOffsetDays ?? ""}
            placeholder="30"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Owner role
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="ownerRole"
            defaultValue={milestone?.owner.value ?? "PROJECT_MANAGER"}
          >
            {ownerRoles.map((role) => (
              <option key={role} value={role}>
                {humanize(role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Description
        <textarea
          className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="description"
          defaultValue={milestone?.description ?? ""}
          placeholder="Optional checkpoint context"
        />
      </label>
      {showSubmit ? <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
        Save Milestone
      </button> : null}
    </form>
  );
}

function ChecklistItemForm({
  id,
  version,
  tasks,
  taskCode,
  item
}: {
  id: string;
  version: number;
  tasks: ProjectTemplateTaskDefault[];
  taskCode?: string;
  item?: ProjectTemplateTaskDefault["checklistItems"][number];
}) {
  return (
    <form action={upsertChecklistAction} className="grid gap-5 pt-5">
      <input name="id" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      {item ? <input name="originalTitle" type="hidden" value={item.title} /> : null}
      {item && taskCode ? (
        <input name="originalTaskCode" type="hidden" value={taskCode} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Task
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="taskCode"
            defaultValue={taskCode ?? tasks[0]?.templateTaskCode ?? ""}
            required
          >
            {tasks.map((task) => (
              <option key={task.templateTaskCode} value={task.templateTaskCode}>
                {task.templateTaskCode} - {task.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Checklist line
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="title"
            defaultValue={item?.title ?? ""}
            placeholder="Confirm permit evidence is attached"
            required
          />
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
        <input
          className="mt-1"
          name="required"
          type="checkbox"
          defaultChecked={item?.required ?? true}
        />
        <span>
          Required before signoff
          <span className="block text-xs font-normal leading-5 text-slate-500">
            Required lines become project completion evidence checks when this
            playbook is copied to a new opening project.
          </span>
        </span>
      </label>
      <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
        Save Checklist Line
      </button>
    </form>
  );
}

function EvidenceDefaultForm({
  id,
  version,
  tasks,
  evidence
}: {
  id: string;
  version: number;
  tasks: ProjectTemplateTaskDefault[];
  evidence?: ProjectTemplateEvidenceDefault;
}) {
  return (
    <form action={upsertEvidenceAction} className="grid gap-5 pt-5">
      <input name="id" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      {evidence ? <input name="originalCode" type="hidden" value={evidence.code} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Evidence code
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="code"
            defaultValue={evidence?.code ?? ""}
            placeholder="EV-PERMIT"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Evidence requirement
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="label"
            defaultValue={evidence?.label ?? ""}
            placeholder="Permit and license evidence"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Evidence type
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="evidenceType"
            defaultValue={evidence?.evidenceType ?? "DOCUMENT"}
          >
            {evidenceTypes.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Linked task
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="taskCode"
            defaultValue={evidence?.taskCode ?? ""}
          >
            <option value="">No task link</option>
            {tasks.map((task) => (
              <option key={task.templateTaskCode} value={task.templateTaskCode}>
                {task.templateTaskCode} - {task.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Owner role
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="ownerRole"
            defaultValue={evidence?.owner.value ?? "PROJECT_MANAGER"}
          >
            {ownerRoles.map((role) => (
              <option key={role} value={role}>
                {humanize(role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
        <input
          className="mt-1"
          name="required"
          type="checkbox"
          defaultChecked={evidence?.required ?? true}
        />
        <span>
          Required evidence
          <span className="block text-xs font-normal leading-5 text-slate-500">
            This requirement is copied to new projects. It does not upload files
            here or alter procurement, finance, branch, or inventory source records.
          </span>
        </span>
      </label>
      <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
        Save Evidence Requirement
      </button>
    </form>
  );
}

function SignoffDefaultForm({
  id,
  version,
  signoff
}: {
  id: string;
  version: number;
  signoff?: ProjectTemplateSignoffDefault;
}) {
  return (
    <form action={upsertSignoffAction} className="grid gap-5 pt-5">
      <input name="id" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      {signoff ? <input name="originalCode" type="hidden" value={signoff.code} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Signoff code
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="code"
            defaultValue={signoff?.code ?? ""}
            placeholder="SO-GO-NOGO"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Signoff requirement
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="label"
            defaultValue={signoff?.label ?? ""}
            placeholder="Opening go/no-go approval"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Stage
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="stage"
            defaultValue={signoff?.stage ?? "GO_NO_GO"}
          >
            {signoffStages.map((stage) => (
              <option key={stage} value={stage}>
                {humanize(stage)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Owner role
          <select
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            name="ownerRole"
            defaultValue={signoff?.owner.value ?? "PROJECT_SPONSOR"}
          >
            {ownerRoles.map((role) => (
              <option key={role} value={role}>
                {humanize(role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
        <input
          className="mt-1"
          name="required"
          type="checkbox"
          defaultChecked={signoff?.required ?? true}
        />
        <span>
          Required signoff
          <span className="block text-xs font-normal leading-5 text-slate-500">
            Signoff defaults define project readiness checks only. They do not
            approve source ERP records or bypass controlled modules.
          </span>
        </span>
      </label>
      <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
        Save Signoff Requirement
      </button>
    </form>
  );
}

function OverviewTab({
  config
}: {
  config: ProjectTemplateConfig;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-950">Status Flow</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.statusSet.map((status) => (
            <Badge key={status} tone="info">
              {humanize(status)}
            </Badge>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-950">Defaults</h3>
        <dl className="mt-3 grid gap-3 text-sm text-slate-600">
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">
              Initial task status
            </dt>
            <dd className="font-semibold text-slate-900">
              {humanize(config.defaults.initialTaskStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">
              Owner assignment
            </dt>
            <dd className="font-semibold text-slate-900">
              {humanize(config.defaults.ownerAssignment)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">
              Config source
            </dt>
            <dd className="font-semibold text-slate-900">
              {config.source ?? "Manual"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function TasksTab({
  id,
  version,
  tasks,
  canEdit,
  pageParam
}: {
  id: string;
  version: number;
  tasks: ProjectTemplateTaskDefault[];
  canEdit: boolean;
  pageParam?: string;
}) {
  const pagination = getPaginationState(tasks.length, pageParam);
  const visibleTasks = tasks.slice(pagination.startIndex, pagination.endIndex);
  return (
    <div>
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-5 py-3">Task</th>
            <th className="px-5 py-3">Owner / Priority</th>
            <th className="px-5 py-3">Offsets</th>
            <th className="px-5 py-3">Checklist</th>
            <th className="px-5 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleTasks.length > 0 ? visibleTasks.map((task) => (
            <tr className="align-top hover:bg-slate-50/70" key={task.templateTaskCode}>
              <td className="px-5 py-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  {task.templateTaskCode} / {humanize(task.status)}
                </p>
                <p className="mt-1 font-bold text-slate-950">{task.title}</p>
                {task.description ? (
                  <p className="mt-1 max-w-xl text-xs text-slate-500">
                    {task.description}
                  </p>
                ) : null}
              </td>
              <td className="px-5 py-4 text-slate-700">
                <p className="font-semibold">{humanize(task.owner.value)}</p>
                <p className="text-xs text-slate-500">{humanize(task.priority)}</p>
              </td>
              <td className="px-5 py-4 text-slate-600">
                <p>Start: {offsetLabel(task.startOffsetDays)}</p>
                <p>Due: {offsetLabel(task.dueOffsetDays)}</p>
              </td>
              <td className="px-5 py-4 text-slate-600">
                {task.checklistItems.length} required line(s)
              </td>
              <td className="px-5 py-4">
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <ExpansionEntrySheet
                      title={`Edit ${task.templateTaskCode}`}
                      triggerLabel="Edit"
                      submitLabel="Save task"
                      triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <TaskForm id={id} version={version} task={task} showSubmit={false} />
                    </ExpansionEntrySheet>
                    <form action={removeTaskAction}>
                      <input name="id" type="hidden" value={id} />
                      <input name="expectedVersion" type="hidden" value={version} />
                      <input name="templateTaskCode" type="hidden" value={task.templateTaskCode} />
                      <ConfirmSubmitButton label="Remove" confirmation={`Remove ${task.templateTaskCode} from this draft playbook?`} />
                    </form>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</span>
                )}
              </td>
            </tr>
          )) : (
            <tr><td className="px-5 py-8 text-sm text-slate-500" colSpan={5}>No playbook tasks yet. Add the first task to make checklist, evidence, and signoff defaults available.</td></tr>
          )}
        </tbody>
      </table>
    </div>
    <div className="divide-y divide-slate-100 md:hidden">
      {visibleTasks.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No playbook tasks yet. Add the first task to make checklist, evidence, and signoff defaults available.</div> : visibleTasks.map((task) => (
        <article className="grid gap-3 px-5 py-4" key={task.templateTaskCode}>
          <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.templateTaskCode} / {humanize(task.status)}</p></div><Badge tone="neutral">{humanize(task.priority)}</Badge></div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner role</p><p className="mt-1 font-semibold text-slate-800">{humanize(task.owner.value)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Checklist</p><p className="mt-1 font-semibold text-slate-800">{task.checklistItems.length} line(s)</p></div></div>
          <p className="text-sm text-slate-600">Start: {offsetLabel(task.startOffsetDays)} · Due: {offsetLabel(task.dueOffsetDays)}</p>
          {task.description ? <p className="text-sm text-slate-600">{task.description}</p> : null}
          {canEdit ? <div className="flex flex-wrap gap-2"><ExpansionEntrySheet title={`Edit ${task.templateTaskCode}`} triggerLabel="Edit" submitLabel="Save task" triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"><TaskForm id={id} version={version} task={task} showSubmit={false} /></ExpansionEntrySheet><form action={removeTaskAction}><input name="id" type="hidden" value={id} /><input name="expectedVersion" type="hidden" value={version} /><input name="templateTaskCode" type="hidden" value={task.templateTaskCode} /><ConfirmSubmitButton label="Remove" confirmation={`Remove ${task.templateTaskCode} from this draft playbook?`} /></form></div> : <span className="text-xs font-semibold text-slate-500">Read-only version</span>}
        </article>
      ))}
    </div>
    <FinancePagination basePath={`/expansion/playbooks/${id}`} tab="tasks" {...pagination} totalCount={tasks.length} />
    </div>
  );
}

function MilestonesTab({
  id,
  version,
  milestones,
  canEdit,
  pageParam
}: {
  id: string;
  version: number;
  milestones: ProjectTemplateMilestoneDefault[];
  canEdit: boolean;
  pageParam?: string;
}) {
  const pagination = getPaginationState(milestones.length, pageParam);
  const visibleMilestones = milestones.slice(pagination.startIndex, pagination.endIndex);
  return (
    <div>
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-5 py-3">Milestone</th>
            <th className="px-5 py-3">Owner</th>
            <th className="px-5 py-3">Target Offset</th>
            <th className="px-5 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleMilestones.length > 0 ? visibleMilestones.map((milestone) => (
            <tr className="align-top hover:bg-slate-50/70" key={milestone.code}>
              <td className="px-5 py-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  {milestone.code}
                </p>
                <p className="mt-1 font-bold text-slate-950">{milestone.title}</p>
                {milestone.description ? (
                  <p className="mt-1 max-w-xl text-xs text-slate-500">
                    {milestone.description}
                  </p>
                ) : null}
              </td>
              <td className="px-5 py-4 font-semibold text-slate-700">
                {humanize(milestone.owner.value)}
              </td>
              <td className="px-5 py-4 text-slate-600">
                {offsetLabel(milestone.targetOffsetDays)}
              </td>
              <td className="px-5 py-4">
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <ExpansionEntrySheet
                      title={`Edit ${milestone.code}`}
                      triggerLabel="Edit"
                      submitLabel="Save milestone"
                      triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <MilestoneForm id={id} version={version} milestone={milestone} showSubmit={false} />
                    </ExpansionEntrySheet>
                    <form action={removeMilestoneAction}>
                      <input name="id" type="hidden" value={id} />
                      <input name="expectedVersion" type="hidden" value={version} />
                      <input name="code" type="hidden" value={milestone.code} />
                      <ConfirmSubmitButton label="Remove" confirmation={`Remove milestone ${milestone.code} from this draft playbook?`} />
                    </form>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</span>
                )}
              </td>
            </tr>
          )) : (
            <tr><td className="px-5 py-8 text-sm text-slate-500" colSpan={4}>No milestones yet. Add a milestone to set the timing checkpoints copied to future projects.</td></tr>
          )}
        </tbody>
      </table>
    </div>
    <div className="divide-y divide-slate-100 md:hidden">
      {visibleMilestones.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No milestones yet. Add a milestone to set timing checkpoints for future projects.</div> : visibleMilestones.map((milestone) => (
        <article className="grid gap-3 px-5 py-4" key={milestone.code}>
          <div><p className="font-bold text-slate-950">{milestone.title}</p><p className="mt-1 text-xs text-slate-500">{milestone.code}</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-semibold uppercase text-slate-500">Owner role</p><p className="mt-1 font-semibold text-slate-800">{humanize(milestone.owner.value)}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Target</p><p className="mt-1 font-semibold text-slate-800">{offsetLabel(milestone.targetOffsetDays)}</p></div></div>
          {milestone.description ? <p className="text-sm text-slate-600">{milestone.description}</p> : null}
          {canEdit ? <div className="flex flex-wrap gap-2"><ExpansionEntrySheet title={`Edit ${milestone.code}`} triggerLabel="Edit" submitLabel="Save milestone" triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"><MilestoneForm id={id} version={version} milestone={milestone} showSubmit={false} /></ExpansionEntrySheet><form action={removeMilestoneAction}><input name="id" type="hidden" value={id} /><input name="expectedVersion" type="hidden" value={version} /><input name="code" type="hidden" value={milestone.code} /><ConfirmSubmitButton label="Remove" confirmation={`Remove milestone ${milestone.code} from this draft playbook?`} /></form></div> : <span className="text-xs font-semibold text-slate-500">Read-only version</span>}
        </article>
      ))}
    </div>
    <FinancePagination basePath={`/expansion/playbooks/${id}`} tab="milestones" {...pagination} totalCount={milestones.length} />
    </div>
  );
}

function ChecklistsTab({
  id,
  version,
  tasks,
  canEdit,
  pageParam
}: {
  id: string;
  version: number;
  tasks: ProjectTemplateTaskDefault[];
  canEdit: boolean;
  pageParam?: string;
}) {
  const checklistRows = tasks.flatMap((task) =>
    task.checklistItems.map((item) => ({
      task,
      item
    }))
  );
  const pagination = getPaginationState(checklistRows.length, pageParam);
  const visibleChecklistRows = checklistRows.slice(pagination.startIndex, pagination.endIndex);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950">Checklist Lines</h3>
          <p className="text-sm text-slate-500">
            Copied into new projects as minimum readiness checks.
          </p>
        </div>
        {canEdit && tasks.length > 0 ? (
          <EntryModal
            title="Add Checklist Line"
            triggerLabel="Add Checklist Line"
            triggerClassName="gap-2"
          >
            <ChecklistItemForm id={id} version={version} tasks={tasks} />
          </EntryModal>
        ) : canEdit ? <Link className="text-sm font-bold text-blue-700 hover:text-blue-900" href={`/expansion/playbooks/${id}?tab=tasks`}>Add a task first</Link> : null}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Checklist Line</th>
              <th className="px-5 py-3">Required</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checklistRows.length > 0 ? (
              visibleChecklistRows.map(({ task, item }) => (
                <tr key={`${task.templateTaskCode}-${item.title}`}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {task.templateTaskCode}
                    </p>
                    <p className="text-xs text-slate-500">{task.title}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-900">{item.title}</td>
                  <td className="px-5 py-4">
                    <Badge tone={item.required ? "warning" : "neutral"}>
                      {item.required ? "Required" : "Optional"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <EntryModal
                          title={`Edit ${task.templateTaskCode} Checklist`}
                          triggerLabel="Edit"
                          triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <ChecklistItemForm
                            id={id}
                            version={version}
                            item={item}
                            taskCode={task.templateTaskCode}
                            tasks={tasks}
                          />
                        </EntryModal>
                        <form action={removeChecklistAction}>
                          <input name="id" type="hidden" value={id} />
                          <input name="expectedVersion" type="hidden" value={version} />
                          <input name="taskCode" type="hidden" value={task.templateTaskCode} />
                          <input name="title" type="hidden" value={item.title} />
                          <ConfirmSubmitButton label="Remove" confirmation={`Remove checklist line ${item.title} from this draft playbook?`} />
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-6 text-sm text-slate-500" colSpan={4}>
                  No checklist lines yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {checklistRows.length > 0 ? (
          visibleChecklistRows.map(({ task, item }) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              key={`${task.templateTaskCode}-${item.title}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    {task.templateTaskCode}
                  </p>
                  <h4 className="font-bold text-slate-950">{item.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">{task.title}</p>
                </div>
                <Badge tone={item.required ? "warning" : "neutral"}>
                  {item.required ? "Required" : "Optional"}
                </Badge>
              </div>
              {canEdit ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <EntryModal
                    title={`Edit ${task.templateTaskCode} Checklist`}
                    triggerLabel="Edit"
                    triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    <ChecklistItemForm
                      id={id}
                      version={version}
                      item={item}
                      taskCode={task.templateTaskCode}
                      tasks={tasks}
                    />
                  </EntryModal>
                  <form action={removeChecklistAction}>
                    <input name="id" type="hidden" value={id} />
                    <input name="expectedVersion" type="hidden" value={version} />
                    <input name="taskCode" type="hidden" value={task.templateTaskCode} />
                    <input name="title" type="hidden" value={item.title} />
                    <ConfirmSubmitButton label="Remove" confirmation={`Remove checklist line ${item.title} from this draft playbook?`} />
                  </form>
                </div>
              ) : (
                <p className="mt-4 text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</p>
              )}
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No checklist lines yet.
          </p>
        )}
      </div>
      <FinancePagination basePath={`/expansion/playbooks/${id}`} tab="checklists" {...pagination} totalCount={checklistRows.length} />
    </div>
  );
}

function EvidenceSignoffsTab({
  id,
  version,
  tasks,
  evidenceDefaults,
  signoffDefaults,
  canEdit,
  requiredChecklistCount,
  criticalTaskCount,
  evidencePageParam,
  signoffPageParam
}: {
  id: string;
  version: number;
  tasks: ProjectTemplateTaskDefault[];
  evidenceDefaults: ProjectTemplateEvidenceDefault[];
  signoffDefaults: ProjectTemplateSignoffDefault[];
  canEdit: boolean;
  requiredChecklistCount: number;
  criticalTaskCount: number;
  evidencePageParam?: string;
  signoffPageParam?: string;
}) {
  const evidencePagination = getPaginationState(evidenceDefaults.length, evidencePageParam);
  const visibleEvidenceDefaults = evidenceDefaults.slice(
    evidencePagination.startIndex,
    evidencePagination.endIndex
  );
  const signoffPagination = getPaginationState(signoffDefaults.length, signoffPageParam);
  const visibleSignoffDefaults = signoffDefaults.slice(
    signoffPagination.startIndex,
    signoffPagination.endIndex
  );
  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-950">
        Evidence and signoff defaults are copied to future expansion projects as
        readiness requirements. They do not upload files here, approve source
        records, post journals, create purchase orders, or change inventory.
      </div>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-950">Evidence Requirements</h3>
            <p className="text-sm text-slate-500">
              {evidenceDefaults.length} defaults / {requiredChecklistCount} required checklist checks.
            </p>
          </div>
          {canEdit ? (
            <EntryModal
              title="Add Evidence Requirement"
              triggerLabel="Add Evidence"
              triggerClassName="gap-2"
            >
              <EvidenceDefaultForm id={id} version={version} tasks={tasks} />
            </EntryModal>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3">Type / Task</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Required</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidenceDefaults.length > 0 ? (
                visibleEvidenceDefaults.map((evidence) => (
                  <tr key={evidence.code}>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {evidence.code}
                      </p>
                      <p className="font-bold text-slate-950">{evidence.label}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{humanize(evidence.evidenceType)}</p>
                      <p className="text-xs text-slate-500">
                        {evidence.taskCode ?? "No linked task"}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {humanize(evidence.owner.value)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={evidence.required ? "warning" : "neutral"}>
                        {evidence.required ? "Required" : "Optional"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <EntryModal
                            title={`Edit ${evidence.code}`}
                            triggerLabel="Edit"
                            triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          >
                            <EvidenceDefaultForm
                              evidence={evidence}
                              id={id}
                              version={version}
                              tasks={tasks}
                            />
                          </EntryModal>
                          <form action={removeEvidenceAction}>
                            <input name="id" type="hidden" value={id} />
                            <input name="expectedVersion" type="hidden" value={version} />
                            <input name="code" type="hidden" value={evidence.code} />
                            <ConfirmSubmitButton label="Remove" confirmation={`Remove evidence requirement ${evidence.code} from this draft playbook?`} />
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-6 text-sm text-slate-500" colSpan={5}>
                    No evidence requirements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden">
          {evidenceDefaults.length > 0 ? (
            visibleEvidenceDefaults.map((evidence) => (
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={evidence.code}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">{evidence.code}</p>
                    <h4 className="font-bold text-slate-950">{evidence.label}</h4>
                  </div>
                  <Badge tone={evidence.required ? "warning" : "neutral"}>
                    {evidence.required ? "Required" : "Optional"}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-bold uppercase text-slate-400">Type</dt><dd className="text-slate-700">{humanize(evidence.evidenceType)}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-slate-400">Owner</dt><dd className="font-semibold text-slate-700">{humanize(evidence.owner.value)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-slate-400">Task</dt><dd className="text-slate-700">{evidence.taskCode ?? "No linked task"}</dd></div>
                </dl>
                {canEdit ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <EntryModal title={`Edit ${evidence.code}`} triggerLabel="Edit" triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100">
                      <EvidenceDefaultForm evidence={evidence} id={id} version={version} tasks={tasks} />
                    </EntryModal>
                    <form action={removeEvidenceAction}>
                      <input name="id" type="hidden" value={id} />
                      <input name="expectedVersion" type="hidden" value={version} />
                      <input name="code" type="hidden" value={evidence.code} />
                      <ConfirmSubmitButton label="Remove" confirmation={`Remove evidence requirement ${evidence.code} from this draft playbook?`} />
                    </form>
                  </div>
                ) : <p className="mt-4 text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</p>}
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No evidence requirements yet.</p>
          )}
        </div>
        <FinancePagination basePath={`/expansion/playbooks/${id}`} tab="signoffs" {...evidencePagination} pageParam="evidencePage" totalCount={evidenceDefaults.length} />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-950">Signoff Requirements</h3>
            <p className="text-sm text-slate-500">
              {signoffDefaults.length} defaults / {criticalTaskCount} critical task(s).
            </p>
          </div>
          {canEdit ? (
            <EntryModal
              title="Add Signoff Requirement"
              triggerLabel="Add Signoff"
              triggerClassName="gap-2"
            >
              <SignoffDefaultForm id={id} version={version} />
            </EntryModal>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Signoff</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Required</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {signoffDefaults.length > 0 ? (
                visibleSignoffDefaults.map((signoff) => (
                  <tr key={signoff.code}>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {signoff.code}
                      </p>
                      <p className="font-bold text-slate-950">{signoff.label}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {humanize(signoff.stage)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {humanize(signoff.owner.value)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={signoff.required ? "warning" : "neutral"}>
                        {signoff.required ? "Required" : "Optional"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <EntryModal
                            title={`Edit ${signoff.code}`}
                            triggerLabel="Edit"
                            triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
                          >
                            <SignoffDefaultForm id={id} version={version} signoff={signoff} />
                          </EntryModal>
                          <form action={removeSignoffAction}>
                            <input name="id" type="hidden" value={id} />
                            <input name="expectedVersion" type="hidden" value={version} />
                            <input name="code" type="hidden" value={signoff.code} />
                          <ConfirmSubmitButton label="Remove" confirmation={`Remove signoff requirement ${signoff.code} from this draft playbook?`} />
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-6 text-sm text-slate-500" colSpan={5}>
                    No signoff requirements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden">
          {signoffDefaults.length > 0 ? (
            visibleSignoffDefaults.map((signoff) => (
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={signoff.code}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">{signoff.code}</p>
                    <h4 className="font-bold text-slate-950">{signoff.label}</h4>
                  </div>
                  <Badge tone={signoff.required ? "warning" : "neutral"}>
                    {signoff.required ? "Required" : "Optional"}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-bold uppercase text-slate-400">Stage</dt><dd className="text-slate-700">{humanize(signoff.stage)}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-slate-400">Owner</dt><dd className="font-semibold text-slate-700">{humanize(signoff.owner.value)}</dd></div>
                </dl>
                {canEdit ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <EntryModal title={`Edit ${signoff.code}`} triggerLabel="Edit" triggerClassName="border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100">
                      <SignoffDefaultForm id={id} version={version} signoff={signoff} />
                    </EntryModal>
                    <form action={removeSignoffAction}>
                      <input name="id" type="hidden" value={id} />
                      <input name="expectedVersion" type="hidden" value={version} />
                      <input name="code" type="hidden" value={signoff.code} />
                      <ConfirmSubmitButton label="Remove" confirmation={`Remove signoff requirement ${signoff.code} from this draft playbook?`} />
                    </form>
                  </div>
                ) : <p className="mt-4 text-xs font-semibold text-slate-500">Read-only: create a draft revision to edit</p>}
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No signoff requirements yet.</p>
          )}
        </div>
        <FinancePagination basePath={`/expansion/playbooks/${id}`} tab="signoffs" {...signoffPagination} pageParam="signoffPage" totalCount={signoffDefaults.length} />
      </section>
    </div>
  );
}

export default async function OpeningPlaybookDetailPage({
  params,
  searchParams
}: OpeningPlaybookDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const canView =
    canUseProjects(session.permissionCodes) ||
    canConfigureProjectTemplates(session.permissionCodes);
  if (!canView) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = firstSearchValue(resolvedSearchParams.tab, "overview");
  const tab = tabs.some((item) => item.key === requestedTab)
    ? requestedTab
    : "overview";
  const pageParam = firstSearchValue(resolvedSearchParams.page, "1");
  const evidencePageParam = firstSearchValue(resolvedSearchParams.evidencePage, "1");
  const signoffPageParam = firstSearchValue(resolvedSearchParams.signoffPage, "1");
  const actionFeedback = getActionFeedback(resolvedSearchParams);
  let playbook;
  try {
    playbook = await getExpansionOpeningPlaybook(session, id);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_TEMPLATE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const requiredChecklistCount = playbook.config.tasks.reduce(
    (total, task) => total + task.checklistItems.filter((item) => item.required).length,
    0
  );
  const criticalTaskCount = playbook.config.tasks.filter(
    (task) => task.priority === "CRITICAL"
  ).length;

  return (
    <AppShell
      session={session}
      title={playbook.name}
      subtitle={`${playbook.code} / ${playbook.projectType}`}
      activeNav="opening-playbooks"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <ExpansionWorkspaceNav />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          href="/expansion/playbooks"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Playbooks
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(playbook.status)}>
            {humanize(playbook.status)}
          </Badge>
          <Badge tone={playbook.isRestrictedDefault ? "warning" : "info"}>
            {playbook.isRestrictedDefault ? "Restricted default" : "Standard access"}
          </Badge>
          {playbook.canEdit ? (
            <Badge tone="success">Editable draft</Badge>
          ) : (
            <Badge tone="neutral">Read-only version</Badge>
          )}
        </div>
      </div>

      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>This playbook seeds future Expansion projects only.</strong>{" "}
              It creates copied project tasks, milestones, and checklist lines when
              selected on Site Pipeline project creation.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              It does not mutate active projects, approve capex, create POs, release
              payments, create branches, post inventory, or change source records.
            </p>
          </div>
          <Badge tone="info">Template builder</Badge>
        </div>
      </div>

      {!playbook.canEdit ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {!playbook.canConfigure
            ? "View only. Template configuration permission is required to make changes."
            : "This version is read-only to preserve the opening controls already used by projects. Create a draft revision to change future openings; active projects are not changed."}
        </div>
      ) : null}

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Playbook Builder</h2>
            <p className="text-sm text-slate-500">
              {playbook.taskCount} tasks / {playbook.milestoneCount} milestones /{" "}
              {requiredChecklistCount} required checklist lines
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {playbook.canEdit ? (
              <EntryModal
                title="Publish Playbook"
                triggerLabel="Publish Playbook"
                triggerClassName="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <form action={publishPlaybookAction} className="grid gap-4 pt-5">
                  <input name="id" type="hidden" value={playbook.id} />
                  <input name="expectedVersion" type="hidden" value={playbook.version} />
                  <p className="text-sm text-slate-600">
                    Publishing locks this version for traceability. New site projects
                    can use it; future changes require a draft revision.
                  </p>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Publishing reason
                    <textarea
                      className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      name="reason"
                      placeholder="Opening controls reviewed for use on future site projects"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">
                    Publish This Version
                  </button>
                </form>
              </EntryModal>
            ) : playbook.canConfigure ? (
              <EntryModal
                title="Create Draft Revision"
                triggerLabel="Create Draft Revision"
                triggerClassName="border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                <form action={createDraftRevisionAction} className="grid gap-4 pt-5">
                  <input name="sourceTemplateId" type="hidden" value={playbook.id} />
                  <p className="text-sm text-slate-600">
                    This copies the current tasks, milestones, checklists, evidence,
                    signoffs, and reminders into a new editable draft. Existing
                    projects stay attached to the version they originally used.
                  </p>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    New playbook code
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="code"
                      defaultValue={`${playbook.code}-R${playbook.revisionNumber + 1}`.slice(0, 40)}
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Draft name
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                      name="name"
                      defaultValue={`${playbook.name} Revision ${playbook.revisionNumber + 1}`.slice(0, 160)}
                    />
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
                    Create Editable Draft
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {playbook.canConfigure && playbook.status !== "ARCHIVED" ? (
              <EntryModal
                title="Archive Playbook"
                triggerLabel="Archive"
                triggerClassName="border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
              >
                <form action={archivePlaybookAction} className="grid gap-4 pt-5">
                  <input name="id" type="hidden" value={playbook.id} />
                  <input name="expectedVersion" type="hidden" value={playbook.version} />
                  <p className="text-sm text-slate-600">
                    Archived playbooks cannot be selected for new site projects. Existing
                    projects and their copied controls are unchanged.
                  </p>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Archive reason
                    <textarea
                      className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      name="reason"
                      placeholder="Replaced by the current opening playbook revision"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-300 bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
                    Archive This Version
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {tab === "overview" && playbook.canEdit ? (
              <EntryModal
                title="Edit Playbook Overview"
                triggerLabel="Edit Overview"
                triggerClassName="border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <form action={updateOverviewAction} className="grid gap-5 pt-5">
                  <input name="id" type="hidden" value={playbook.id} />
                  <input name="expectedVersion" type="hidden" value={playbook.version} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Playbook name
                      <input
                        className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                        name="name"
                        defaultValue={playbook.name}
                        required
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      Expansion type
                      <select
                        className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                        name="projectType"
                        defaultValue={playbook.projectType}
                        required
                      >
                        {expansionProjectTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    <input
                      className="mt-1"
                      name="isRestrictedDefault"
                      type="checkbox"
                      defaultChecked={playbook.isRestrictedDefault}
                    />
                    <span>
                      Restricted by default
                      <span className="block text-xs font-normal leading-5 text-slate-500">
                        Projects created from this playbook start restricted unless the
                        creator changes access.
                      </span>
                    </span>
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
                    Save Overview
                  </button>
                </form>
              </EntryModal>
            ) : null}
            {tab === "tasks" && playbook.canEdit ? (
              <ExpansionEntrySheet
                title="Add Playbook Task"
                triggerLabel="Add Task"
                submitLabel="Save task"
                triggerClassName="gap-2"
              >
                <TaskForm id={playbook.id} version={playbook.version} showSubmit={false} />
              </ExpansionEntrySheet>
            ) : null}
            {tab === "milestones" && playbook.canEdit ? (
              <ExpansionEntrySheet
                title="Add Milestone"
                triggerLabel="Add Milestone"
                submitLabel="Save milestone"
                triggerClassName="gap-2"
              >
                <MilestoneForm id={playbook.id} version={playbook.version} showSubmit={false} />
              </ExpansionEntrySheet>
            ) : null}
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 pt-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Link
                className={
                  item.key === tab
                    ? "inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white"
                    : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                }
                href={tabHref(playbook.id, item.key)}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="p-5">
          {tab === "overview" ? <OverviewTab config={playbook.config} /> : null}
          {tab === "tasks" ? (
            <TasksTab id={playbook.id} version={playbook.version} tasks={playbook.config.tasks} canEdit={playbook.canEdit} pageParam={pageParam} />
          ) : null}
          {tab === "milestones" ? (
            <MilestonesTab
              id={playbook.id}
              version={playbook.version}
              milestones={playbook.config.milestones}
              canEdit={playbook.canEdit}
              pageParam={pageParam}
            />
          ) : null}
          {tab === "checklists" ? (
            <ChecklistsTab
              canEdit={playbook.canEdit}
              id={playbook.id}
              version={playbook.version}
              tasks={playbook.config.tasks}
              pageParam={pageParam}
            />
          ) : null}
          {tab === "signoffs" ? (
            <EvidenceSignoffsTab
              canEdit={playbook.canEdit}
              criticalTaskCount={criticalTaskCount}
              evidenceDefaults={playbook.config.evidenceDefaults}
              id={playbook.id}
              version={playbook.version}
              requiredChecklistCount={requiredChecklistCount}
              signoffDefaults={playbook.config.signoffDefaults}
              tasks={playbook.config.tasks}
              evidencePageParam={evidencePageParam}
              signoffPageParam={signoffPageParam}
            />
          ) : null}
          {tab === "reminders" ? (
            <form action={updateRemindersAction} className="max-w-3xl rounded-xl border border-slate-200 bg-white p-4">
              <input name="id" type="hidden" value={playbook.id} />
              <input name="expectedVersion" type="hidden" value={playbook.version} />
              <div className="flex items-center gap-2">
                <Settings2 aria-hidden="true" className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-950">Reminder Defaults</h3>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Due soon window
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="dueSoonWindowDays"
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={playbook.config.notificationDefaults.dueSoonWindowDays}
                    disabled={!playbook.canEdit}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Overdue frequency
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="overdueReminderFrequencyDays"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={
                      playbook.config.notificationDefaults.overdueReminderFrequencyDays
                    }
                    disabled={!playbook.canEdit}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  Max overdue reminders
                  <input
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                    name="maxOverdueRemindersPerTask"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={
                      playbook.config.notificationDefaults.maxOverdueRemindersPerTask
                    }
                    disabled={!playbook.canEdit}
                  />
                </label>
              </div>
              {playbook.canEdit ? (
                <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
                  Save Reminder Defaults
                </button>
              ) : null}
            </form>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
