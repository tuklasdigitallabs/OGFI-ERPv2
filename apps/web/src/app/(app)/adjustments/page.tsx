import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { StockAdjustmentLinesEditor } from "@/components/StockAdjustmentLinesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import {
  canUseStockAdjustments,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canExportStockAdjustments } from "@/server/services/exportAuthorization";
import {
  createStockAdjustment,
  listStockAdjustmentFormOptions,
  listStockAdjustments
} from "@/server/services/stockAdjustments";

export const dynamic = "force-dynamic";

type AdjustmentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function createStockAdjustmentAction(formData: FormData) {
  "use server";

  let adjustmentId: string;
  try {
    adjustmentId = await createStockAdjustment(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/adjustments", error));
  }
  revalidatePath("/adjustments");
  redirect(`/adjustments/${adjustmentId}`);
}

function statusTone(status: string) {
  if (status === "DRAFT") {
    return "neutral" as const;
  }
  if (["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "POSTING"].includes(status)) {
    return "info" as const;
  }
  if (["POSTED", "REVERSED"].includes(status)) {
    return "success" as const;
  }
  return "warning" as const;
}

function formatMoney(amount: number) {
  return `PHP ${amount.toFixed(2)}`;
}

function formatQuantity(quantity: number) {
  return `${quantity > 0 ? "+" : ""}${quantity.toFixed(3)}`;
}

export default async function AdjustmentsPage({
  searchParams
}: AdjustmentsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canAccessAdjustments = canUseStockAdjustments(session.permissionCodes);
  const canCreateAdjustments = session.permissionCodes.includes(
    permissions.stockAdjustmentCreate
  );
  const canExportAdjustments = canExportStockAdjustments(session);

  if (!canAccessAdjustments) {
    redirect(
      session.permissionCodes.includes(permissions.inventoryBalanceView)
        ? "/inventory"
        : getDefaultAppRoute(session.permissionCodes)
    );
  }

  const [adjustments, formOptions] = await Promise.all([
    listStockAdjustments(session),
    canCreateAdjustments
      ? listStockAdjustmentFormOptions(session)
      : Promise.resolve(null)
  ]);
  const firstInventoryLocation = formOptions?.inventoryLocations[0];
  const firstItem = formOptions?.items[0];
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Stock Adjustments"
      subtitle="Approve, post, and reverse controlled stock correction and opening-balance requests"
      activeNav="adjustments"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Reason</span>
          <span>Evidence</span>
          <span>Approval</span>
          <span>Post adjustment</span>
          <span>Reversal</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Adjustments are controlled correction requests.</strong> Approval
          does not change stock; only posting writes adjustment or opening-balance
          movements to the ledger.
        </p>
      </div>
      <div className="space-y-4">
        {canCreateAdjustments ? (
          <div className="flex justify-end">
            <EntryModal title="Create Adjustment" triggerLabel="Create Adjustment">
              {!firstInventoryLocation || !firstItem ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  The current location needs an active inventory location and tracked item
                  master data before adjustment requests can be created.
                </div>
              ) : (
                <StockAdjustmentLinesEditor
                  action={createStockAdjustmentAction}
                  adjustmentTypes={formOptions.adjustmentTypes}
                  inventoryLocations={formOptions.inventoryLocations}
                  items={formOptions.items}
                  reasonCodes={formOptions.reasonCodes}
                />
              )}
            </EntryModal>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Adjustment Requests</h2>
              <p className="text-sm text-slate-500">
                Approval is non-posting; stock changes only after the separate Post Adjustment action.
                Post Adjustment writes ADJUSTMENT_IN, ADJUSTMENT_OUT, or OPENING_BALANCE_IN ledger movements.
                Opening balances are for controlled cutover baselines only.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone="info">{session.context.locationName}</Badge>
              {canExportAdjustments ? (
                <ButtonLink
                  href="/adjustments/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {adjustments.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">
                No stock adjustment requests yet
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Record a proposed increase or decrease when inventory needs a documented
                correction or opening baseline that is not wastage, receiving shortage, or transfer loss.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {adjustments.map((adjustment) => (
                <div key={adjustment.id} className="ogfi-list-row grid gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {adjustment.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {adjustment.adjustmentType}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {adjustment.inventoryLocationName} / {adjustment.reasonCode}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={statusTone(adjustment.status)}>
                        {adjustment.status}
                      </Badge>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatMoney(adjustment.totalEstimatedValueImpact)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Requested by {adjustment.requestedByName}</span>
                    <span>/</span>
                    <span>{adjustment.lineCount} line(s)</span>
                    <span>/</span>
                    <span>Delta {formatQuantity(adjustment.totalQuantityDelta)}</span>
                    <span>/</span>
                    <span>Submitted {adjustment.submittedAt ? "yes" : "no"}</span>
                    <span>/</span>
                    <span>Posted {adjustment.postedAt ? "yes" : "no"}</span>
                    <span>/</span>
                    <span>Reversed {adjustment.reversedAt ? "yes" : "no"}</span>
                  </div>
                  <div>
                    <ButtonLink
                      href={`/adjustments/${adjustment.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      Open Adjustment
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </AppShell>
  );
}
