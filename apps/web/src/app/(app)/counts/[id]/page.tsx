import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { StockCountEntriesEditor } from "@/components/StockCountEntriesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseStockCounts,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelStockCount,
  generateStockCountVarianceAdjustment,
  getStockCount,
  reviewStockCount,
  saveStockCountEntries,
  startStockCount,
  submitStockCount
} from "@/server/services/stockCounts";

export const dynamic = "force-dynamic";

type CountDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function startCountAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await startStockCount(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
}

async function saveCountEntriesAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  const lineIds = formData.getAll("lineId").map(String);
  const quantities = formData.getAll("countedQuantityBaseUom").map(String);
  const notes = formData.getAll("notes").map(String);

  try {
    await saveStockCountEntries({
      id,
      lines: lineIds.map((lineId, index) => ({
        lineId,
        countedQuantityBaseUom: quantities[index],
        notes: notes[index]
      }))
    });
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
}

async function submitCountAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await submitStockCount(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
}

async function reviewCountAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await reviewStockCount(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
}

async function cancelCountAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  try {
    await cancelStockCount(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
}

async function generateVarianceAdjustmentAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  let adjustmentId: string;
  try {
    adjustmentId = await generateStockCountVarianceAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/counts/${id}`, error));
  }
  revalidatePath(`/counts/${id}`);
  revalidatePath("/counts");
  revalidatePath("/adjustments");
  redirect(`/adjustments/${adjustmentId}`);
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (status === "IN_PROGRESS" || status === "RECOUNT_REQUESTED") {
    return "info" as const;
  }
  if (status === "REVIEWED") {
    return "success" as const;
  }
  return "warning" as const;
}

function getMetadataText(metadata: unknown, key: string) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function CountDetailPage({
  params,
  searchParams
}: CountDetailPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseStockCounts(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const { id } = await params;
  const count = await getStockCount(session, id);
  if (!count) {
    redirect("/counts");
  }

  const canStartOrEnter = session.permissionCodes.includes(
    permissions.stockCountEnter
  );
  const canSubmit = session.permissionCodes.includes(permissions.stockCountSubmit);
  const canReview = session.permissionCodes.includes(permissions.stockCountReview);
  const canCancel = session.permissionCodes.includes(permissions.stockCountCancel);
  const canGenerateVarianceAdjustment = session.permissionCodes.includes(
    permissions.stockAdjustmentCreate
  );
  const canEditLines =
    canStartOrEnter &&
    (count.status === "IN_PROGRESS" || count.status === "RECOUNT_REQUESTED");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(resolvedSearchParams);

  return (
    <AppShell
      session={session}
      title="Stock Count"
      subtitle={`${count.publicReference} / ${count.inventoryLocationName}`}
      activeNav="counts"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="ogfi-detail-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Physical Count</p>
              <h2 className="text-2xl font-semibold text-slate-950">
                {count.publicReference}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {count.inventoryLocationName} / {count.countType}
              </p>
            </div>
            <Badge tone={statusTone(count.status)}>{count.status}</Badge>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Reviewed count variances generate a linked Stock Adjustment for approval
            and posting. No inventory movement is posted directly from this count page.
          </div>

          <dl className="mt-6 grid gap-4 ogfi-record-summary p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Location</dt>
              <dd className="text-slate-950">{count.locationName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Blind count</dt>
              <dd className="text-slate-950">{count.blindCount ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Scheduled</dt>
              <dd className="text-slate-950">{count.scheduledDate ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Cutoff</dt>
              <dd className="text-slate-950">
                {count.cutoffAt ? new Date(count.cutoffAt).toLocaleString() : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Assigned counter</dt>
              <dd className="text-slate-950">{count.assignedToName ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Reviewed by</dt>
              <dd className="text-slate-950">{count.reviewedByName ?? "Not reviewed"}</dd>
            </div>
            {canReview && count.reviewNotes ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Review notes</dt>
                <dd className="text-slate-950">{count.reviewNotes}</dd>
              </div>
            ) : null}
            {canReview && count.varianceAdjustmentId ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">
                  Variance adjustment
                </dt>
                <dd className="text-slate-950">
                  <Link
                    className="font-semibold text-blue-700 hover:text-blue-800"
                    href={`/adjustments/${count.varianceAdjustmentId}`}
                  >
                    {count.varianceAdjustmentReference}
                  </Link>{" "}
                  / {count.varianceAdjustmentStatus}
                </dd>
              </div>
            ) : null}
            {count.cancellationReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-500">Cancellation reason</dt>
                <dd className="text-slate-950">{count.cancellationReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/counts" className="bg-slate-700 hover:bg-slate-800">
              Back to Counts
            </ButtonLink>
            {count.status === "DRAFT" && canStartOrEnter ? (
              <form action={startCountAction}>
                <input name="id" type="hidden" value={count.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">
                  Start Count
                </button>
              </form>
            ) : null}
            {canSubmit &&
            (count.status === "IN_PROGRESS" ||
              count.status === "RECOUNT_REQUESTED") ? (
              <form action={submitCountAction}>
                <input name="id" type="hidden" value={count.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto">
                  Submit for Review
                </button>
              </form>
            ) : null}
            {count.status === "REVIEWED" &&
            canGenerateVarianceAdjustment &&
            !count.varianceAdjustmentId ? (
              <form action={generateVarianceAdjustmentAction}>
                <input name="id" type="hidden" value={count.id} />
                <button className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto">
                  Generate Variance Adjustment
                </button>
              </form>
            ) : null}
          </div>

          {count.lines.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5">
              <p className="font-semibold text-slate-900">No snapshot lines yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Start the count to snapshot current balance rows for this inventory
                location.
              </p>
            </div>
          ) : (
            <section className="mt-6 rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Count Lines</h3>
                  <p className="text-sm text-slate-500">
                    {count.lines.length} snapshot line(s) captured at count start
                  </p>
                </div>
                {canEditLines ? (
                  <StockCountEntriesEditor
                    action={saveCountEntriesAction}
                    countId={count.id}
                    lines={count.lines}
                  />
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[860px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="w-14 px-4 py-3">#</th>
                      <th className="w-72 px-4 py-3">Item</th>
                      <th className="w-36 px-4 py-3">Lot</th>
                      <th className="w-32 px-4 py-3">Expiry</th>
                      {count.canShowSystemQuantity ? (
                        <th className="w-36 px-4 py-3">System</th>
                      ) : null}
                      <th className="w-36 px-4 py-3">Counted</th>
                      {canReview ? (
                        <th className="w-36 px-4 py-3">Variance</th>
                      ) : null}
                      <th className="w-52 px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {count.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-semibold text-slate-500">
                          {line.lineNumber}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950">
                            {line.itemName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {line.itemCode} / {line.uomCode}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {line.lotNumber ?? "Untracked"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {line.expiryDate ?? "No expiry"}
                        </td>
                        {count.canShowSystemQuantity ? (
                          <td className="px-4 py-3 font-semibold text-slate-950">
                            {line.systemQuantityBaseUom} {line.uomCode}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 font-semibold text-slate-950">
                          {line.countedQuantityBaseUom ?? "Not counted"} {line.uomCode}
                        </td>
                        {canReview ? (
                          <td className="px-4 py-3 font-semibold text-slate-950">
                            {line.varianceQuantityBaseUom ?? "Not counted"} {line.uomCode}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-slate-700">
                          {line.notes ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {count.status === "SUBMITTED" && canReview ? (
              <EntryModal title="Review Stock Count" triggerLabel="Review Count">
                <form action={reviewCountAction} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={count.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Review action
                    <select
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="reviewAction"
                      required
                    >
                      <option value="REVIEW">Mark reviewed</option>
                      <option value="RECOUNT">Request recount</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Review notes
                    <textarea
                      className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                      name="reviewNotes"
                      placeholder="Required review or recount note"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-fit">
                    Save Review
                  </button>
                </form>
              </EntryModal>
            ) : null}

            {canCancel && !["REVIEWED", "CANCELLED"].includes(count.status) ? (
              <EntryModal title="Cancel Stock Count" triggerLabel="Cancel Count">
                <form action={cancelCountAction} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={count.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Cancellation reason
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="cancellationReason"
                      placeholder="Reason required"
                      required
                    />
                  </label>
                  <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-slate-700 px-4 text-sm font-semibold text-white hover:bg-slate-800 sm:w-fit">
                    Cancel Count
                  </button>
                </form>
              </EntryModal>
            ) : null}
          </div>
        </Panel>

        {canReview ? (
          <Panel className="ogfi-detail-card">
            <h2 className="text-lg font-bold text-slate-950">Audit History</h2>
            <ol className="mt-4 space-y-4">
              {count.auditEvents.length === 0 ? (
                <li className="text-sm text-slate-500">No audit events recorded.</li>
              ) : (
                count.auditEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-3">
                    <p className="text-sm font-medium text-slate-950">{event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.occurredAt}</p>
                    {getMetadataText(event.metadata, "reason") ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Reason: {getMetadataText(event.metadata, "reason")}
                      </p>
                    ) : null}
                    {getMetadataText(event.metadata, "reviewNotes") ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Notes: {getMetadataText(event.metadata, "reviewNotes")}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ol>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
