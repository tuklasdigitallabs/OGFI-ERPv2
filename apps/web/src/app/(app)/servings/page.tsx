import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, PaginationBar } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { ServingsWorkspaceTabs } from "@/components/ServingsWorkspaceTabs";
import {
  canUseRestaurantConsumption,
  getGrantedPermissionCodes,
  getDefaultAppRoute,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { getRestaurantConsumptionWorkspace } from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

const servingStatuses = [
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "DERIVATION_BLOCKED",
  "READY_TO_POST",
  "POSTING",
  "POSTED",
  "REVERSED",
  "CANCELLED",
] as const;

function tone(status: string) {
  if (["POSTED", "READY_TO_POST"].includes(status)) return "success" as const;
  if (["SUBMITTED", "DERIVATION_BLOCKED", "RETURNED"].includes(status))
    return "warning" as const;
  if (["REVERSED", "CANCELLED"].includes(status)) return "danger" as const;
  return "info" as const;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function servingsHref(
  filters: {
    query?: string | undefined;
    status?: string | undefined;
    businessDateFrom?: string | undefined;
    businessDateTo?: string | undefined;
  },
  page = 1,
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.businessDateFrom) params.set("from", filters.businessDateFrom);
  if (filters.businessDateTo) params.set("to", filters.businessDateTo);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/servings?${query}` : "/servings";
}

export default async function ServingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!canUseRestaurantConsumption(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  const params = searchParams ? await searchParams : {};
  const rawStatus = firstParam(params.status)?.trim();
  const rawFrom = firstParam(params.from)?.trim();
  const rawTo = firstParam(params.to)?.trim();
  const rawPage = firstParam(params.page);
  const normalizedStatus = servingStatuses.find(
    (status) => status === rawStatus,
  );
  const filters = {
    query: firstParam(params.q)?.trim().slice(0, 120) || undefined,
    status: normalizedStatus,
    businessDateFrom:
      rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : undefined,
    businessDateTo:
      rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : undefined,
  };
  const workspace = await getRestaurantConsumptionWorkspace(session, {
    ...filters,
    page: rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1,
    pageSize: 25,
  });
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  const canCreate = grantedPermissionCodes.includes(
    permissions.consumptionCreate,
  );
  const canConfigure = grantedPermissionCodes.includes(
    permissions.consumptionConfigure,
  );
  const counts = workspace.statusCounts;

  return (
    <AppShell
      session={session}
      activeNav="servings"
      title="Servings & Consumption"
      subtitle="Verified menu servings and controlled expected inventory depletion"
    >
      <div className="grid gap-5">
        <ServingsWorkspaceTabs
          active="declarations"
          permissionCodes={grantedPermissionCodes}
        />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Draft", counts.DRAFT ?? 0],
            [
              "Needs verification",
              (counts.SUBMITTED ?? 0) + (counts.DERIVATION_BLOCKED ?? 0),
            ],
            ["Ready to post", counts.READY_TO_POST ?? 0],
            ["Posted", counts.POSTED ?? 0],
          ].map(([label, value]) => (
            <article className="ogfi-data-surface p-4" key={String(label)}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
            </article>
          ))}
        </section>

        {!workspace.configuration ? (
          <section className="ogfi-data-surface p-5">
            <EmptyState
              title="Consumption posting is not configured for this branch"
              description="An authorized administrator must map the branch inventory issue location, service periods, menu recipes, and activate this branch before staff can record servings."
            />
            <div className="mt-4 flex justify-center">
              <ButtonLink href="/servings/settings">
                {canConfigure
                  ? "Configure branch"
                  : "View branch configuration"}
              </ButtonLink>
            </div>
          </section>
        ) : (
          <section className="ogfi-data-surface p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-950">
                  Branch control is active
                </p>
                <p className="text-sm text-slate-500">
                  {workspace.configuration.defaultIssueInventoryLocation.name} ·{" "}
                  {workspace.configuration.timezone} · configuration v
                  {workspace.configuration.version}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/servings/settings" tone="secondary">
                  Branch configuration
                </ButtonLink>
                {canCreate ? (
                  <ButtonLink href="/servings/new">Record servings</ButtonLink>
                ) : null}
              </div>
            </div>
          </section>
        )}

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Serving declarations
              </h2>
              <p className="text-sm text-slate-500">
                Daily and shift facts remain separate from the controlled
                inventory-post command.
              </p>
            </div>
          </div>
          <form
            action="/servings"
            className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(14rem,1fr)_12rem_11rem_11rem_auto_auto] md:items-end"
            method="get"
          >
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Search declarations
              <input
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                defaultValue={filters.query}
                name="q"
                placeholder="Menu item, code, or service period"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Status
              <select
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
                defaultValue={filters.status ?? ""}
                name="status"
              >
                <option value="">All statuses</option>
                {servingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              From
              <input
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                defaultValue={filters.businessDateFrom}
                name="from"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              To
              <input
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                defaultValue={filters.businessDateTo}
                name="to"
                type="date"
              />
            </label>
            <button
              className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white"
              type="submit"
            >
              Apply filters
            </button>
            <ButtonLink href="/servings" tone="secondary">
              Clear
            </ButtonLink>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              {workspace.totalItems.toLocaleString()} declaration
              {workspace.totalItems === 1 ? "" : "s"} match these filters
            </span>
            <ButtonLink
              href={`/servings/export${servingsHref(filters).replace("/servings", "")}`}
              tone="secondary"
            >
              Export expected consumption
            </ButtonLink>
          </div>
          {workspace.declarations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No serving declarations"
                description="Record the first service period after branch configuration is active."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {workspace.declarations.map((declaration: any) => (
                <a
                  className="grid min-h-16 gap-2 px-4 py-3 hover:bg-blue-50 md:grid-cols-[9rem_9rem_minmax(12rem,1fr)_9rem_auto] md:items-center"
                  href={`/servings/${declaration.id}`}
                  key={declaration.id}
                >
                  <span className="font-semibold text-slate-950">
                    {new Date(declaration.businessDate)
                      .toISOString()
                      .slice(0, 10)}
                  </span>
                  <span className="text-sm text-slate-600">
                    {declaration.servicePeriodCode}
                  </span>
                  <span className="text-sm text-slate-600">
                    {declaration.lines.length} menu line
                    {declaration.lines.length === 1 ? "" : "s"} ·{" "}
                    {declaration.lines
                      .reduce(
                        (sum: number, line: any) =>
                          sum + Number(line.quantityServed),
                        0,
                      )
                      .toLocaleString()}{" "}
                    servings
                    {declaration.posting?.allocations?.length
                      ? ` · ${declaration.posting.allocations.reduce((sum: number, allocation: any) => sum + Number(allocation.quantityBaseUom), 0).toLocaleString()} base units posted`
                      : ""}
                  </span>
                  <Badge tone={tone(declaration.status)}>
                    {declaration.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="text-sm font-semibold text-blue-700">
                    Open
                  </span>
                </a>
              ))}
            </div>
          )}
          {workspace.totalItems > 0 ? (
            <PaginationBar
              getPageHref={(page) => servingsHref(filters, page)}
              itemLabel="serving declarations"
              page={workspace.page}
              pageSize={workspace.pageSize}
              totalItems={workspace.totalItems}
            />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
