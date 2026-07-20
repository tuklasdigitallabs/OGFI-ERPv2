import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  FileWarning,
  ShieldCheck,
  UploadCloud,
  UsersRound
} from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  canUseWorkforce,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  archiveControlledEvidenceAttachment,
  createControlledEvidenceAttachmentMetadataLink,
  createControlledEvidenceAttachmentUploadLink,
  listControlledEvidenceAttachments,
  type ControlledEvidenceAttachmentRow,
  type EvidenceAttachmentSourceType
} from "@/server/services/attachments";
import { getSessionContext } from "@/server/services/context";
import { canExportWorkforce } from "@/server/services/exportAuthorization";
import {
  approveLeaveRequest,
  approveOvertimeRecord,
  approveWorkforceSchedule,
  cancelLeaveRequest,
  cancelOvertimeRecord,
  cancelWorkforceSchedule,
  createEmployeeAssignment,
  createEmployee,
  createDraftLeaveRequest,
  createDraftOvertimeRecord,
  createDraftWorkforceSchedule,
  endEmployeeAssignment,
  getWorkforceDashboard,
  publishWorkforceSchedule,
  rejectLeaveRequest,
  rejectOvertimeRecord,
  rejectWorkforceSchedule,
  returnLeaveRequestForRevision,
  reviewAttendanceImportBatch,
  submitLeaveRequest,
  submitOvertimeRecord,
  submitWorkforceSchedule,
  updateEmployee,
  voidAttendanceImportBatch
} from "@/server/services/workforce";

export const dynamic = "force-dynamic";

const metricIcons = {
  "active-employees": UsersRound,
  "active-assignments": ShieldCheck,
  "pending-requests": CalendarClock,
  "readiness-issues": AlertTriangle,
  "schedule-gaps": ClipboardList,
  "attendance-exceptions": UploadCloud
};

function minutesToHours(minutes: number) {
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`;
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "");
  return raw ? Number(raw) : Number.NaN;
}

function issueStateTone(issueState: string) {
  return issueState === "NEEDS_REVIEW" ? ("warning" as const) : ("success" as const);
}

function workforceReadinessTone(severity: string) {
  if (severity === "HIGH") {
    return "destructive" as const;
  }
  if (severity === "MEDIUM") {
    return "warning" as const;
  }
  return "info" as const;
}

const workforceRequestActionLabels = {
  submit: "Submit",
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  cancel: "Cancel"
} as const;

const workforceScheduleActionLabels = {
  submit: "Submit",
  approve: "Approve",
  reject: "Reject",
  publish: "Publish",
  cancel: "Cancel"
} as const;

const employmentTypeOptions = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["TEMPORARY", "Temporary"],
  ["INTERN", "Intern"]
] as const;

const employeeStatusOptions = [
  ["ACTIVE", "Active"],
  ["INACTIVE", "Inactive"],
  ["SUSPENDED", "Suspended"],
  ["TERMINATED", "Terminated"],
  ["LEAVE_OF_ABSENCE", "Leave of absence"]
] as const;

const assignmentTypeOptions = [
  ["PRIMARY", "Primary"],
  ["SECONDMENT", "Secondment"],
  ["PROJECT_COVERAGE", "Project coverage"],
  ["TEMPORARY", "Temporary"]
] as const;

function workforceRequestActions(status: string) {
  const actions: Array<keyof typeof workforceRequestActionLabels> = [];
  if (["DRAFT", "RETURNED_FOR_REVISION"].includes(status)) {
    actions.push("submit");
  }
  if (["SUBMITTED", "UNDER_REVIEW"].includes(status)) {
    actions.push("approve", "return", "reject");
  }
  if (
    ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RETURNED_FOR_REVISION", "APPROVED"].includes(
      status
    )
  ) {
    actions.push("cancel");
  }
  return actions;
}

function workforceOvertimeActions(status: string) {
  const actions: Array<keyof typeof workforceRequestActionLabels> = [];
  if (status === "DRAFT") {
    actions.push("submit");
  }
  if (["SUBMITTED", "UNDER_REVIEW"].includes(status)) {
    actions.push("approve", "reject");
  }
  if (["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(status)) {
    actions.push("cancel");
  }
  return actions;
}

function workforceScheduleActions(status: string) {
  const actions: Array<keyof typeof workforceScheduleActionLabels> = [];
  if (["DRAFT", "RETURNED_FOR_REVISION"].includes(status)) {
    actions.push("submit");
  }
  if (["SUBMITTED", "UNDER_REVIEW"].includes(status)) {
    actions.push("approve", "reject");
  }
  if (status === "APPROVED") {
    actions.push("publish");
  }
  if (["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PUBLISHED"].includes(status)) {
    actions.push("cancel");
  }
  return actions;
}

function EvidenceMetadataPanel({
  action,
  archiveAction,
  attachments,
  canAdd,
  objectKeyPlaceholder,
  recordId,
  sourceType,
  triggerLabel
}: {
  action: (formData: FormData) => Promise<void>;
  archiveAction?: (formData: FormData) => Promise<void>;
  attachments: ControlledEvidenceAttachmentRow[];
  canAdd: boolean;
  objectKeyPlaceholder: string;
  recordId: string;
  sourceType: Extract<
    EvidenceAttachmentSourceType,
    | "WORKFORCE_EMPLOYEE"
    | "WORKFORCE_ASSIGNMENT"
    | "WORKFORCE_LEAVE"
    | "WORKFORCE_OVERTIME"
    | "WORKFORCE_SCHEDULE"
    | "WORKFORCE_ATTENDANCE_IMPORT"
  >;
  triggerLabel: string;
}) {
  return (
    <div className="mt-3 space-y-3">
      {attachments.length > 0 ? (
        <div className="grid gap-2">
          {attachments.slice(0, 3).map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p className="text-xs font-bold text-slate-950">
                {attachment.originalFilename}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {attachment.mimeType} /{" "}
                {(attachment.sizeBytes / 1024).toLocaleString("en-PH", {
                  maximumFractionDigits: 1
                })}{" "}
                KB
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                {attachment.caption ? (
                  <p className="text-[11px] text-slate-600">
                    {attachment.caption}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {attachment.storageProvider === "local-private" ? (
                    <a
                      className="inline-flex min-h-8 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                      href={`/evidence/${attachment.id}/download`}
                    >
                      Download
                    </a>
                  ) : null}
                  {archiveAction && canAdd ? (
                    <EntryModal
                      title="Archive Evidence Link"
                      triggerLabel="Archive"
                      triggerClassName="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <form action={archiveAction} className="grid gap-4">
                        <input
                          name="controlledEvidenceAttachmentId"
                          type="hidden"
                          value={attachment.id}
                        />
                        <input name="sourceType" type="hidden" value={sourceType} />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          This archives the evidence link only. The private file
                          metadata remains preserved for audit and recovery; no
                          employee, assignment, request, schedule, attendance,
                          payroll, payment, or journal record is changed.
                        </div>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Archive reason
                          <textarea
                            className="min-h-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                            name="archiveReason"
                            placeholder="Duplicate link, wrong employee/request, superseded document, etc."
                            required
                          />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          Archive Evidence Link
                        </button>
                      </form>
                    </EntryModal>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {attachments.length > 3 ? (
            <p className="text-xs font-semibold text-slate-500">
              +{attachments.length - 3} more evidence link
              {attachments.length - 3 === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}
      {canAdd ? (
        <EntryModal
          title="Upload Workforce Evidence"
          triggerLabel={triggerLabel}
          triggerClassName="border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
        >
          <form action={action} encType="multipart/form-data" className="grid gap-4">
            <input name="sourceRecordId" type="hidden" value={recordId} />
            <input name="sourceType" type="hidden" value={sourceType} />
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              Upload workforce evidence. Files stay private, workforce source
              records are not mutated, and downloads are audited.
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Evidence file
              <input
                accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.txt,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                name="evidenceFile"
                type="file"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Required for action
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="requiredForAction"
                  placeholder="Approval, correction, review, publication"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Caption
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="caption"
                  placeholder="What this evidence proves"
                />
              </label>
            </div>
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-bold text-slate-900">
                Link metadata-only evidence instead
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="originalFilename"
                  placeholder="workforce-evidence.pdf"
                />
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="mimeType"
                >
                  <option value="">Select MIME type</option>
                  <option value="application/pdf">PDF</option>
                  <option value="image/jpeg">JPEG image</option>
                  <option value="image/png">PNG image</option>
                  <option value="image/webp">WebP image</option>
                  <option value="text/csv">CSV</option>
                  <option value="text/plain">Text</option>
                  <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                    Excel workbook
                  </option>
                  <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                    Word document
                  </option>
                </select>
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  min="1"
                  name="sizeBytes"
                  placeholder="Size in bytes"
                  step="1"
                  type="number"
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="storageProvider"
                  placeholder="manual-private-reference"
                />
              </div>
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                name="objectKey"
                placeholder={objectKeyPlaceholder}
              />
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                name="checksum"
                placeholder="Optional checksum"
              />
            </details>
            <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Upload Evidence
            </button>
          </form>
        </EntryModal>
      ) : null}
    </div>
  );
}

async function runWorkforceRequestAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const requestKind = String(formData.get("requestKind") ?? "");
  const recordId = String(formData.get("recordId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    idempotencyKey: `workforce-request-ui:${requestKind}:${recordId}:${action}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  if (requestKind === "leave") {
    const input = { ...baseInput, leaveRequestId: recordId };
    switch (action) {
      case "submit":
        await submitLeaveRequest(session, input);
        break;
      case "approve":
        await approveLeaveRequest(session, input);
        break;
      case "return":
        await returnLeaveRequestForRevision(session, input);
        break;
      case "reject":
        await rejectLeaveRequest(session, input);
        break;
      case "cancel":
        await cancelLeaveRequest(session, input);
        break;
      default:
        throw new Error("WORKFORCE_LEAVE_ACTION_NOT_SUPPORTED");
    }
  } else if (requestKind === "overtime") {
    const input = { ...baseInput, overtimeRecordId: recordId };
    switch (action) {
      case "submit":
        await submitOvertimeRecord(session, input);
        break;
      case "approve":
        await approveOvertimeRecord(session, input);
        break;
      case "reject":
        await rejectOvertimeRecord(session, input);
        break;
      case "cancel":
        await cancelOvertimeRecord(session, input);
        break;
      default:
        throw new Error("WORKFORCE_OVERTIME_ACTION_NOT_SUPPORTED");
    }
  } else {
    throw new Error("WORKFORCE_REQUEST_KIND_NOT_SUPPORTED");
  }

  revalidatePath("/workforce");
}

async function runWorkforceScheduleAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    scheduleId,
    idempotencyKey: `workforce-schedule-ui:${scheduleId}:${action}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitWorkforceSchedule(session, baseInput);
      break;
    case "approve":
      await approveWorkforceSchedule(session, baseInput);
      break;
    case "reject":
      await rejectWorkforceSchedule(session, baseInput);
      break;
    case "publish":
      await publishWorkforceSchedule(session, baseInput);
      break;
    case "cancel":
      await cancelWorkforceSchedule(session, baseInput);
      break;
    default:
      throw new Error("WORKFORCE_SCHEDULE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/workforce");
}

async function runAttendanceImportAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const batchId = String(formData.get("batchId") ?? "");
  const action = String(formData.get("action") ?? "");
  const verdict = String(formData.get("verdict") ?? "ACCEPT") as
    | "ACCEPT"
    | "REJECT"
    | "EXCEPTION_LIST";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    batchId,
    idempotencyKey: `attendance-import-ui:${batchId}:${action}:${verdict}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  if (action === "review") {
    await reviewAttendanceImportBatch(session, {
      ...baseInput,
      verdict
    });
  } else if (action === "void") {
    await voidAttendanceImportBatch(session, baseInput);
  } else {
    throw new Error("WORKFORCE_ATTENDANCE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/workforce");
}

async function runCreateDraftLeaveRequest(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const employeeId = String(formData.get("employeeId") ?? "");
  const leaveType = String(formData.get("leaveType") ?? "VACATION") as
    | "VACATION"
    | "SICK"
    | "PERSONAL"
    | "EMERGENCY"
    | "MATERNITY"
    | "PATERNITY"
    | "OTHER";
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createDraftLeaveRequest(session, {
    employeeId,
    leaveType,
    startDate,
    endDate,
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-leave-ui:${employeeId}:${leaveType}:${startDate}:${endDate}:${reason}`
  });
  revalidatePath("/workforce");
}

async function runCreateDraftOvertimeRecord(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const employeeId = String(formData.get("employeeId") ?? "");
  const overtimeType = String(formData.get("overtimeType") ?? "REGULAR") as
    | "REGULAR"
    | "WEEKEND"
    | "HOLIDAY"
    | "NIGHT_SHIFT"
    | "EMERGENCY";
  const workedStartAt = String(formData.get("workedStartAt") ?? "");
  const workedEndAt = String(formData.get("workedEndAt") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createDraftOvertimeRecord(session, {
    employeeId,
    overtimeType,
    workedStartAt,
    workedEndAt,
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-overtime-ui:${employeeId}:${overtimeType}:${workedStartAt}:${workedEndAt}:${reason}`
  });
  revalidatePath("/workforce");
}

async function runCreateDraftWorkforceSchedule(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const scheduleDate = String(formData.get("scheduleDate") ?? "");
  const shiftType = String(formData.get("shiftType") ?? "OPENING") as
    | "OPENING"
    | "MID"
    | "CLOSING"
    | "SPLIT"
    | "OVERNIGHT"
    | "SPECIAL_EVENT";
  const stationCode = String(formData.get("stationCode") ?? "").trim();
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const plannedHeadcount = Number(formData.get("plannedHeadcount") ?? 1);
  const assignedEmployeeId =
    String(formData.get("assignedEmployeeId") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createDraftWorkforceSchedule(session, {
    scheduleDate,
    shiftType,
    stationCode,
    roleLabel,
    plannedStartAt: `${scheduleDate}T${startTime}:00`,
    plannedEndAt: `${scheduleDate}T${endTime}:00`,
    plannedHeadcount,
    ...(assignedEmployeeId ? { assignedEmployeeId } : {}),
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-schedule-draft-ui:${session.context.locationId}:${scheduleDate}:${shiftType}:${stationCode}:${roleLabel}:${startTime}:${endTime}:${plannedHeadcount}:${assignedEmployeeId ?? "gap"}:${reason}`
  });
  revalidatePath("/workforce");
}

async function runCreateEmployee(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const employeeCode = String(formData.get("employeeCode") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim();
  const preferredName =
    String(formData.get("preferredName") ?? "").trim() || undefined;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || undefined;
  const emailPersonal =
    String(formData.get("emailPersonal") ?? "").trim() || undefined;
  const phoneNumber =
    String(formData.get("phoneNumber") ?? "").trim() || undefined;
  const employmentType = String(formData.get("employmentType") ?? "FULL_TIME") as
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "TEMPORARY"
    | "INTERN";
  const hireDate = String(formData.get("hireDate") ?? "");
  const homeLocationId = String(formData.get("homeLocationId") ?? "");
  const initialRoleLabel =
    String(formData.get("initialRoleLabel") ?? "").trim() || undefined;
  const assignmentEffectiveFrom =
    String(formData.get("assignmentEffectiveFrom") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createEmployee(session, {
    employeeCode,
    legalName,
    ...(preferredName ? { preferredName } : {}),
    ...(jobTitle ? { jobTitle } : {}),
    ...(emailPersonal ? { emailPersonal } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    employmentType,
    hireDate,
    homeLocationId,
    ...(initialRoleLabel ? { initialRoleLabel } : {}),
    ...(assignmentEffectiveFrom ? { assignmentEffectiveFrom } : {}),
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-employee-create-ui:${employeeCode}:${homeLocationId}:${hireDate}:${reason}`
  });
  revalidatePath("/workforce");
}

async function runUpdateEmployee(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const employeeId = String(formData.get("employeeId") ?? "");
  const legalName = String(formData.get("legalName") ?? "").trim();
  const preferredName =
    String(formData.get("preferredName") ?? "").trim() || undefined;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || undefined;
  const emailPersonal =
    String(formData.get("emailPersonal") ?? "").trim() || undefined;
  const phoneNumber =
    String(formData.get("phoneNumber") ?? "").trim() || undefined;
  const employmentType = String(formData.get("employmentType") ?? "FULL_TIME") as
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "TEMPORARY"
    | "INTERN";
  const status = String(formData.get("status") ?? "ACTIVE") as
    | "ACTIVE"
    | "INACTIVE"
    | "SUSPENDED"
    | "TERMINATED"
    | "LEAVE_OF_ABSENCE";
  const homeLocationId = String(formData.get("homeLocationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await updateEmployee(session, {
    employeeId,
    legalName,
    ...(preferredName ? { preferredName } : {}),
    ...(jobTitle ? { jobTitle } : {}),
    ...(emailPersonal ? { emailPersonal } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
    employmentType,
    status,
    homeLocationId,
    reason,
    ...(evidenceReference ? { evidenceReference } : {})
  });
  revalidatePath("/workforce");
}

async function runCreateEmployeeAssignment(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const employeeId = String(formData.get("employeeId") ?? "");
  const locationId = String(formData.get("locationId") ?? "");
  const assignmentType = String(formData.get("assignmentType") ?? "TEMPORARY") as
    | "PRIMARY"
    | "SECONDMENT"
    | "PROJECT_COVERAGE"
    | "TEMPORARY";
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "");
  const isPrimary = String(formData.get("isPrimary") ?? "") === "on";
  const replacesAssignmentId =
    String(formData.get("replacesAssignmentId") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createEmployeeAssignment(session, {
    employeeId,
    locationId,
    assignmentType,
    roleLabel,
    effectiveFrom,
    isPrimary,
    ...(replacesAssignmentId ? { replacesAssignmentId } : {}),
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-assignment-create-ui:${employeeId}:${locationId}:${assignmentType}:${roleLabel}:${effectiveFrom}:${isPrimary}:${replacesAssignmentId ?? "none"}:${reason}`
  });
  revalidatePath("/workforce");
}

async function runEndEmployeeAssignment(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const effectiveTo = String(formData.get("effectiveTo") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await endEmployeeAssignment(session, {
    assignmentId,
    effectiveTo,
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `workforce-assignment-end-ui:${assignmentId}:${effectiveTo}:${reason}`
  });
  revalidatePath("/workforce");
}

async function addWorkforceEvidenceMetadata(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const requiredPermissionCode = (() => {
    if (session.permissionCodes.includes(permissions.coreAdminister)) {
      return permissions.coreAdminister;
    }
    if (
      sourceType === "WORKFORCE_EMPLOYEE" ||
      sourceType === "WORKFORCE_ASSIGNMENT"
    ) {
      return permissions.workforceManage;
    }
    if (sourceType === "WORKFORCE_LEAVE") {
      return session.permissionCodes.includes(permissions.workforceManage)
        ? permissions.workforceManage
        : permissions.workforceLeaveApprove;
    }
    if (sourceType === "WORKFORCE_OVERTIME") {
      return session.permissionCodes.includes(permissions.workforceManage)
        ? permissions.workforceManage
        : permissions.workforceOvertimeApprove;
    }
    if (sourceType === "WORKFORCE_SCHEDULE") {
      return permissions.workforceScheduleManage;
    }
    if (sourceType === "WORKFORCE_ATTENDANCE_IMPORT") {
      return permissions.workforceAttendanceImportManage;
    }
    throw new Error("WORKFORCE_EVIDENCE_SOURCE_INVALID");
  })();

  const common = {
    sourceType: sourceType as Extract<
      EvidenceAttachmentSourceType,
      | "WORKFORCE_EMPLOYEE"
      | "WORKFORCE_ASSIGNMENT"
      | "WORKFORCE_LEAVE"
      | "WORKFORCE_OVERTIME"
      | "WORKFORCE_SCHEDULE"
      | "WORKFORCE_ATTENDANCE_IMPORT"
    >,
    sourceRecordId: String(formData.get("sourceRecordId") ?? ""),
    purpose: "EVIDENCE",
    caption: String(formData.get("caption") ?? "").trim() || null,
    requiredForAction:
      String(formData.get("requiredForAction") ?? "").trim() || null,
    requiredPermissionCode
  } as const;
  const evidenceFile = formData.get("evidenceFile");

  if (evidenceFile instanceof File && evidenceFile.size > 0) {
    await createControlledEvidenceAttachmentUploadLink({
      ...common,
      file: evidenceFile
    });
    revalidatePath("/workforce");
    return;
  }

  await createControlledEvidenceAttachmentMetadataLink({
    ...common,
    attachment: {
      originalFilename: String(formData.get("originalFilename") ?? ""),
      mimeType: String(formData.get("mimeType") ?? ""),
      sizeBytes: parseNumberField(formData, "sizeBytes"),
      storageProvider:
        String(formData.get("storageProvider") ?? "").trim() ||
        "manual-private-reference",
      objectKey: String(formData.get("objectKey") ?? ""),
      checksum: String(formData.get("checksum") ?? "").trim() || null
    }
  });

  revalidatePath("/workforce");
}

async function archiveWorkforceEvidenceMetadata(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const requiredPermissionCode = (() => {
    if (session.permissionCodes.includes(permissions.coreAdminister)) {
      return permissions.coreAdminister;
    }
    if (
      sourceType === "WORKFORCE_EMPLOYEE" ||
      sourceType === "WORKFORCE_ASSIGNMENT"
    ) {
      return permissions.workforceManage;
    }
    if (sourceType === "WORKFORCE_LEAVE") {
      return session.permissionCodes.includes(permissions.workforceManage)
        ? permissions.workforceManage
        : permissions.workforceLeaveApprove;
    }
    if (sourceType === "WORKFORCE_OVERTIME") {
      return session.permissionCodes.includes(permissions.workforceManage)
        ? permissions.workforceManage
        : permissions.workforceOvertimeApprove;
    }
    if (sourceType === "WORKFORCE_SCHEDULE") {
      return permissions.workforceScheduleManage;
    }
    if (sourceType === "WORKFORCE_ATTENDANCE_IMPORT") {
      return permissions.workforceAttendanceImportManage;
    }
    throw new Error("WORKFORCE_EVIDENCE_SOURCE_INVALID");
  })();

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: String(
      formData.get("controlledEvidenceAttachmentId") ?? ""
    ),
    archiveReason: String(formData.get("archiveReason") ?? "").trim(),
    requiredPermissionCode
  });

  revalidatePath("/workforce");
}

export default async function WorkforcePage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseWorkforce(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getWorkforceDashboard(session);
  const canManageWorkforce =
    session.permissionCodes.includes(permissions.coreAdminister) ||
    session.permissionCodes.includes(permissions.workforceManage);
  const canApproveLeave =
    session.permissionCodes.includes(permissions.coreAdminister) ||
    session.permissionCodes.includes(permissions.workforceLeaveApprove);
  const canApproveOvertime =
    session.permissionCodes.includes(permissions.coreAdminister) ||
    session.permissionCodes.includes(permissions.workforceOvertimeApprove);
  const canUseRequestActions =
    canManageWorkforce || canApproveLeave || canApproveOvertime;
  const canManageSchedules =
    session.permissionCodes.includes(permissions.coreAdminister) ||
    session.permissionCodes.includes(permissions.workforceScheduleManage);
  const canManageAttendance =
    session.permissionCodes.includes(permissions.coreAdminister) ||
    session.permissionCodes.includes(permissions.workforceAttendanceImportManage);
  const canExportWorkforceCsv = canExportWorkforce(session);
  const evidenceViewPermission =
    [
      permissions.workforceView,
      permissions.workforceManage,
      permissions.workforceLeaveApprove,
      permissions.workforceOvertimeApprove,
      permissions.workforceScheduleView,
      permissions.workforceScheduleManage,
      permissions.workforceAttendanceImportView,
      permissions.workforceAttendanceImportManage,
      permissions.coreAdminister
    ].find((permissionCode) =>
      session.permissionCodes.includes(permissionCode)
    ) ?? permissions.workforceView;
  const employeeEvidenceById = new Map(
    await Promise.all(
      dashboard.employees.map(async (employee) => [
        employee.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_EMPLOYEE",
          sourceRecordId: employee.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const assignmentEvidenceById = new Map(
    await Promise.all(
      dashboard.assignments.map(async (assignment) => [
        assignment.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_ASSIGNMENT",
          sourceRecordId: assignment.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const leaveEvidenceById = new Map(
    await Promise.all(
      dashboard.leaveRequests.map(async (request) => [
        request.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_LEAVE",
          sourceRecordId: request.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const overtimeEvidenceById = new Map(
    await Promise.all(
      dashboard.overtimeRecords.map(async (record) => [
        record.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_OVERTIME",
          sourceRecordId: record.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const scheduleEvidenceById = new Map(
    await Promise.all(
      dashboard.schedules.map(async (schedule) => [
        schedule.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_SCHEDULE",
          sourceRecordId: schedule.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const attendanceImportEvidenceById = new Map(
    await Promise.all(
      dashboard.attendanceImports.map(async (batch) => [
        batch.id,
        await listControlledEvidenceAttachments({
          sourceType: "WORKFORCE_ATTENDANCE_IMPORT",
          sourceRecordId: batch.id,
          requiredPermissionCode: evidenceViewPermission
        })
      ] as const)
    )
  );
  const primaryAssignmentOptions = dashboard.assignments.filter(
    (assignment) => assignment.isPrimary && ["ACTIVE", "PLANNED"].includes(assignment.status)
  );

  return (
    <AppShell
      session={session}
      title="Workforce Operations"
      subtitle="Employee registry, branch assignments, schedules, attendance evidence, leave, overtime, and readiness controls"
      activeNav="workforce"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Workforce is operational, not payroll.</strong> This
              foundation tracks who is assigned where, what requests need review,
              which schedules have coverage gaps, and which attendance imports
              need exception review.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              No wages, statutory deductions, payroll exports, journal posting, or
              attendance-device source-of-truth integration are enabled in this
              slice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExportWorkforceCsv ? (
              <ButtonLink href="/workforce/export" tone="secondary">
                Export Workforce CSV
              </ButtonLink>
            ) : null}
            <span>Phase 3 foundation</span>
          </div>
        </div>
      </div>

      <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">At a glance</h2>
            <p className="text-sm text-slate-500">
              Staffing, request, schedule, and attendance signals for the current scope.
            </p>
          </div>
          <Badge tone="info">Operational summary</Badge>
        </div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {dashboard.metrics.map((metric) => {
          const Icon =
            metricIcons[metric.id as keyof typeof metricIcons] ?? BadgeCheck;
          return (
            <div key={metric.id} className="min-w-0 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-1 truncate text-xl font-bold text-slate-950">
                    {metric.displayValue}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                {metric.detail}
              </p>
              <div className="mt-3">
                <Badge tone={metric.tone} size="sm">
                  Scoped
                </Badge>
              </div>
            </div>
          );
        })}
        </div>
      </section>

      <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Workforce Production Readiness
            </h2>
            <p className="text-sm text-slate-500">
              Action-first queue for staffing gaps, attendance exceptions, and
              required training or document renewals before workforce UAT signoff.
            </p>
          </div>
          <Badge
            tone={
              dashboard.productionReadinessRows.length > 0 ? "warning" : "success"
            }
          >
            {dashboard.productionReadinessRows.length} readiness item
            {dashboard.productionReadinessRows.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Issue</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Count</th>
                <th className="px-5 py-3">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.productionReadinessRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No workforce production readiness items
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Staffing gaps, attendance exceptions, and expired required
                      documents will appear here before production signoff.
                    </p>
                  </td>
                </tr>
              ) : (
                dashboard.productionReadinessRows.slice(0, 10).map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={workforceReadinessTone(row.severity)}
                          size="sm"
                        >
                          {row.severity}
                        </Badge>
                        {row.blockerId ? (
                          <Badge tone="warning" size="sm">
                            {row.blockerId}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 font-bold text-slate-950">
                        {row.issueLabel}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.reference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.sourceType}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.locationOrEmployee}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.issueCount}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-lg text-sm leading-6 text-slate-600">
                        {row.nextAction}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Workforce Report Preview
            </h2>
            <p className="text-sm text-slate-500">
              Export-ready scoped rows for schedule coverage gaps and attendance
              import exceptions. Payroll and attendance-device authority stay
              outside this workspace.
            </p>
          </div>
          <Badge tone="info">
            {dashboard.reportRows.length} report rows
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Record</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Issues</th>
                <th className="px-5 py-3">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.reportRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No report rows yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Schedule and attendance report rows appear once scoped
                      workforce records exist.
                    </p>
                  </td>
                </tr>
              ) : (
                dashboard.reportRows.slice(0, 10).map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.publicReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.sourceType} / {row.businessDate}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone="info" size="sm">
                        {humanize(row.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={issueStateTone(row.issueState)} size="sm">
                        {humanize(row.issueState)}
                      </Badge>
                      <p className="mt-2 text-xs text-slate-500">
                        {row.issueCount} issue{row.issueCount === 1 ? "" : "s"}
                      </p>
                      {row.issueLabels.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-amber-800">
                          {row.issueLabels.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-emerald-700">
                          No readiness issue flagged
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-md text-xs text-slate-500">
                        {row.exportSafeSummary}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canManageWorkforce || canManageSchedules ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Create Workforce Drafts
              </h2>
              <p className="text-sm text-slate-500">
                Draft leave, overtime, and schedule records for scoped operations.
                Submission, approval, publication, payroll, and finance remain
                separate controlled actions.
              </p>
            </div>
            <Badge tone="info">
              {dashboard.draftOptions.employees.length} employees available
            </Badge>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-3">
            {canManageWorkforce ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-950">
                  Create Draft Leave Request
                </p>
                <EntryModal
                  title="Create Draft Leave Request"
                  triggerLabel="Create Leave"
                  disabled={dashboard.draftOptions.employees.length === 0}
                >
              <form action={runCreateDraftLeaveRequest} className="grid gap-3 pt-5">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Employee
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    disabled={dashboard.draftOptions.employees.length === 0}
                    name="employeeId"
                    required
                  >
                    {dashboard.draftOptions.employees.map((employee) => (
                      <option key={`leave-${employee.id}`} value={employee.id}>
                        {employee.label} - {employee.detail}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Leave type
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="leaveType"
                    >
                      <option value="VACATION">Vacation</option>
                      <option value="SICK">Sick</option>
                      <option value="PERSONAL">Personal</option>
                      <option value="EMERGENCY">Emergency</option>
                      <option value="MATERNITY">Maternity</option>
                      <option value="PATERNITY">Paternity</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Start date
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="startDate"
                      required
                      type="date"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      End date
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="endDate"
                      required
                      type="date"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Reason
                  </span>
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="reason"
                    placeholder="Operational reason for the leave request"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Evidence reference
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="evidenceReference"
                    placeholder="Medical note, manager message, or HR reference"
                  />
                </label>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={dashboard.draftOptions.employees.length === 0}
                  type="submit"
                >
                Create Draft Leave Request
              </button>
            </form>
                </EntryModal>
              </div>
            </div>
            ) : null}

            {canManageWorkforce ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-950">
                  Create Draft Overtime Record
                </p>
                <EntryModal
                  title="Create Draft Overtime Record"
                  triggerLabel="Create Overtime"
                  disabled={dashboard.draftOptions.employees.length === 0}
                >
              <form action={runCreateDraftOvertimeRecord} className="grid gap-3 pt-5">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Employee
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    disabled={dashboard.draftOptions.employees.length === 0}
                    name="employeeId"
                    required
                  >
                    {dashboard.draftOptions.employees.map((employee) => (
                      <option key={`ot-${employee.id}`} value={employee.id}>
                        {employee.label} - {employee.detail}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Overtime type
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="overtimeType"
                    >
                      <option value="REGULAR">Regular</option>
                      <option value="WEEKEND">Weekend</option>
                      <option value="HOLIDAY">Holiday</option>
                      <option value="NIGHT_SHIFT">Night shift</option>
                      <option value="EMERGENCY">Emergency</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Start
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="workedStartAt"
                      required
                      type="datetime-local"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      End
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="workedEndAt"
                      required
                      type="datetime-local"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Reason
                  </span>
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="reason"
                    placeholder="Operational reason, manager instruction, or rush coverage note"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Evidence reference
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="evidenceReference"
                    placeholder="Approved roster change, manager message, or incident reference"
                  />
                </label>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={dashboard.draftOptions.employees.length === 0}
                  type="submit"
                >
                Create Draft Overtime Record
              </button>
            </form>
                </EntryModal>
              </div>
            </div>
            ) : null}

            {canManageSchedules ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-950">
                  Create Draft Schedule
                  </p>
                  <EntryModal
                    title="Create Draft Schedule"
                    triggerLabel="Create Schedule"
                  >
                <form
                  action={runCreateDraftWorkforceSchedule}
                  className="grid gap-3 pt-5"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Schedule date
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="scheduleDate"
                        required
                        type="date"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Shift
                      </span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="shiftType"
                      >
                        <option value="OPENING">Opening</option>
                        <option value="MID">Mid</option>
                        <option value="CLOSING">Closing</option>
                        <option value="SPLIT">Split</option>
                        <option value="OVERNIGHT">Overnight</option>
                        <option value="SPECIAL_EVENT">Special event</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Station
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="stationCode"
                        placeholder="Kitchen, FOH, grill, cashier"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Role
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="roleLabel"
                        placeholder="Line cook, server, shift lead"
                        required
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Start
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="startTime"
                        required
                        type="time"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        End
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="endTime"
                        required
                        type="time"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Headcount
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        min={1}
                        name="plannedHeadcount"
                        required
                        type="number"
                        defaultValue={1}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Optional assignee
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="assignedEmployeeId"
                    >
                      <option value="">Leave as open coverage gap</option>
                      {dashboard.draftOptions.employees.map((employee) => (
                        <option key={`schedule-${employee.id}`} value={employee.id}>
                          {employee.label} - {employee.detail}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Reason
                    </span>
                    <textarea
                      className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="reason"
                      placeholder="Roster requirement, event coverage, or manpower plan"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Evidence reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="evidenceReference"
                      placeholder="Manpower plan, event note, or manager instruction"
                    />
                  </label>
                  <button
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    type="submit"
                  >
                    Create Draft Schedule
                  </button>
                </form>
                  </EntryModal>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="ogfi-data-surface mb-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Employee Directory
            </h2>
            <p className="text-sm text-slate-500">
              Scoped employee list with home location and active assignment count.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageWorkforce ? (
              <EntryModal
                title="Add Employee"
                triggerLabel="Add Employee"
                disabled={dashboard.draftOptions.locations.length === 0}
              >
                <form action={runCreateEmployee} className="grid gap-4 pt-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Employee code
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="employeeCode"
                        placeholder="YL-SMN-001"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Legal name
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="legalName"
                        required
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Preferred name
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="preferredName"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Job title
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="jobTitle"
                        placeholder="Store crew, cook, shift lead"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Employment
                      </span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="employmentType"
                      >
                        {employmentTypeOptions.map(([value, label]) => (
                          <option key={`create-employee-${value}`} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Home location
                      </span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="homeLocationId"
                        required
                      >
                        {dashboard.draftOptions.locations.map((location) => (
                          <option key={`create-location-${location.id}`} value={location.id}>
                            {location.label} - {location.detail}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Hire date
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="hireDate"
                        required
                        type="date"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Initial role
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="initialRoleLabel"
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Assignment effective
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="assignmentEffectiveFrom"
                        type="date"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Email
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="emailPersonal"
                        type="email"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Phone
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="phoneNumber"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Setup reason
                    </span>
                    <textarea
                      className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="reason"
                      placeholder="Hiring, transfer setup, or employee master correction"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Evidence reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="evidenceReference"
                      placeholder="HR file, signed form, or onboarding reference"
                    />
                  </label>
                  <button
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={dashboard.draftOptions.locations.length === 0}
                    type="submit"
                  >
                    Create Employee
                  </button>
                </form>
              </EntryModal>
            ) : null}
            <Badge tone="info">{dashboard.employees.length} shown</Badge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="ogfi-table min-w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Home location</th>
                <th>Employment</th>
                <th>Status</th>
                <th>Assignments</th>
                {canManageWorkforce ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {dashboard.employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <p className="font-bold text-slate-950">
                      {employee.displayName}
                    </p>
                    <p className="text-xs text-slate-500">{employee.employeeCode}</p>
                  </td>
                  <td>{employee.jobTitle}</td>
                  <td>{employee.homeLocationName}</td>
                  <td>{humanize(employee.employmentType)}</td>
                  <td>
                    <Badge tone={employee.status === "ACTIVE" ? "success" : "warning"} size="sm">
                      {humanize(employee.status)}
                    </Badge>
                  </td>
                  <td>{employee.activeAssignmentCount}</td>
                  {canManageWorkforce ? (
                    <td className="min-w-44">
                      <EvidenceMetadataPanel
                        action={addWorkforceEvidenceMetadata}
                        archiveAction={archiveWorkforceEvidenceMetadata}
                        attachments={employeeEvidenceById.get(employee.id) ?? []}
                        canAdd={canManageWorkforce}
                        objectKeyPlaceholder="workforce/evidence/employees/hr-form.pdf"
                        recordId={employee.id}
                        sourceType="WORKFORCE_EMPLOYEE"
                        triggerLabel="Add Evidence"
                      />
                      <EntryModal title="Edit Employee" triggerLabel="Edit">
                        <form action={runUpdateEmployee} className="grid gap-4 pt-5">
                          <input name="employeeId" type="hidden" value={employee.id} />
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <p className="font-bold text-slate-950">
                              {employee.employeeCode}
                            </p>
                            <p className="text-xs text-slate-500">
                              Employee code is controlled at creation in this foundation.
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Legal name
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.legalName ?? employee.displayName}
                                name="legalName"
                                required
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Preferred name
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.preferredName ?? ""}
                                name="preferredName"
                              />
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Job title
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={
                                  employee.jobTitle === "Unassigned role"
                                    ? ""
                                    : employee.jobTitle
                                }
                                name="jobTitle"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Employment
                              </span>
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.employmentType}
                                name="employmentType"
                              >
                                {employmentTypeOptions.map(([value, label]) => (
                                  <option key={`edit-employment-${employee.id}-${value}`} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Status
                              </span>
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.status}
                                name="status"
                              >
                                {employeeStatusOptions.map(([value, label]) => (
                                  <option key={`edit-status-${employee.id}-${value}`} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Home location
                              </span>
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.homeLocationId ?? ""}
                                name="homeLocationId"
                                required
                              >
                                {dashboard.draftOptions.locations.map((location) => (
                                  <option key={`edit-location-${employee.id}-${location.id}`} value={location.id}>
                                    {location.label} - {location.detail}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Email
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.emailPersonal ?? ""}
                                name="emailPersonal"
                                type="email"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Phone
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                defaultValue={employee.phoneNumber ?? ""}
                                name="phoneNumber"
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Change reason
                            </span>
                            <textarea
                              className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="HR correction, status change, or transfer setup"
                              required
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="HR ticket, signed form, or approval memo"
                            />
                          </label>
                          <button
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                            type="submit"
                          >
                            Save Employee
                          </button>
                        </form>
                      </EntryModal>
                    </td>
                  ) : null}
                </tr>
              ))}
              {dashboard.employees.length === 0 ? (
                <tr>
                  <td colSpan={canManageWorkforce ? 7 : 6}>
                    <p className="font-semibold text-slate-950">
                      No scoped employee records yet
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Workforce records will appear after employee setup or seed data.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Assignments
              </h2>
              <p className="text-sm text-slate-500">
                Effective branch, department, and role coverage.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageWorkforce ? (
                <EntryModal
                  title="Add Assignment"
                  triggerLabel="Add Assignment"
                  disabled={
                    dashboard.draftOptions.employees.length === 0 ||
                    dashboard.draftOptions.locations.length === 0
                  }
                >
                  <form action={runCreateEmployeeAssignment} className="grid gap-4 pt-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Employee
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="employeeId"
                          required
                        >
                          {dashboard.draftOptions.employees.map((employee) => (
                            <option key={`assignment-employee-${employee.id}`} value={employee.id}>
                              {employee.label} - {employee.detail}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Location
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="locationId"
                          required
                        >
                          {dashboard.draftOptions.locations.map((location) => (
                            <option key={`assignment-location-${location.id}`} value={location.id}>
                              {location.label} - {location.detail}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Assignment type
                        </span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="assignmentType"
                        >
                          {assignmentTypeOptions.map(([value, label]) => (
                            <option key={`assignment-type-${value}`} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Role
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="roleLabel"
                          placeholder="Line cook, server, shift lead"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Effective from
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="effectiveFrom"
                          required
                          type="date"
                        />
                      </label>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        name="isPrimary"
                        type="checkbox"
                      />
                      Make this the primary assignment
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Replace current primary assignment
                      </span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="replacesAssignmentId"
                      >
                        <option value="">No existing primary assignment handoff</option>
                        {primaryAssignmentOptions.map((assignment) => (
                          <option
                            key={`replacement-assignment-${assignment.id}`}
                            value={assignment.id}
                          >
                            {assignment.employeeName} - {assignment.locationName} / {assignment.roleLabel} / from {assignment.effectiveFrom}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-slate-500">
                        Use with a new primary assignment to end the selected current primary the day before the new effective date. Full transfer approval routing remains a UAT decision.
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Reason
                      </span>
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="reason"
                        placeholder="Store transfer setup, temporary coverage, or role change"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Evidence reference
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="evidenceReference"
                        placeholder="HR approval, transfer memo, or manager instruction"
                      />
                    </label>
                    <button
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={
                        dashboard.draftOptions.employees.length === 0 ||
                        dashboard.draftOptions.locations.length === 0
                      }
                      type="submit"
                    >
                      Create Assignment
                    </button>
                  </form>
                </EntryModal>
              ) : null}
              <Badge tone="success">Location scoped</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="ogfi-table min-w-full">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Assignment</th>
                  <th>Location</th>
                  <th>Status</th>
                  {canManageWorkforce ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {dashboard.assignments.slice(0, 10).map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.employeeName}</td>
                    <td>
                      <p className="font-semibold text-slate-950">
                        {assignment.roleLabel}
                      </p>
                      <p className="text-xs text-slate-500">
                        {humanize(assignment.assignmentType)} / {assignment.departmentName} / from {assignment.effectiveFrom}
                        {assignment.effectiveTo ? ` to ${assignment.effectiveTo}` : ""}
                      </p>
                      {assignment.isPrimary ? (
                        <Badge tone="info" size="sm">
                          Primary
                        </Badge>
                      ) : null}
                    </td>
                    <td>{assignment.locationName}</td>
                    <td>
                      <Badge tone={assignment.status === "ACTIVE" ? "success" : "neutral"} size="sm">
                        {humanize(assignment.status)}
                      </Badge>
                    </td>
                    {canManageWorkforce ? (
                      <td>
                        {["ACTIVE", "PLANNED"].includes(assignment.status) ? (
                          <div className="space-y-3">
                            <EvidenceMetadataPanel
                              action={addWorkforceEvidenceMetadata}
                              archiveAction={archiveWorkforceEvidenceMetadata}
                              attachments={assignmentEvidenceById.get(assignment.id) ?? []}
                              canAdd={canManageWorkforce}
                              objectKeyPlaceholder="workforce/evidence/assignments/transfer-memo.pdf"
                              recordId={assignment.id}
                              sourceType="WORKFORCE_ASSIGNMENT"
                              triggerLabel="Add Evidence"
                            />
                            <EntryModal title="End Assignment" triggerLabel="End">
                              <form action={runEndEmployeeAssignment} className="grid gap-4 pt-5">
                                <input name="assignmentId" type="hidden" value={assignment.id} />
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                  <p className="font-bold text-slate-950">
                                    {assignment.employeeName}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {assignment.roleLabel} / {assignment.locationName}
                                  </p>
                                </div>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase text-slate-500">
                                    Effective end date
                                  </span>
                                  <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    min={assignment.effectiveFrom}
                                    name="effectiveTo"
                                    required
                                    type="date"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase text-slate-500">
                                    Reason
                                  </span>
                                  <textarea
                                    className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    name="reason"
                                    placeholder="Transfer completed, temporary coverage ended, or assignment corrected"
                                    required
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase text-slate-500">
                                    Evidence reference
                                  </span>
                                  <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    name="evidenceReference"
                                    placeholder="HR memo, transfer approval, or manager instruction"
                                  />
                                </label>
                                <button
                                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  type="submit"
                                >
                                  End Assignment
                                </button>
                              </form>
                            </EntryModal>
                          </div>
                        ) : (
                          <Badge tone="neutral">No action</Badge>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {dashboard.assignments.length === 0 ? (
                  <tr>
                    <td colSpan={canManageWorkforce ? 5 : 4}>
                      <p className="font-semibold text-slate-950">
                        No scoped assignments yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Add effective-dated assignments after employee setup.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Leave And Overtime Actions
              </h2>
              <p className="text-sm text-slate-500">
                Submit, approve, return, reject, or cancel scoped workforce
                requests without payroll posting.
              </p>
            </div>
            <Badge tone="warning">Approval governed</Badge>
          </div>
          <div className="grid gap-3 p-4">
            {[...dashboard.leaveRequests, ...dashboard.overtimeRecords]
              .slice(0, 10)
              .map((record) => {
                const isLeave = "leaveType" in record;
                const actions = isLeave
                  ? workforceRequestActions(record.status)
                      .filter((action) =>
                        ["approve", "return", "reject"].includes(action)
                          ? canApproveLeave
                          : canManageWorkforce
                      )
                  : workforceOvertimeActions(record.status);
                const scopedActions = isLeave
                  ? actions
                  : actions.filter((action) =>
                      ["approve", "reject"].includes(action)
                        ? canApproveOvertime
                        : canManageWorkforce
                    );
                return (
                  <div
                    key={`${isLeave ? "leave" : "ot"}-${record.id}`}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 2xl:grid-cols-[1fr_20rem] 2xl:items-start"
                  >
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-950">
                            {record.employeeName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {record.locationName} /{" "}
                            {humanize(isLeave ? record.leaveType : record.overtimeType)}
                          </p>
                        </div>
                        <Badge
                          tone={
                            record.status === "APPROVED" ||
                            record.status === "COMPLETED" ||
                            record.status === "TAKEN"
                              ? "success"
                              : record.status === "SUBMITTED" ||
                                  record.status === "UNDER_REVIEW"
                                ? "warning"
                                : "neutral"
                          }
                          size="sm"
                        >
                          {humanize(record.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {isLeave
                          ? `${record.startDate} to ${record.endDate}`
                          : `${new Date(record.workedStartAt).toLocaleString("en-PH")} to ${new Date(record.workedEndAt).toLocaleString("en-PH")}`}{" "}
                        / {minutesToHours(record.requestedMinutes)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{record.reason}</p>
                      <EvidenceMetadataPanel
                        action={addWorkforceEvidenceMetadata}
                        archiveAction={archiveWorkforceEvidenceMetadata}
                        attachments={
                          isLeave
                            ? leaveEvidenceById.get(record.id) ?? []
                            : overtimeEvidenceById.get(record.id) ?? []
                        }
                        canAdd={
                          isLeave
                            ? canManageWorkforce || canApproveLeave
                            : canManageWorkforce || canApproveOvertime
                        }
                        objectKeyPlaceholder={
                          isLeave
                            ? "workforce/evidence/leave/approval-support.pdf"
                            : "workforce/evidence/overtime/approval-support.pdf"
                        }
                        recordId={record.id}
                        sourceType={isLeave ? "WORKFORCE_LEAVE" : "WORKFORCE_OVERTIME"}
                        triggerLabel="Add Evidence"
                      />
                    </div>
                    {canUseRequestActions ? (
                      <form action={runWorkforceRequestAction} className="space-y-2">
                        <input
                          name="requestKind"
                          type="hidden"
                          value={isLeave ? "leave" : "overtime"}
                        />
                        <input name="recordId" type="hidden" value={record.id} />
                        <label className="block">
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            Reason
                          </span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name="reason"
                            placeholder="Required for return, reject, cancel"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            Evidence reference
                          </span>
                          <input
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name="evidenceReference"
                            placeholder="Approval, schedule, or supporting note"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {scopedActions.length === 0 ? (
                            <Badge tone="neutral">No available action</Badge>
                          ) : (
                            scopedActions.map((action) => (
                              <button
                                key={action}
                                className={
                                  action === "reject" || action === "cancel"
                                    ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                    : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                }
                                name="action"
                                type="submit"
                                value={action}
                              >
                                {workforceRequestActionLabels[action]}
                              </button>
                            ))
                          )}
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Schedules And Coverage
              </h2>
              <p className="text-sm text-slate-500">
                Branch staffing plans, assignment coverage, unresolved gaps, and
                publication controls.
              </p>
            </div>
            <Badge tone="info">{dashboard.schedules.length} shown</Badge>
          </div>
          {canManageSchedules ? (
            <div className="grid gap-3 border-b border-slate-100 p-4">
              {dashboard.schedules.slice(0, 5).map((schedule) => {
                const actions = workforceScheduleActions(schedule.status);
                return (
                  <div
                    key={`schedule-action-${schedule.id}`}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 2xl:grid-cols-[1fr_20rem] 2xl:items-start"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-950">
                          {schedule.publicReference}
                        </p>
                        <Badge
                          tone={
                            schedule.coverageGapCount > 0
                              ? "warning"
                              : schedule.status === "PUBLISHED" ||
                                  schedule.status === "IN_PROGRESS" ||
                                  schedule.status === "CLOSED"
                                ? "success"
                                : "neutral"
                          }
                          size="sm"
                        >
                          {humanize(schedule.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {schedule.locationName} / {schedule.scheduleDate} /{" "}
                        {humanize(schedule.shiftType)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {schedule.assignedHeadcount}/{schedule.plannedHeadcount} assigned;
                        {" "}
                        {schedule.coverageGapCount} gap
                        {schedule.coverageGapCount === 1 ? "" : "s"}
                      </p>
                      <EvidenceMetadataPanel
                        action={addWorkforceEvidenceMetadata}
                        archiveAction={archiveWorkforceEvidenceMetadata}
                        attachments={scheduleEvidenceById.get(schedule.id) ?? []}
                        canAdd={canManageSchedules}
                        objectKeyPlaceholder="workforce/evidence/schedules/roster-review.pdf"
                        recordId={schedule.id}
                        sourceType="WORKFORCE_SCHEDULE"
                        triggerLabel="Add Evidence"
                      />
                    </div>
                    <form action={runWorkforceScheduleAction} className="space-y-2">
                      <input name="scheduleId" type="hidden" value={schedule.id} />
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Reason
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="reason"
                          placeholder="Required for reject or cancel"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          Evidence reference
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          name="evidenceReference"
                          placeholder="Roster review, manager approval, or publish proof"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {actions.length === 0 ? (
                          <Badge tone="neutral">No available action</Badge>
                        ) : (
                          actions.map((action) => (
                            <button
                              key={action}
                              className={
                                action === "reject" || action === "cancel"
                                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              }
                              name="action"
                              type="submit"
                              value={action}
                            >
                              {workforceScheduleActionLabels[action]}
                            </button>
                          ))
                        )}
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="ogfi-table min-w-full">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Location</th>
                  <th>Coverage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.schedules.slice(0, 10).map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <p className="font-bold text-slate-950">
                        {schedule.publicReference}
                      </p>
                      <p className="text-xs text-slate-500">
                        {schedule.scheduleDate} / {humanize(schedule.shiftType)} /{" "}
                        {schedule.plannedHours}
                      </p>
                    </td>
                    <td>{schedule.locationName}</td>
                    <td>
                      <p className="font-semibold text-slate-950">
                        {schedule.assignedHeadcount}/{schedule.plannedHeadcount} assigned
                      </p>
                      <p className="text-xs text-slate-500">
                        {schedule.coverageGapCount > 0
                          ? `${schedule.coverageGapCount} gap${schedule.coverageGapCount === 1 ? "" : "s"}: ${schedule.gapStations.join(", ")}`
                          : `${schedule.lineCount} planned line${schedule.lineCount === 1 ? "" : "s"}`}
                      </p>
                    </td>
                    <td>
                      <Badge
                        tone={
                          schedule.coverageGapCount > 0
                            ? "warning"
                            : schedule.status === "PUBLISHED" ||
                                schedule.status === "IN_PROGRESS" ||
                                schedule.status === "CLOSED"
                              ? "success"
                              : "neutral"
                        }
                        size="sm"
                      >
                        {humanize(schedule.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {dashboard.schedules.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <p className="font-semibold text-slate-950">
                        No scoped schedules yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Published branch schedules and staffing gaps will appear here.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Attendance Import Evidence
              </h2>
              <p className="text-sm text-slate-500">
                Imported time evidence, accepted rows, duplicates, exceptions,
                review verdicts, and void controls.
              </p>
            </div>
            <Badge tone="warning">Evidence only</Badge>
          </div>
          {canManageAttendance ? (
            <div className="grid gap-3 border-b border-slate-100 p-4">
              {dashboard.attendanceImports.slice(0, 5).map((batch) => (
                <div
                  key={`attendance-action-${batch.id}`}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 2xl:grid-cols-[1fr_20rem] 2xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">
                        {batch.publicReference}
                      </p>
                      <Badge
                        tone={
                          batch.exceptionCount + batch.duplicateCount > 0
                            ? "warning"
                            : batch.status === "REVIEW_READY"
                              ? "info"
                              : "success"
                        }
                        size="sm"
                      >
                        {humanize(batch.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {batch.locationName} / {batch.businessDate} /{" "}
                      {humanize(batch.sourceType)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {batch.acceptedCount}/{batch.rowCount} accepted;{" "}
                      {batch.exceptionCount} exception
                      {batch.exceptionCount === 1 ? "" : "s"};{" "}
                      {batch.duplicateCount} duplicate
                      {batch.duplicateCount === 1 ? "" : "s"}
                    </p>
                    <EvidenceMetadataPanel
                      action={addWorkforceEvidenceMetadata}
                      archiveAction={archiveWorkforceEvidenceMetadata}
                      attachments={attendanceImportEvidenceById.get(batch.id) ?? []}
                      canAdd={canManageAttendance}
                      objectKeyPlaceholder="workforce/evidence/attendance/import-review.csv"
                      recordId={batch.id}
                      sourceType="WORKFORCE_ATTENDANCE_IMPORT"
                      triggerLabel="Add Evidence"
                    />
                  </div>
                  <form action={runAttendanceImportAction} className="space-y-2">
                    <input name="batchId" type="hidden" value={batch.id} />
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Review verdict
                      </span>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="verdict"
                      >
                        <option value="ACCEPT">Accept clean rows</option>
                        <option value="EXCEPTION_LIST">Keep exception list</option>
                        <option value="REJECT">Reject batch</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Reason
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="reason"
                        placeholder="Required for reject or void"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        Evidence reference
                      </span>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        name="evidenceReference"
                        placeholder="Import file, attendance review, or void memo"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                        name="action"
                        type="submit"
                        value="review"
                      >
                        Record Review
                      </button>
                      <button
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                        name="action"
                        type="submit"
                        value="void"
                      >
                        Void Batch
                      </button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="ogfi-table min-w-full">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Location</th>
                  <th>Rows</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.attendanceImports.slice(0, 10).map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <p className="font-bold text-slate-950">
                        {batch.publicReference}
                      </p>
                      <p className="text-xs text-slate-500">
                        {batch.businessDate} / {batch.sourceReference}
                      </p>
                    </td>
                    <td>{batch.locationName}</td>
                    <td>
                      <p className="font-semibold text-slate-950">
                        {batch.acceptedCount}/{batch.rowCount} accepted
                      </p>
                      <p className="text-xs text-slate-500">
                        {batch.exceptionCount} exception
                        {batch.exceptionCount === 1 ? "" : "s"} /{" "}
                        {batch.duplicateCount} duplicate
                        {batch.duplicateCount === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td>
                      <Badge
                        tone={
                          batch.exceptionCount + batch.duplicateCount > 0
                            ? "warning"
                            : batch.status === "REVIEW_READY"
                              ? "info"
                              : "success"
                        }
                        size="sm"
                      >
                        {humanize(batch.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {dashboard.attendanceImports.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <p className="font-semibold text-slate-950">
                        No attendance import batches yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Imported attendance evidence and exceptions will appear here.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="ogfi-data-surface mt-5 overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Training And Document Readiness
            </h2>
            <p className="text-sm text-slate-500">
              Expiry watchlist for training and role-required documents.
            </p>
          </div>
          <FileWarning aria-hidden="true" className="h-5 w-5 text-amber-600" />
        </div>
        <div className="overflow-x-auto">
          <table className="ogfi-table min-w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Readiness item</th>
                <th>Status</th>
                <th>Valid until</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.readiness.slice(0, 10).map((record) => (
                <tr key={`${record.type}-${record.id}`}>
                  <td>{record.employeeName}</td>
                  <td>
                    <p className="font-semibold text-slate-950">{record.label}</p>
                    <p className="text-xs text-slate-500">{record.type}</p>
                  </td>
                  <td>
                    <Badge
                      tone={record.status === "EXPIRED" ? "danger" : "success"}
                      size="sm"
                    >
                      {humanize(record.status)}
                    </Badge>
                  </td>
                  <td>{record.validUntil ?? "No expiry"}</td>
                  <td>{record.requiredForScope ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-3">
        {dashboard.policyNotes.map((note) => (
          <Panel key={note} className="p-4">
            <p className="text-sm text-slate-600">{note}</p>
          </Panel>
        ))}
      </section>
    </AppShell>
  );
}
