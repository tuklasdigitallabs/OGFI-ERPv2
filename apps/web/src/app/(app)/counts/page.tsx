import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, ButtonLink } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
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
import { canExportStockCounts } from "@/server/services/exportAuthorization";
import {
  listStockCountFormOptions,
  listStockCounts,
  scheduleStockCount
} from "@/server/services/stockCounts";

export const dynamic = "force-dynamic";

type CountsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function scheduleStockCountAction(formData: FormData) {
  "use server";

  let countId: string;
  try {
    countId = await scheduleStockCount(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/counts", error));
  }
  revalidatePath("/counts");
  redirect(`/counts/${countId}`);
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

export default async function CountsPage({ searchParams }: CountsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const canAccessCounts = canUseStockCounts(session.permissionCodes);
  const canCreateCounts = session.permissionCodes.includes(
    permissions.stockCountCreate
  );
  const canExportCounts = canExportStockCounts(session);

  if (!canAccessCounts) {
    redirect(
      session.permissionCodes.includes(permissions.inventoryBalanceView)
        ? "/inventory"
        : getDefaultAppRoute(session.permissionCodes)
    );
  }

  const [counts, formOptions] = await Promise.all([
    listStockCounts(session),
    canCreateCounts ? listStockCountFormOptions(session) : Promise.resolve(null)
  ]);
  const firstInventoryLocation = formOptions?.inventoryLocations[0];
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);

  return (
    <AppShell
      session={session}
      title="Stock Counts"
      subtitle="Schedule, count, submit, and review physical counts without posting variance"
      activeNav="counts"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Snapshot</span>
          <span>Blind count</span>
          <span>Variance review</span>
          <span>Adjustment approval</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Counts do not post stock directly.</strong> Reviewed variances
          generate controlled Stock Adjustments for approval and separate ledger
          posting.
        </p>
      </div>
      <div className="space-y-4">
        {canCreateCounts ? (
          <div className="flex justify-end">
            <EntryModal title="Schedule Count" triggerLabel="Schedule Count">
              {!firstInventoryLocation ? (
                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  The current location needs an active inventory location before counts can
                  be scheduled.
                </div>
              ) : (
                <form action={scheduleStockCountAction} className="ogfi-form-shell mt-4 grid gap-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Count variances are calculated for review only. This does not adjust
                    stock or post ledger movements.
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Inventory location
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        defaultValue={firstInventoryLocation.id}
                        name="inventoryLocationId"
                        required
                      >
                        {formOptions?.inventoryLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Count type
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2"
                        defaultValue="CYCLE"
                        name="countType"
                        required
                      >
                        <option value="FULL">Full</option>
                        <option value="CYCLE">Cycle</option>
                        <option value="SPOT">Spot</option>
                        <option value="HIGH_VALUE">High value</option>
                        <option value="OPENING">Opening</option>
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Scheduled date
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      name="scheduledDate"
                      type="date"
                    />
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input defaultChecked name="blindCount" type="checkbox" value="true" />
                      Blind count
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input name="freezeMovements" type="checkbox" value="true" />
                      Freeze movement window
                    </label>
                  </div>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                    Schedule Count
                  </button>
                </form>
              )}
            </EntryModal>
          </div>
        ) : null}

        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Count Sessions</h2>
              <p className="text-sm text-slate-500">
                Variances are review-only until posting policy is approved
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone="info">{session.context.locationName}</Badge>
              {canExportCounts ? (
                <ButtonLink
                  href="/counts/export"
                  className="min-h-9 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {counts.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No count sessions yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Schedule a count to snapshot current stock and start blind count entry.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {counts.map((count) => (
                <div key={count.id} className="ogfi-list-row grid gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400">
                        {count.publicReference}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {count.inventoryLocationName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {count.countType} / {count.lineCount} line(s)
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <Badge tone={statusTone(count.status)}>{count.status}</Badge>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {count.varianceCount} variance line(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Created by {count.createdByName}</span>
                    <span>/</span>
                    <span>Scheduled {count.scheduledDate ?? "not set"}</span>
                    <span>/</span>
                    <span>Submitted {count.submittedAt ? "yes" : "no"}</span>
                  </div>
                  <div>
                    <ButtonLink
                      href={`/counts/${count.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      Open Count
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
