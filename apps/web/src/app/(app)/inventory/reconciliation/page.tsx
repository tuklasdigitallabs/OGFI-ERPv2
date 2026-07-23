import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Boxes, Search, ShieldAlert } from "lucide-react";
import { Badge, ButtonLink, EmptyState, PaginationBar, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  inventoryDashboardProfileHref,
  listInventoryLedgerVarianceProfilePage,
  maxInventorySearchLength,
  resolveInventoryDashboardProfile
} from "@/server/services/inventory";
import { getDashboardTrustGatePolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

type ReconciliationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(getSearchParam(searchParams, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function formatSignedQuantity(value: number) {
  return `${value > 0 ? "+" : ""}${formatQuantity(value)}`;
}

export default async function InventoryReconciliationPage({
  searchParams
}: ReconciliationPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const hasRequiredPermissions =
    session.permissionCodes.includes(permissions.inventoryBalanceView) &&
    session.permissionCodes.includes(permissions.inventoryLedgerView);
  if (!hasRequiredPermissions) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const profileParam = getSearchParam(params, "dashboard");
  const profile = resolveInventoryDashboardProfile(profileParam);
  if (!profile) {
    return (
      <AppShell
        session={session}
        title="Inventory Reconciliation unavailable"
        subtitle="The requested diagnostic profile is unsupported or retired"
        activeNav="inventory"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Inventory Reconciliation is unavailable"
            description="This dashboard link cannot be opened safely. Return to Overview for the current diagnostic link, or deliberately open Stock Balances without applying reconciliation filters."
          />
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href="/dashboard" className="min-h-11">Back to Overview</ButtonLink>
            <ButtonLink href="/inventory" tone="secondary" className="min-h-11">
              Open Stock Balances
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }

  const query = (getSearchParam(params, "q") ?? "").trim();
  if (query.length > maxInventorySearchLength) {
    return (
      <AppShell
        session={session}
        title="Ledger Variance Reconciliation"
        subtitle={`${session.context.companyName} / ${session.context.locationName}`}
        activeNav="inventory"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="Search is too long"
            description={`Use no more than ${maxInventorySearchLength} characters and search by item code or item name. No reconciliation data was read for this request.`}
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink href={inventoryDashboardProfileHref(profile)} className="min-h-11">
              Clear search
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }

  const requestedPage = getPage(params);
  const [profilePage, trustGate] = await Promise.all([
    listInventoryLedgerVarianceProfilePage(session, {
      page: requestedPage,
      ...(query ? { query } : {})
    }),
    getDashboardTrustGatePolicy(session)
  ]);
  const returnHref = inventoryDashboardProfileHref(profile, {
    page: profilePage.page,
    ...(profilePage.query ? { query: profilePage.query } : {})
  });
  const exportParams = new URLSearchParams({ dashboard: profile });
  if (profilePage.query) exportParams.set("q", profilePage.query);
  if (profilePage.page > 1) exportParams.set("page", String(profilePage.page));
  const exportHref = `/inventory/reconciliation/export?${exportParams.toString()}`;
  const isTrustBlocked = trustGate.mode === "block";

  return (
    <AppShell
      session={session}
      title="Ledger Variance Reconciliation"
      subtitle="Read-only comparison of cached balances with the authoritative ledger"
      activeNav="inventory"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ButtonLink href="/dashboard" tone="ghost" className="ogfi-chip min-h-11">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Overview
        </ButtonLink>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/inventory" tone="secondary" className="min-h-11">
            <Boxes aria-hidden="true" className="h-4 w-4" />
            Open Stock Balances
          </ButtonLink>
          <ButtonLink href={exportHref} tone="secondary" className="min-h-11">
            Export diagnostic CSV
          </ButtonLink>
        </div>
      </div>

      <Panel
        className={`mb-5 border p-5 ${
          isTrustBlocked
            ? "border-red-300 bg-red-50"
            : trustGate.mode === "warn_and_link"
              ? "border-amber-300 bg-amber-50"
              : "border-blue-200 bg-blue-50"
        }`}
      >
        <div className="flex items-start gap-3">
          {isTrustBlocked ? (
            <ShieldAlert aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-red-700" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isTrustBlocked ? "danger" : "warning"}>
                {isTrustBlocked ? "UNTRUSTED" : "Diagnostic read"}
              </Badge>
              {isTrustBlocked ? <Badge tone="danger">NOT FOR OPERATIONAL DECISION</Badge> : null}
              <Badge tone="neutral">{session.context.companyName}</Badge>
              <Badge tone="neutral">{session.context.locationName}</Badge>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">
              {isTrustBlocked
                ? "Ledger-derived inventory figures are currently blocked from decision-ready dashboard use. These rows remain available only to diagnose the trust failure."
                : "The ledger is authoritative. This diagnostic compares its posted movement total with the cached balance at the selected location."}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-700">
              As of {new Date(profilePage.generatedAt).toLocaleString()} · Trust policy: {trustGate.label}. Values are normalized to six decimal places.
            </p>
          </div>
        </div>
      </Panel>

      <section className="ogfi-data-surface">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Variance diagnostics</h2>
            <p className="text-sm text-slate-500">
              Only non-zero cached-balance minus ledger differences are shown
            </p>
          </div>
          {!isTrustBlocked ? (
            <Badge tone={profilePage.totalItems > 0 ? "warning" : "success"}>
              {profilePage.totalItems} variance row{profilePage.totalItems === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge tone="danger">Diagnostic rows only</Badge>
          )}
        </div>

        <form
          className="ogfi-filter-bar grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
          method="get"
        >
          <input name="dashboard" type="hidden" value={profile} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search variance rows
            <input
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
              defaultValue={profilePage.query ?? ""}
              maxLength={maxInventorySearchLength}
              name="q"
              placeholder="Item code or item name"
            />
          </label>
          <div className="flex items-end">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
              type="submit"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              Search
            </button>
          </div>
          <div className="flex items-end">
            <ButtonLink
              href={inventoryDashboardProfileHref(profile)}
              tone="secondary"
              className="min-h-11 w-full sm:w-auto"
            >
              Clear
            </ButtonLink>
          </div>
        </form>

        {profilePage.items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={profilePage.query ? "No matching variance rows" : "No ledger variances found"}
              description={
                profilePage.query
                  ? "No current variance row matches this item search in the selected location. Clear the search to review the full diagnostic population."
                  : "Cached balances and ledger-derived quantities currently agree to six decimal places for every compared key in this location."
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="hidden border-b border-slate-100 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500 md:grid md:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_8rem_8rem_8rem_9rem_10rem] md:gap-3">
              <span>Item</span>
              <span>Storage / lot</span>
              <span>Cached</span>
              <span>Ledger</span>
              <span>Variance</span>
              <span>UOM / expiry</span>
              <span>Trace</span>
            </div>
            <div className="divide-y divide-slate-100">
              {profilePage.items.map((row) => {
                const traceHref = `${row.traceHref}${row.traceHref.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnHref)}`;
                return (
                  <article
                    key={row.key}
                    className="ogfi-list-row grid gap-3 text-sm md:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_8rem_8rem_8rem_9rem_10rem] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">{row.itemName}</p>
                      <p className="text-xs text-slate-500">{row.itemCode}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400 md:hidden">Storage / lot</p>
                      <p className="font-medium text-slate-800">{row.inventoryLocationName}</p>
                      <p className="text-xs text-slate-500">{row.lotNumber ?? "No lot"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400 md:hidden">Cached</p>
                      <p className="font-semibold text-slate-900">{formatQuantity(row.balanceQuantity)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400 md:hidden">Ledger</p>
                      <p className="font-semibold text-slate-900">{formatQuantity(row.ledgerQuantity)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400 md:hidden">Variance</p>
                      <p className="font-bold text-rose-700">{formatSignedQuantity(row.varianceQuantity)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400 md:hidden">UOM / expiry</p>
                      <p className="font-medium text-slate-800">{row.baseUomCode}</p>
                      <p className="text-xs text-slate-500">{row.expiryDate ?? "No expiry"}</p>
                    </div>
                    <ButtonLink
                      href={traceHref}
                      tone="secondary"
                      size="sm"
                      className="min-h-11 w-full whitespace-nowrap border border-blue-200 bg-blue-50 px-3 text-xs font-bold !text-blue-800 hover:bg-blue-100"
                    >
                      View ledger trace
                    </ButtonLink>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {profilePage.totalItems > 0 ? (
          <PaginationBar
            page={profilePage.page}
            pageSize={profilePage.pageSize}
            totalItems={profilePage.totalItems}
            itemLabel="variance rows"
            controlClassName="min-h-11"
            getPageHref={(nextPage) =>
              inventoryDashboardProfileHref(profile, {
                page: nextPage,
                ...(profilePage.query ? { query: profilePage.query } : {})
              })
            }
          />
        ) : null}
      </section>

      <Panel className="mt-5 border-slate-200 bg-slate-50 p-5">
        <h2 className="font-bold text-slate-950">Read-only correction guidance</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This profile cannot repair stock, set a balance, post an adjustment, approve a variance, or reverse a movement. Use the exact ledger trace to investigate the source. If a correction is justified, complete it through the applicable receiving, transfer, wastage, stock-count, adjustment, or reversal workflow with its required permission, reason, evidence, approval, and audit history.
        </p>
      </Panel>
    </AppShell>
  );
}
