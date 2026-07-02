import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseWastageReports,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelWastageReport,
  getWastageReport,
  postWastageReport,
  reverseWastageReport,
  reviewWastageReport,
  submitWastageReport
} from "@/server/services/wastage";

export const dynamic = "force-dynamic";

type WastageDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function submitReportAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/wastage/${id}`, error));
  }
  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
}

async function reviewReportAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reviewWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/wastage/${id}`, error));
  }
  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
}

async function cancelReportAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/wastage/${id}`, error));
  }
  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
}

async function postReportAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await postWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/wastage/${id}`, error));
  }
  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

async function reverseReportAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reverseWastageReport(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/wastage/${id}`, error));
  }
  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "SUBMITTED" || status === "PENDING_APPROVAL") {
    return "info" as const;
  }
  if (
    status === "REVIEWED" ||
    status === "APPROVED" ||
    status === "POSTED" ||
    status === "REVERSED"
  ) {
    return "success" as const;
  }
  return "warning" as const;
}

function formatMoney(amount: number) {
  return `PHP ${amount.toFixed(2)}`;
}

function getMetadataText(metadata: unknown, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getSnapshotText(snapshot: unknown, key: string) {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function WastageDetailPage({
  params,
  searchParams
}: WastageDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseWastageReports(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const report = await getWastageReport(session, id);
  if (!report) {
    redirect("/wastage");
  }

  const canSubmit = session.permissionCodes.includes(permissions.wastageSubmit);
  const canReview = session.permissionCodes.includes(permissions.wastageReview);
  const canCancel = session.permissionCodes.includes(permissions.wastageCancel);
  const canPost = session.permissionCodes.includes(permissions.wastagePost);
  const canReverse = session.permissionCodes.includes(permissions.wastageReverse);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Wastage Report"
      subtitle={`${report.publicReference} / ${report.inventoryLocationName}`}
      activeNav="wastage"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Wastage Report</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {report.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {report.locationName} / {report.inventoryLocationName}
              </p>
            </div>
            <Badge tone={statusTone(report.status)}>{report.status}</Badge>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Approval alone does not change stock balances. Only the separate Post
            Wastage action creates WASTAGE_OUT inventory movements.
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Type</dt>
              <dd className="text-slate-950">
                {report.wastageType.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reason</dt>
              <dd className="text-slate-950">{report.reasonCode}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reported by</dt>
              <dd className="text-slate-950">{report.reportedByName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reviewed by</dt>
              <dd className="text-slate-950">{report.reviewedByName ?? "Not reviewed"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Posted by</dt>
              <dd className="text-slate-950">{report.postedByName ?? "Not posted"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reversed by</dt>
              <dd className="text-slate-950">
                {report.reversedByName ?? "Not reversed"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Estimated value</dt>
              <dd className="text-slate-950">
                {formatMoney(report.totalEstimatedCost)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Submitted</dt>
              <dd className="text-slate-950">
                {report.submittedAt
                  ? new Date(report.submittedAt).toLocaleString()
                  : "Not submitted"}
              </dd>
            </div>
            {report.evidenceReference ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Evidence reference</dt>
                <dd className="text-slate-950">{report.evidenceReference}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm font-medium text-slate-500">Evidence policy</dt>
              <dd className="text-slate-950">
                {report.evidenceRequired
                  ? report.evidenceSatisfied
                    ? "Required and satisfied"
                    : "Required and missing"
                  : "Not required"}
              </dd>
            </div>
            {getSnapshotText(report.policySnapshot, "policyName") ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Policy snapshot</dt>
                <dd className="text-slate-950">
                  {getSnapshotText(report.policySnapshot, "policyName")}
                  {getSnapshotText(report.policySnapshot, "policyVersion")
                    ? ` / ${getSnapshotText(report.policySnapshot, "policyVersion")}`
                    : ""}
                </dd>
              </div>
            ) : null}
            {report.policyFlagLabels.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Policy flags</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {report.policyFlagLabels.map((flag) => (
                    <Badge key={flag} tone="warning">
                      {flag}
                    </Badge>
                  ))}
                </dd>
              </div>
            ) : null}
            {report.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Notes</dt>
                <dd className="text-slate-950">{report.notes}</dd>
              </div>
            ) : null}
            {report.reviewNotes ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Review notes</dt>
                <dd className="text-slate-950">{report.reviewNotes}</dd>
              </div>
            ) : null}
            {report.postedAt ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Posted</dt>
                <dd className="text-slate-950">
                  {new Date(report.postedAt).toLocaleString()}
                </dd>
              </div>
            ) : null}
            {report.reversedAt ? (
              <div>
                <dt className="text-sm font-medium text-slate-500">Reversed</dt>
                <dd className="text-slate-950">
                  {new Date(report.reversedAt).toLocaleString()}
                </dd>
              </div>
            ) : null}
            {report.reversalReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Reversal reason</dt>
                <dd className="text-slate-950">{report.reversalReason}</dd>
              </div>
            ) : null}
            {report.cancellationReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Cancellation reason</dt>
                <dd className="text-slate-950">{report.cancellationReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/wastage" className="bg-slate-700 hover:bg-slate-800">
              Back to Wastage
            </ButtonLink>
            {canSubmit && (report.status === "DRAFT" || report.status === "RETURNED") ? (
              <form action={submitReportAction}>
                <input name="id" type="hidden" value={report.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Submit for Approval
                </button>
              </form>
            ) : null}
            {canPost && report.status === "APPROVED" && !report.postedAt ? (
              <form action={postReportAction}>
                <input name="id" type="hidden" value={report.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Post Wastage
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid-cols-[3rem_1fr_7rem_8rem_8rem]">
              <span>Line</span>
              <span>Item</span>
              <span>Qty</span>
              <span>Est. unit</span>
              <span className="md:text-right">Est. total</span>
            </div>
            <div className="divide-y divide-slate-100">
              {report.lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 p-3 text-sm md:grid-cols-[3rem_1fr_7rem_8rem_8rem]"
                >
                  <p className="font-semibold text-slate-500">#{line.lineNumber}</p>
                  <div>
                    <p className="font-medium text-slate-950">
                      {line.itemCode} / {line.itemName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {line.reasonCode}
                      {line.lotNumber ? ` / lot ${line.lotNumber}` : ""}
                      {line.expiryDate ? ` / exp ${line.expiryDate}` : ""}
                    </p>
                    {line.evidenceReference ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Evidence: {line.evidenceReference}
                      </p>
                    ) : null}
                    {line.photoRequired ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Photo evidence required by item category
                      </p>
                    ) : null}
                  </div>
                  <p className="text-slate-700">
                    {line.quantity} {line.uomCode}
                  </p>
                  <p className="text-slate-700">
                    {formatMoney(line.estimatedUnitCost)}
                  </p>
                  <p className="font-semibold text-slate-900 md:text-right">
                    {formatMoney(line.estimatedTotalCost)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {canReview && report.status === "SUBMITTED" ? (
              <EntryModal title="Review Wastage Report" triggerLabel="Review Report">
                <form action={reviewReportAction} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={report.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Review action
                    <select
                      className="rounded-md border border-slate-300 px-3 py-2"
                      defaultValue="REVIEW"
                      name="reviewAction"
                      required
                    >
                      <option value="REVIEW">Mark reviewed</option>
                      <option value="RETURN">Return for correction</option>
                      <option value="REJECT">Reject report</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Review notes
                    <textarea
                      className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                      name="reviewNotes"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-fit">
                    Save Review
                  </button>
                </form>
              </EntryModal>
            ) : null}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Control Status</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Inventory posting</dt>
                <dd className="font-semibold text-slate-900">
                  {report.status === "POSTED" ? "Posted" : "Separate action"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Approval integration</dt>
                <dd className="font-semibold text-slate-900">Active</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                <dt className="font-semibold text-slate-950">Estimated value</dt>
                <dd className="font-bold text-blue-700">
                  {formatMoney(report.totalEstimatedCost)}
                </dd>
              </div>
            </dl>
          </Panel>

          {canCancel &&
          (report.status === "DRAFT" ||
            report.status === "SUBMITTED" ||
            report.status === "PENDING_APPROVAL" ||
            report.status === "RETURNED") ? (
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Cancel Report</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cancellation keeps the report history and prevents posting.
              </p>
              <div className="mt-4">
                <EntryModal title="Cancel Wastage Report" triggerLabel="Cancel Report">
                  <form action={cancelReportAction} className="mt-4 grid gap-3">
                    <input name="id" type="hidden" value={report.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Cancellation reason
                      <textarea
                        className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                        name="cancellationReason"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:w-fit">
                      Cancel Report
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}

          {canReverse && report.status === "POSTED" && report.postedAt ? (
            <Panel className="ogfi-detail-card">
              <h2 className="text-lg font-bold text-slate-950">Reverse Posted Wastage</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reversal creates linked inventory movements. Use a corrected replacement
                report if the wastage still needs to be recorded.
              </p>
              <div className="mt-4">
                <EntryModal
                  title="Reverse Posted Wastage"
                  triggerLabel="Reverse Posted Wastage"
                >
                  <form action={reverseReportAction} className="mt-4 grid gap-3">
                    <input name="id" type="hidden" value={report.id} />
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Reversal reason
                      <textarea
                        className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
                        name="reversalReason"
                        required
                      />
                    </label>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:w-fit">
                      Reverse Posted Wastage
                    </button>
                  </form>
                </EntryModal>
              </div>
            </Panel>
          ) : null}

          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <ol className="mt-4 space-y-4">
              {report.auditEvents.length === 0 ? (
                <li className="text-sm text-slate-500">No audit events recorded.</li>
              ) : (
                report.auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                    <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.occurredAt}</p>
                    {getMetadataText(event.metadata, "reviewNotes") ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Notes: {getMetadataText(event.metadata, "reviewNotes")}
                      </p>
                    ) : null}
                    {getMetadataText(event.metadata, "cancellationReason") ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Reason: {getMetadataText(event.metadata, "cancellationReason")}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
