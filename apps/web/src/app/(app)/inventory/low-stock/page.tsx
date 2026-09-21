import { redirect } from "next/navigation";
import { Badge, ButtonLink, PaginationBar } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { InventoryProtectedReadState } from "@/components/InventoryProtectedReadState";
import { getSessionContext } from "@/server/services/context";
import { isInventoryQuantityReadProtected } from "@/server/services/inventoryQuantityRead";
import { getLowStockEditor, listLowStockPage, canManageLowStockThresholds } from "@/server/services/lowStock";
import { ThresholdForm } from "./ThresholdForm";

export const dynamic = "force-dynamic";

export default async function LowStockPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  const params = await searchParams ?? {};
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const viewAll = text("view") === "all";
  const editing = text("edit");
  const creating = text("new") === "1";
  const query = text("q").slice(0, 100);
  const href = (page: number) => `/inventory/low-stock?${new URLSearchParams({ view: viewAll ? "all" : "alerts", q: query, page: String(page) })}`;
  try {
    if (creating || editing) {
      const editor = await getLowStockEditor(session, editing || undefined);
      const threshold = editor.threshold;
      return <AppShell session={session} title={editing ? "Edit stock threshold" : "Set stock threshold"} subtitle={`${session.context.companyName} · ${session.context.locationName}`} activeNav="inventory">
        <div className="mb-4"><ButtonLink href="/inventory/low-stock?view=all" tone="secondary">Back to thresholds</ButtonLink></div>
        {editor.canManage ? <ThresholdForm locations={editor.inventoryLocations} initial={threshold ? {
          inventoryLocationId: threshold.inventoryLocationId, itemCode: threshold.item.itemCode,
          thresholdQuantity: threshold.thresholdQuantity.toString(), active: threshold.active,
          version: threshold.version, baseUomCode: threshold.item.baseUom.uomCode,
        } : undefined} /> : <p role="status">Read-only: editing requires item-edit permission and MANAGE access to this location or company.</p>}
        {threshold && <section className="mt-6 grid gap-2" aria-label="Recent threshold activity"><h2 className="font-semibold">Latest 10 threshold changes</h2><ul className="grid gap-2">{editor.history.map(event => <li key={event.id} className="border-b py-2 text-sm">{event.occurredAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Asia/Manila · {event.actor?.displayName ?? "System"} · {event.eventType.endsWith("created") ? "Created" : "Updated"}{event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) && typeof event.metadata.reason === "string" ? ` · ${event.metadata.reason}` : ""}</li>)}</ul></section>}
      </AppShell>;
    }
    const page = await listLowStockPage(session, { page: Number(text("page")) || 1, query, alertsOnly: !viewAll });
    const canManage = await canManageLowStockThresholds(session);
    return <AppShell session={session} title="Low stock and thresholds" subtitle={`${session.context.companyName} · ${session.context.brandName} · ${session.context.locationName}`} activeNav="inventory">
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2"><ButtonLink href="/inventory" tone="secondary">Stock balances</ButtonLink>{canManage && <ButtonLink href="/inventory/low-stock?new=1">Set stock threshold</ButtonLink>}</div>
        <p className="text-sm text-slate-600">Live recorded on-hand across all lots in each storage location. Switch the selected location to monitor the warehouse or a branch separately. Only configured thresholds are monitored; no thresholds means no coverage. This measure does not deduct reservations, quarantine, or stock in transit.</p>
        {text("saved") === "1" && <p role="status">Threshold saved and audit history recorded.</p>}
        {!canManage && <p className="text-sm text-slate-600">Read-only: threshold changes require item-edit permission and location/company MANAGE access.</p>}
        <nav aria-label="Low stock views" className="flex flex-wrap gap-2"><ButtonLink href="/inventory/low-stock" tone={viewAll ? "secondary" : "primary"}>Low-stock alerts</ButtonLink><ButtonLink href="/inventory/low-stock?view=all" tone={viewAll ? "primary" : "secondary"}>Configured thresholds</ButtonLink></nav>
        <form className="flex flex-wrap gap-2"><input type="hidden" name="view" value={viewAll ? "all" : "alerts"} /><label className="grid gap-2">Search item or storage<input name="q" maxLength={100} defaultValue={query} className="min-h-11 rounded-md border border-slate-300 px-3 py-2" /></label><button className="min-h-11 self-end rounded-md border border-slate-300 px-4 py-2">Search</button></form>
        <div className="flex flex-wrap items-center gap-4"><p className="text-sm">{page.totalItems} {viewAll ? "configured item/storage pairs" : "low-stock item/storage pairs"}. Low stock includes equality with the threshold.</p><ButtonLink href={`/inventory/low-stock/export?${new URLSearchParams({ view: viewAll ? "all" : "alerts", q: query })}`} tone="secondary">Export this view</ButtonLink></div>
        {page.items.length === 0 ? <p role="status">{viewAll ? "No thresholds match this view. Set thresholds for the items you want to monitor." : "No low-stock alerts match this view. Check configured thresholds to confirm monitoring coverage."}</p> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr>{["Item / storage", "Recorded on-hand", "Threshold", "Status", "Action"].map(label => <th key={label} className="border-b p-4">{label}</th>)}</tr></thead><tbody>{page.items.map(row => <tr key={row.id}>
            <td className="border-b p-4"><strong>{row.itemCode} · {row.itemName}</strong><div>{row.inventoryLocationName}</div>{row.balanceRows === 0 && <p className="text-amber-800">No balance recorded; initialize or reconcile inventory.</p>}</td>
            <td className="border-b p-4">{row.recordedOnHand} {row.baseUomCode}</td><td className="border-b p-4">{row.thresholdQuantity} {row.baseUomCode}</td>
            <td className="border-b p-4"><Badge tone={row.lowStock ? "warning" : "neutral"}>{!row.active ? "Deactivated" : !row.eligible ? "Inactive item/storage" : row.lowStock ? "Low stock" : "Above threshold"}</Badge></td>
            <td className="border-b p-4">{canManage ? <ButtonLink href={`/inventory/low-stock?edit=${row.id}`} tone="secondary">Edit threshold</ButtonLink> : "Read-only"}</td>
          </tr>)}</tbody></table></div>
          <div className="grid gap-4 md:hidden">{page.items.map(row => <article key={row.id} className="grid gap-2 rounded-lg border border-slate-200 p-4"><strong>{row.itemCode} · {row.itemName}</strong><p>{row.inventoryLocationName}</p><p>Recorded on-hand: {row.recordedOnHand} {row.baseUomCode}</p><p>Threshold: {row.thresholdQuantity} {row.baseUomCode}</p><p>{!row.active ? "Deactivated" : !row.eligible ? "Inactive item/storage" : row.lowStock ? "Low stock" : "Above threshold"}</p>{row.balanceRows === 0 && <p>No balance recorded; initialize or reconcile inventory.</p>}{canManage && <ButtonLink href={`/inventory/low-stock?edit=${row.id}`} tone="secondary">Edit threshold</ButtonLink>}</article>)}</div>
        </>}
        <PaginationBar page={page.page} pageSize={page.pageSize} totalItems={page.totalItems} itemLabel="item/storage pairs" getPageHref={href} controlClassName="min-h-11" />
      </div>
    </AppShell>;
  } catch (error) {
    if (isInventoryQuantityReadProtected(error)) return <InventoryProtectedReadState />;
    if (error instanceof Error && ["PERMISSION_DENIED", "SCOPE_DENIED", "LOW_STOCK_THRESHOLD_NOT_FOUND"].includes(error.message)) return <AppShell session={session} title="Low stock unavailable" subtitle="Access or record unavailable" activeNav="inventory"><p role="alert">This view is unavailable in your current permission and location scope.</p></AppShell>;
    throw error;
  }
}
