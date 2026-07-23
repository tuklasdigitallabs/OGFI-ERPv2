import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { FoodSafetyReadingsEditor } from "@/components/FoodSafetyReadingsEditor";
import { TaskSheet } from "@/components/TaskSheet";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseFoodSafety,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  applyFoodSafetyLogCorrection,
  closeFoodSafetyLog,
  getFoodSafetyLogSummary,
  returnFoodSafetyLogForCorrection,
  reviewFoodSafetyLog
} from "@/server/services/foodSafety";

export const dynamic = "force-dynamic";

const foodSafetyReadingResults = ["PASS", "EXCEPTION", "NOT_APPLICABLE"] as const;
const foodSafetyReadingSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NORMAL"] as const;

async function reviewFoodSafetyLogAction(formData: FormData) {
  "use server";

  const id = String(formData.get("logId"));
  let logId: string;
  try {
    logId = await reviewFoodSafetyLog(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/food-safety/${id}`, error));
  }
  redirect(`/food-safety/${logId}`);
}

async function closeFoodSafetyLogAction(formData: FormData) {
  "use server";

  const id = String(formData.get("logId"));
  let logId: string;
  try {
    logId = await closeFoodSafetyLog(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/food-safety/${id}`, error));
  }
  redirect(`/food-safety/${logId}`);
}

async function returnFoodSafetyLogAction(formData: FormData) {
  "use server";

  const id = String(formData.get("logId"));
  let logId: string;
  try {
    logId = await returnFoodSafetyLogForCorrection(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/food-safety/${id}`, error));
  }
  redirect(`/food-safety/${logId}`);
}

async function applyFoodSafetyLogCorrectionAction(formData: FormData) {
  "use server";

  const id = String(formData.get("logId"));
  let logId: string;
  try {
    logId = await applyFoodSafetyLogCorrection(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/food-safety/${id}`, error));
  }
  redirect(`/food-safety/${logId}`);
}

function badgeToneFor(status: string, severity?: string) {
  if (severity === "CRITICAL") {
    return "destructive" as const;
  }
  if (
    status === "SUBMITTED" ||
    status === "RETURNED" ||
    status === "EXCEPTION" ||
    status.includes("EXCEPTION")
  ) {
    return "warning" as const;
  }
  if (status === "PASS" || status === "REVIEWED" || status === "CLOSED") {
    return "success" as const;
  }
  return "info" as const;
}

function readingValue(
  value: number | null,
  uom: string | null,
  min: number | null,
  max: number | null
) {
  const valueText = value === null ? "Recorded" : `${value} ${uom ?? ""}`.trim();
  if (min === null && max === null) {
    return valueText;
  }
  return `${valueText} / Target ${min ?? "-"} to ${max ?? "-"} ${uom ?? ""}`.trim();
}

export default async function FoodSafetyLogDetailPage({
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
  if (!canUseFoodSafety(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const log = await getFoodSafetyLogSummary(session, id);
  if (!log) {
    notFound();
  }

  const criticalExceptions = log.readings.filter(
    (reading) => reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
  ).length;
  const canReview =
    session.permissionCodes.includes(permissions.foodSafetyReview) &&
    ["SUBMITTED", "EXCEPTION_REVIEW"].includes(log.status) &&
    Boolean(log.recordedByUserId) &&
    log.recordedByUserId !== session.user.id;
  const canReturn =
    session.permissionCodes.includes(permissions.foodSafetyCorrect) &&
    ["SUBMITTED", "EXCEPTION_REVIEW"].includes(log.status) &&
    Boolean(log.recordedByUserId) &&
    log.recordedByUserId !== session.user.id;
  const canClose =
    session.permissionCodes.includes(permissions.foodSafetyReview) &&
    ["REVIEWED", "EXCEPTION_OPEN"].includes(log.status);
  const canCorrect =
    session.permissionCodes.includes(permissions.foodSafetyCreate) &&
    log.status === "RETURNED";
  const today = new Date().toISOString().slice(0, 10);
  const defaultOutcome = log.exceptionCount > 0 ? "EXCEPTION_OPEN" : "REVIEWED";
  const actionFeedback = getActionFeedback(searchParams ? await searchParams : {});

  return (
    <AppShell
      session={session}
      title={log.title}
      subtitle="Food-safety readings, exceptions, corrective actions, and evidence"
      activeNav="food-safety"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/food-safety" tone="ghost" className="ogfi-chip">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Food Safety
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badgeToneFor(log.status)}>
            {log.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          {canReview ? (
            <EntryModal title="Review Food-Safety Log" triggerLabel="Review Log">
              <form
                action={reviewFoodSafetyLogAction}
                className="ogfi-form-shell mt-4 grid gap-3 md:grid-cols-2"
              >
                <input name="logId" type="hidden" value={log.id} />
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
                    <option value="REVIEWED" disabled={log.exceptionCount > 0}>
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
                    placeholder="Compliance sign-off, exception owner, or required follow-up"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:col-span-2">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Review Food-Safety Log
                </button>
              </form>
            </EntryModal>
          ) : null}
          {canReturn ? (
            <EntryModal title="Return Food-Safety Log" triggerLabel="Return for Correction">
              <form
                action={returnFoodSafetyLogAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="logId" type="hidden" value={log.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Correction reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="correctionReason"
                    placeholder="Describe what must be corrected before compliance review can continue."
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Evidence reference
                  <input
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={255}
                    name="evidenceReference"
                    placeholder="Optional thermometer photo, sanitation note, or reference"
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
              title="Apply Food-Safety Correction"
              description="Correct returned readings, then resubmit. The earlier return and correction history remains with this compliance log."
              trigger="Correct and Resubmit"
              triggerClassName="border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              size="workspace"
              bodyScroll="contained"
              bodyClassName="p-0"
              footer={<button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto" form="correct-food-safety-log" type="submit">Correct and Resubmit</button>}
            >
              <FoodSafetyReadingsEditor
                action={applyFoodSafetyLogCorrectionAction}
                formId="correct-food-safety-log"
                initialReadings={log.readings}
                logId={log.id}
                logTypeOptions={[]}
                resultOptions={foodSafetyReadingResults}
                severityOptions={foodSafetyReadingSeverities}
              />
            </TaskSheet>
          ) : null}
          {canClose ? (
            <EntryModal title="Close Food-Safety Log" triggerLabel="Close Log">
              <form
                action={closeFoodSafetyLogAction}
                className="ogfi-form-shell mt-4 grid gap-3"
              >
                <input name="logId" type="hidden" value={log.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Close reason
                  <textarea
                    className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                    maxLength={1000}
                    name="closeReason"
                    placeholder="Summarize compliance sign-off or why no further follow-up remains"
                    required
                  />
                </label>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Close Log
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
              <strong>Phase II boundary:</strong> this log detail captures
              readings, exceptions, corrective actions, and evidence references
              only. Review updates this log and its audit history; it does not
              create incidents, post wastage, adjust stock, approve inventory,
              or close compliance actions automatically.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Exception rows are compliance follow-up signals for the selected
              branch context.
            </p>
          </div>
          <span>Food-safety source record</span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-5 xl:grid-cols-8">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Location</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{log.locationName}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Business date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{log.businessDate}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Log type</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {log.logType.toLowerCase()}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Exceptions</p>
          <p className="mt-2 text-xl font-bold text-amber-700">
            {log.exceptionCount}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Critical</p>
          <p className="mt-2 text-xl font-bold text-red-700">
            {criticalExceptions}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Recorded by</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {log.recordedByName ?? "Not recorded"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Reviewed by</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {log.reviewedByName ?? "Pending review"}
          </p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Reviewed date</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {log.reviewedAt ?? "Pending"}
          </p>
        </Panel>
      </div>

      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Reading Evidence
            </h2>
            <p className="text-sm text-slate-500">
              {log.readings.length} reading(s) with result, severity, corrective
              action, and evidence reference.
            </p>
          </div>
          <Badge tone={criticalExceptions > 0 ? "destructive" : "info"}>
            {criticalExceptions} critical
          </Badge>
        </div>
        <div className="divide-y divide-slate-100">
          {log.readings
            .slice()
            .sort((left, right) => {
              const leftWeight =
                left.result === "EXCEPTION" ? (left.severity === "CRITICAL" ? 0 : 1) : 2;
              const rightWeight =
                right.result === "EXCEPTION" ? (right.severity === "CRITICAL" ? 0 : 1) : 2;
              return leftWeight - rightWeight || left.lineNo - right.lineNo;
            })
            .map((reading) => (
              <div
                key={reading.id}
                className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[4rem_1fr_11rem_11rem] lg:gap-4"
              >
                <p className="font-semibold text-slate-500">{reading.lineNo}</p>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {reading.station}
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {reading.readingType}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {readingValue(
                      reading.readingValue,
                      reading.readingUom,
                      reading.expectedMinValue,
                      reading.expectedMaxValue
                    )}
                  </p>
                  {reading.correctiveAction ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      {reading.correctiveAction}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Badge tone={badgeToneFor(reading.result, reading.severity)}>
                    {reading.result.toLowerCase()}
                  </Badge>
                  <Badge
                    tone={
                      reading.severity === "CRITICAL"
                        ? "destructive"
                        : "neutral"
                    }
                  >
                    {reading.severity.toLowerCase()}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Evidence
                  </p>
                  <p className="mt-1 font-bold text-slate-950">
                    {reading.evidenceReference ?? "Pending"}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </section>
    </AppShell>
  );
}
