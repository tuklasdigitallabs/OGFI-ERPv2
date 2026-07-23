import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { BranchChecklistLinesEditor } from "@/components/BranchChecklistLinesEditor";
import { EntryModal } from "@/components/EntryModal";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseBranchOperations,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  applyBranchOperationChecklistCorrection,
  closeBranchOperationChecklist,
  getBranchOperationChecklistSummary,
  returnBranchOperationChecklistForCorrection,
  reviewBranchOperationChecklist
} from "@/server/services/branchOperations";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

const checklistLineResults = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const checklistLineSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NORMAL"] as const;

async function reviewBranchOperationChecklistAction(formData: FormData) {
  "use server";

  const id = String(formData.get("checklistId"));
  let checklistId: string;
  try {
    checklistId = await reviewBranchOperationChecklist(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/branch-operations/${id}`, error));
  }
  redirect(`/branch-operations/${checklistId}`);
}

async function closeBranchOperationChecklistAction(formData: FormData) {
  "use server";

  const id = String(formData.get("checklistId"));
  let checklistId: string;
  try {
    checklistId = await closeBranchOperationChecklist(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/branch-operations/${id}`, error));
  }
  redirect(`/branch-operations/${checklistId}`);
}

async function returnBranchOperationChecklistAction(formData: FormData) {
  "use server";

  const id = String(formData.get("checklistId"));
  let checklistId: string;
  try {
    checklistId = await returnBranchOperationChecklistForCorrection(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/branch-operations/${id}`, error));
  }
  redirect(`/branch-operations/${checklistId}`);
}

async function applyBranchOperationChecklistCorrectionAction(formData: FormData) {
  "use server";

  const id = String(formData.get("checklistId"));
  let checklistId: string;
  try {
    checklistId = await applyBranchOperationChecklistCorrection(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/branch-operations/${id}`, error));
  }
  redirect(`/branch-operations/${checklistId}`);
}

function statusTone(status: string) {
  if (
    status === "EXCEPTION_OPEN" ||
    status === "SUBMITTED" ||
    status === "RETURNED" ||
    status === "MANAGER_REVIEW"
  ) {
    return "warning" as const;
  }
  if (status === "REVIEWED" || status === "CLOSED") {
    return "success" as const;
  }
  return "info" as const;
}

function lineTone(result: string, severity: string) {
  if (result === "EXCEPTION" && severity === "CRITICAL") {
    return "destructive" as const;
  }
  if (result === "EXCEPTION") {
    return "warning" as const;
  }
  if (result === "PASS") {
    return "success" as const;
  }
  return "neutral" as const;
}

export default async function BranchOperationChecklistDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseBranchOperations(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const checklist = await getBranchOperationChecklistSummary(session, id);
  if (!checklist) {
    notFound();
  }
  const canReview =
    session.permissionCodes.includes(permissions.branchOperationsReview) &&
    ["SUBMITTED", "MANAGER_REVIEW"].includes(checklist.status) &&
    Boolean(checklist.openedByUserId) &&
    Boolean(checklist.submittedByUserId) &&
    checklist.openedByUserId !== session.user.id &&
    checklist.submittedByUserId !== session.user.id;
  const canReturn =
    session.permissionCodes.includes(permissions.branchOperationsCorrect) &&
    ["SUBMITTED", "MANAGER_REVIEW"].includes(checklist.status) &&
    Boolean(checklist.openedByUserId) &&
    Boolean(checklist.submittedByUserId) &&
    checklist.openedByUserId !== session.user.id &&
    checklist.submittedByUserId !== session.user.id;
  const canClose =
    session.permissionCodes.includes(permissions.branchOperationsReview) &&
    ["REVIEWED", "EXCEPTION_OPEN"].includes(checklist.status);
  const canCorrect =
    session.permissionCodes.includes(permissions.branchOperationsCreate) &&
    checklist.status === "RETURNED";
  const today = new Date().toISOString().slice(0, 10);
  const defaultOutcome =
    checklist.exceptionCount > 0 ? "EXCEPTION_OPEN" : "REVIEWED";
  const actionFeedback = getActionFeedback(searchParams ? await searchParams : {});

  return (
    <AppShell
      session={session}
      title={checklist.checklistName}
      subtitle="Branch readiness checklist detail and exception evidence"
      activeNav="branch-operations"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/branch-operations" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Branch Operations
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(checklist.status)}>
            {checklist.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          {canReview ? (
            <EntryModal title="Review Branch Checklist" triggerLabel="Review Checklist">
              <form
                action={reviewBranchOperationChecklistAction}
                className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2"
              >
                <input name="checklistId" type="hidden" value={checklist.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Review date
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={today}
                    name="reviewedAt"
                    required
                    type="date"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Review outcome
                  <select
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    defaultValue={defaultOutcome}
                    name="outcome"
                    required
                  >
                    <option value="REVIEWED" disabled={checklist.exceptionCount > 0}>
                      Reviewed
                    </option>
                    <option value="EXCEPTION_OPEN">Exception open</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Review note
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="reviewNote"
                    placeholder="Sign-off summary, exception owner, or required follow-up"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:col-span-2">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Review Checklist
                </button>
              </form>
            </EntryModal>
          ) : null}
          {canReturn ? (
            <EntryModal
              title="Return Branch Checklist"
              triggerLabel="Return for Correction"
            >
              <form
                action={returnBranchOperationChecklistAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="checklistId" type="hidden" value={checklist.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Correction reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="correctionReason"
                    placeholder="Describe what the branch must correct before review can continue."
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={255}
                    name="evidenceReference"
                    placeholder="Optional photo, note, or checklist reference"
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                  Return for Correction
                </button>
              </form>
            </EntryModal>
          ) : null}
          {canCorrect ? (
            <TaskSheet
              title="Apply Branch Checklist Correction"
              description="Correct returned checklist lines, then resubmit. The earlier return and correction history stays with this source record."
              trigger="Correct and Resubmit"
              triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              size="workspace"
              bodyScroll="contained"
              bodyClassName="p-0"
              footer={
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
                  form="correct-branch-checklist"
                  type="submit"
                >
                  Correct and Resubmit
                </button>
              }
            >
              <BranchChecklistLinesEditor
                action={applyBranchOperationChecklistCorrectionAction}
                checklistId={checklist.id}
                formId="correct-branch-checklist"
                initialLines={checklist.lines}
                resultOptions={checklistLineResults}
                severityOptions={checklistLineSeverities}
                shiftOptions={[]}
              />
            </TaskSheet>
          ) : null}
          {canClose ? (
            <EntryModal title="Close Branch Checklist" triggerLabel="Close Checklist">
              <form
                action={closeBranchOperationChecklistAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="checklistId" type="hidden" value={checklist.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Close reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="closeReason"
                    placeholder="Summarize final sign-off or why no further follow-up remains"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Close Checklist
                </button>
              </form>
            </EntryModal>
          ) : null}
        </div>
      </div>

      <div className="ogfi-coordination-cue mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Phase II boundary:</strong> this checklist detail captures
              branch readiness and exceptions only. Review updates this
              checklist and its audit history; it does not post stock, approve
              inventory adjustments, or replace incident and maintenance source
              records.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Exception rows remain follow-up signals until handled in their
              authoritative workflow.
            </p>
          </div>
          <span>Checklist source record</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.locationName}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Business date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.businessDate}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Shift</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.shiftType.toLowerCase()}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Completion</p>
          <p className="mt-2 text-xl font-bold text-blue-700">
            {checklist.completionPercent.toFixed(0)}%
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Opened by</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.openedByName ?? "Not recorded"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Submitted by</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.submittedByName ?? "Not submitted"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Reviewed by</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.reviewedByName ?? "Pending review"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Reviewed date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {checklist.reviewedAt ?? "Pending"}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Checklist Lines
            </h2>
            <p className="text-sm text-slate-500">
              {checklist.lines.length} checks, {checklist.exceptionCount} exception(s).
            </p>
          </div>
          <Badge tone={checklist.exceptionCount > 0 ? "warning" : "success"}>
            {checklist.exceptionCount} exceptions
          </Badge>
        </div>
        <div className="divide-y divide-slate-100">
          {checklist.lines.map((line) => (
            <div
              key={line.id}
              className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[4rem_1fr_11rem_11rem] lg:gap-4"
            >
              <p className="font-semibold text-slate-500">{line.lineNo}</p>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {line.area}
                </p>
                <p className="mt-1 font-bold text-slate-950">{line.checkName}</p>
                <p className="mt-1 text-xs text-slate-600">{line.expectedResult}</p>
                {line.notes ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                    {line.notes}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <Badge tone={lineTone(line.result, line.severity)}>
                  {line.result.toLowerCase()}
                </Badge>
                <Badge tone={line.severity === "CRITICAL" ? "destructive" : "neutral"}>
                  {line.severity.toLowerCase()}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Evidence
                </p>
                <p className="mt-1 font-bold text-slate-950">
                  {line.evidenceReference ?? "Pending"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
