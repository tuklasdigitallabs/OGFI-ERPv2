import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
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
  listStockAdjustmentDashboardProfilePage,
  listStockAdjustmentFormOptions,
  listStockAdjustmentPage,
  resolveStockAdjustmentDashboardProfile,
  stockAdjustmentDashboardProfileHref
} from "@/server/services/stockAdjustments";

export const dynamic = "force-dynamic";

type AdjustmentsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getStringParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

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

  const params = searchParams ? await searchParams : {};
  const profileParam = getStringParam(params, "dashboard");
  const profile = resolveStockAdjustmentDashboardProfile(profileParam);
  if (profileParam && !profile) {
    redirect("/adjustments");
  }
  const profilePage = profile
    ? await listStockAdjustmentDashboardProfilePage(session, profile, getPage(params))
    : null;
  const [workspacePage, formOptions] = profile
    ? [null, null]
    : await Promise.all([
        listStockAdjustmentPage(session, { page: getPage(params) }),
        canCreateAdjustments
          ? listStockAdjustmentFormOptions(session)
          : Promise.resolve(null)
      ]);
  const adjustments = profilePage?.adjustments ?? workspacePage?.items ?? [];
  const firstInventoryLocation = formOptions?.inventoryLocations[0];
  const firstItem = formOptions?.items[0];
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
        {!profile && canCreateAdjustments ? (
          <div className="flex justify-end">
            <TaskSheet title="Create Adjustment" description="Document the controlled correction, evidence, and affected lines." trigger={<span>Create Adjustment</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
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
                  openingBalanceEvidenceRequired={
                    formOptions.policy.openingBalanceEvidenceRequired
                  }
                  reasonCodes={formOptions.reasonCodes}
                />
              )}
            </TaskSheet>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {profile ? "Adjustment Exceptions" : "Adjustment Requests"}
              </h2>
              <p className="text-sm text-slate-500">
                {profile
                  ? `${profilePage?.totalItems ?? 0} pending, approved, posting, or returned adjustment exceptions at the selected inventory location`
                  : "Approval is non-posting; stock changes only after the separate Post Adjustment action. Post Adjustment writes ADJUSTMENT_IN, ADJUSTMENT_OUT, or OPENING_BALANCE_IN ledger movements. Opening balances are for controlled cutover baselines only."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {profile ? <ButtonLink href="/adjustments">View all adjustments</ButtonLink> : <Badge tone="info">{session.context.locationName}</Badge>}
              {canExportAdjustments ? (
                <ButtonLink
                  href={profile ? `/adjustments/export?dashboard=${profile}` : "/adjustments/export"}
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {profile ? (
            <div className="border-b border-slate-100 bg-blue-50 p-4 text-sm text-slate-700">
              Showing the dashboard exception population only: pending approval, approved,
              posting, and returned adjustments for the selected inventory location. This
              read-only profile does not grant adjustment or inventory actions; any action
              opened from a record is re-authorized by its controlled server workflow.
            </div>
          ) : null}
          {adjustments.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={profile ? "No adjustment exceptions" : "No stock adjustment requests yet"}
                description={profile
                  ? "No pending, approved, posting, or returned adjustment requests are in the selected inventory-location scope."
                  : "Record a proposed increase or decrease when inventory needs a documented correction or opening baseline that is not wastage, receiving shortage, or transfer loss."}
              />
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
          {((profile && adjustments.length > 0) || (!profile && workspacePage && workspacePage.totalItems > 0)) ? (
            <PaginationBar
              page={profile ? profilePage?.page ?? 1 : workspacePage?.page ?? 1}
              pageSize={profile ? profilePage?.pageSize ?? 25 : workspacePage?.pageSize ?? 25}
              totalItems={profile ? profilePage?.totalItems ?? adjustments.length : workspacePage?.totalItems ?? 0}
              itemLabel="adjustments"
              getPageHref={(nextPage) => profile ? stockAdjustmentDashboardProfileHref(profile, nextPage) : `/adjustments?page=${nextPage}`}
            />
          ) : null}
        </section>

      </div>
    </AppShell>
  );
}
