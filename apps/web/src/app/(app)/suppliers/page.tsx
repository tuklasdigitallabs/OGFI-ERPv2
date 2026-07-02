import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, PackageSearch, Search } from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createSupplier,
  createSupplierItemLink,
  deactivateSupplier,
  deactivateSupplierItemLink,
  getSupplierCatalog,
  listSupplierItemLinkOptions,
  listSuppliers
} from "@/server/services/suppliers";

export const dynamic = "force-dynamic";

async function createSupplierAction(formData: FormData) {
  "use server";

  try {
    await createSupplier(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/suppliers", error));
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

async function deactivateSupplierAction(formData: FormData) {
  "use server";

  try {
    await deactivateSupplier(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/suppliers", error));
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

async function createSupplierItemLinkAction(formData: FormData) {
  "use server";

  try {
    await createSupplierItemLink(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/suppliers", error));
  }
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

async function deactivateSupplierItemLinkAction(formData: FormData) {
  "use server";

  try {
    await deactivateSupplierItemLink(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/suppliers", error));
  }
  revalidatePath("/suppliers");
  const supplierId = formData.get("supplierId");
  redirect(typeof supplierId === "string" ? `/suppliers?supplier=${supplierId}` : "/suppliers");
}

type SuppliersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(value);
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const [suppliers, linkOptions] = await Promise.all([
    listSuppliers(session),
    listSupplierItemLinkOptions(session)
  ]);
  const activeCount = suppliers.filter((supplier) => supplier.status === "ACTIVE").length;
  const activeItemLinkCount = suppliers.reduce(
    (count, supplier) => count + supplier.itemLinkCount,
    0
  );
  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const selectedSupplierId = firstParam(params.supplier);
  const catalogQuery = firstParam(params.catalogQuery) ?? "";
  const catalogStatus = firstParam(params.catalogStatus);
  const catalogCategory = firstParam(params.catalogCategory);
  const catalogPage = Number(firstParam(params.catalogPage) ?? "1");
  const selectedSupplierCatalog = selectedSupplierId
    ? await getSupplierCatalog(session, selectedSupplierId, {
        query: catalogQuery,
        status:
          catalogStatus === "ACTIVE" || catalogStatus === "INACTIVE"
            ? catalogStatus
            : "ALL",
        ...(catalogCategory ? { categoryId: catalogCategory } : {}),
        page: Number.isFinite(catalogPage) ? catalogPage : 1,
        pageSize: 25
      })
    : null;
  const selectedSupplier = selectedSupplierCatalog?.supplier ?? null;
  const catalogBaseParams = new URLSearchParams();
  if (selectedSupplierId) {
    catalogBaseParams.set("supplier", selectedSupplierId);
  }
  if (catalogQuery) {
    catalogBaseParams.set("catalogQuery", catalogQuery);
  }
  if (catalogStatus) {
    catalogBaseParams.set("catalogStatus", catalogStatus);
  }
  if (catalogCategory) {
    catalogBaseParams.set("catalogCategory", catalogCategory);
  }
  const catalogPageHref = (page: number) => {
    const nextParams = new URLSearchParams(catalogBaseParams);
    nextParams.set("catalogPage", String(page));
    return `/suppliers?${nextParams.toString()}`;
  };

  return (
    <AppShell
      session={session}
      title="Suppliers"
      subtitle="Company-scoped supplier master data"
      activeNav="suppliers"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Supplier master data is company-scoped.</strong> Supplier and
              catalog changes require reasoned actions and do not bypass quotation,
              purchase order, receiving, or payment controls.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Preferred/catalog information is reference data only until source-module
              workflows validate supplier eligibility and scope.
            </p>
          </div>
          <span>Master data</span>
        </div>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Suppliers</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{suppliers.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{activeCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Company</p>
          <p className="mt-2 text-lg font-bold text-slate-950">{session.context.companyName}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Item links</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{activeItemLinkCount}</p>
        </Panel>
      </div>

      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <EntryModal title="Create Supplier" triggerLabel="Create Supplier">
          <form action={createSupplierAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Supplier code
                <input className="rounded-md border border-slate-300 px-3 py-2" name="supplierCode" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Legal name
                <input className="rounded-md border border-slate-300 px-3 py-2" name="legalName" required />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Trading name
                <input className="rounded-md border border-slate-300 px-3 py-2" name="tradingName" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Tax identifier
                <input className="rounded-md border border-slate-300 px-3 py-2" name="taxIdentifier" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Payment terms
                <input className="rounded-md border border-slate-300 px-3 py-2" name="paymentTerms" />
              </label>
            </div>
            <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Primary contact
                <input className="rounded-md border border-slate-300 px-3 py-2" name="primaryContactName" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact role
                <input className="rounded-md border border-slate-300 px-3 py-2" name="primaryContactRole" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact email
                <input className="rounded-md border border-slate-300 px-3 py-2" name="primaryContactEmail" type="email" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact phone
                <input className="rounded-md border border-slate-300 px-3 py-2" name="primaryContactPhone" />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Creation reason
              <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
            </label>
            <button className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Supplier
            </button>
          </form>
        </EntryModal>
        <EntryModal title="Link Supplier Item" triggerLabel="Link Supplier Item">
          <form action={createSupplierItemLinkAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Supplier
                <select className="rounded-md border border-slate-300 px-3 py-2" name="supplierId" required>
                  {linkOptions.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplierCode} / {supplier.legalName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Item
                <select className="rounded-md border border-slate-300 px-3 py-2" name="itemId" required>
                  {linkOptions.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.itemName} / {item.itemCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Purchase UOM
                <select className="rounded-md border border-slate-300 px-3 py-2" name="purchaseUomId" required>
                  {linkOptions.uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.uomCode} / {uom.uomName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Supplier SKU
                <input className="rounded-md border border-slate-300 px-3 py-2" name="supplierSku" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Supplier item name
                <input className="rounded-md border border-slate-300 px-3 py-2" name="supplierItemName" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Lead days
                <input className="rounded-md border border-slate-300 px-3 py-2" min="0" name="leadTimeDays" type="number" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Rank
                <input className="rounded-md border border-slate-300 px-3 py-2" min="0" name="preferredRank" type="number" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                MOQ
                <input className="rounded-md border border-slate-300 px-3 py-2" min="0.000001" name="minOrderQty" step="0.000001" type="number" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Reference price
                <input className="rounded-md border border-slate-300 px-3 py-2" min="0.000001" name="unitPrice" step="0.000001" type="number" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Price effective from
                <input className="rounded-md border border-slate-300 px-3 py-2" name="effectiveFrom" type="date" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Link reason
                <input className="rounded-md border border-slate-300 px-3 py-2" name="reason" required />
              </label>
            </div>
            <button className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Link Supplier Item
            </button>
          </form>
        </EntryModal>
      </div>

      <div className="space-y-4">
        <section className="ogfi-data-surface">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Supplier Register</h2>
              <p className="text-sm text-slate-500">
                Company-scoped list with catalog health, not the full catalog
              </p>
            </div>
            <Badge tone="info">Master data</Badge>
          </div>
          <div className="hidden grid-cols-[0.8fr_1.2fr_1fr_1.3fr_0.7fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-400 md:grid">
            <span>Code</span>
            <span>Supplier</span>
            <span>Primary contact</span>
            <span>Catalog summary</span>
            <span>Status</span>
            <span>Control</span>
          </div>
          {suppliers.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">No suppliers configured</p>
              <p className="mt-1 text-sm text-slate-600">
                Add active suppliers before quotation comparison and purchase orders are enabled.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  data-testid="supplier-row"
                  className="ogfi-list-row grid gap-4 md:grid-cols-[0.8fr_1.2fr_1fr_1.3fr_0.7fr_auto] md:items-center"
                >
                  <div>
                    <p className="font-bold text-slate-950">{supplier.supplierCode}</p>
                    <p className="text-xs text-slate-500">{supplier.paymentTerms ?? "No terms configured"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{supplier.tradingName ?? supplier.legalName}</p>
                    <p className="text-xs text-slate-500">{supplier.legalName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {supplier.primaryContact?.name ?? "No primary contact"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {supplier.primaryContact?.email ?? supplier.primaryContact?.phone ?? ""}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
                        <PackageSearch aria-hidden="true" className="h-4 w-4" />
                        {supplier.itemLinkCount} catalog item{supplier.itemLinkCount === 1 ? "" : "s"}
                      </span>
                      <Link
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700"
                        href={`/suppliers?supplier=${supplier.id}`}
                      >
                        View catalog
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    {supplier.itemLinks.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">No catalog links yet.</p>
                    ) : (
                      <p className="mt-2 truncate text-xs text-slate-500">
                        Preview:{" "}
                        {supplier.itemLinks
                          .map((link) => `${link.itemName} / ${link.purchaseUomCode}`)
                          .join(", ")}
                        {supplier.itemLinkCount > supplier.itemLinks.length ? "..." : ""}
                      </p>
                    )}
                  </div>
                  <Badge tone={supplier.status === "ACTIVE" ? "success" : "neutral"}>{supplier.status}</Badge>
                  {supplier.status === "ACTIVE" ? (
                    <EntryModal
                      title="Deactivate Supplier"
                      triggerClassName="min-h-9 bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950"
                      triggerLabel="Deactivate"
                    >
                      <form action={deactivateSupplierAction} className="ogfi-form-shell mt-4 grid gap-3">
                        <input name="supplierId" type="hidden" value={supplier.id} />
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                          Deactivation reason
                          <input
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                            name="reason"
                            required
                          />
                        </label>
                        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                          Deactivate Supplier
                        </button>
                      </form>
                    </EntryModal>
                  ) : (
                    <span className="text-sm text-slate-500">Retained history</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        {selectedSupplierCatalog && selectedSupplier ? (
          <section className="ogfi-data-surface">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {selectedSupplier.tradingName ?? selectedSupplier.legalName} Catalog
                </h2>
                <p className="text-sm text-slate-500">
                  Full supplier-item maintenance surface with searchable, paged results
                </p>
              </div>
              <Link
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                href="/suppliers"
              >
                Close catalog
              </Link>
            </div>

            <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-400">Catalog items</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {selectedSupplierCatalog.summary.totalCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-400">Active</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {selectedSupplierCatalog.summary.activeCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-400">Categories</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {selectedSupplierCatalog.summary.categoryCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase text-slate-400">Terms</p>
                <p className="mt-2 text-sm font-bold text-slate-950">
                  {selectedSupplier.paymentTerms ?? "Not configured"}
                </p>
              </div>
            </div>

            <form
              action="/suppliers"
              className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1.5fr_0.8fr_1fr_auto]"
            >
              <input name="supplier" type="hidden" value={selectedSupplier.id} />
              <label className="relative grid gap-1 text-sm font-medium text-slate-700">
                Search catalog
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400"
                />
                <input
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-9 text-sm"
                  defaultValue={catalogQuery}
                  name="catalogQuery"
                  placeholder="Item, SKU, supplier item"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  defaultValue={catalogStatus ?? "ALL"}
                  name="catalogStatus"
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Category
                <select
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  defaultValue={catalogCategory ?? ""}
                  name="catalogCategory"
                >
                  <option value="">All categories</option>
                  {selectedSupplierCatalog.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.categoryName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                  Apply
                </button>
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  href={`/suppliers?supplier=${selectedSupplier.id}`}
                >
                  Reset
                </Link>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-[1100px] table-fixed text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase text-slate-400">
                  <tr>
                    <th className="w-[24%] px-5 py-3">Item</th>
                    <th className="w-[16%] px-5 py-3">Supplier SKU</th>
                    <th className="w-[12%] px-5 py-3">UOM / MOQ</th>
                    <th className="w-[14%] px-5 py-3">Lead / rank</th>
                    <th className="w-[16%] px-5 py-3">Reference price</th>
                    <th className="w-[10%] px-5 py-3">Status</th>
                    <th className="w-[8%] px-5 py-3">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedSupplierCatalog.itemLinks.length === 0 ? (
                    <tr>
                      <td className="px-5 py-8 text-center text-sm text-slate-500" colSpan={7}>
                        No catalog links match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    selectedSupplierCatalog.itemLinks.map((link) => (
                      <tr key={link.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">{link.itemName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {link.itemCode} / {link.categoryName}
                          </p>
                          {link.supplierItemName ? (
                            <p className="mt-2 text-xs text-slate-500">
                              Supplier name: {link.supplierItemName}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {link.supplierSku ?? "Not set"}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800">{link.purchaseUomCode}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            MOQ {link.minOrderQty ?? "not set"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800">
                            {link.leadTimeDays ?? "No"} lead days
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Rank {link.preferredRank ?? "not set"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {link.latestPrice ? (
                            <>
                              <p className="font-semibold text-slate-800">
                                {formatCurrency(
                                  link.latestPrice.unitPrice,
                                  link.latestPrice.currencyCode
                                )}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Effective {link.latestPrice.effectiveFrom}
                              </p>
                            </>
                          ) : (
                            <span className="text-slate-500">No reference price</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={link.status === "ACTIVE" ? "success" : "neutral"}>
                            {link.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          {link.status === "ACTIVE" ? (
                            <EntryModal
                              title="Deactivate Supplier Item Link"
                              triggerClassName="min-h-9 bg-white px-3 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950"
                              triggerLabel="Deactivate"
                            >
                              <form
                                action={deactivateSupplierItemLinkAction}
                                className="ogfi-form-shell mt-4 grid gap-3"
                              >
                                <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                                <input name="supplierItemLinkId" type="hidden" value={link.id} />
                                <p className="text-sm text-slate-600">
                                  This keeps history and prevents new sourcing from using this
                                  supplier-item link.
                                </p>
                                <label className="grid gap-1 text-sm font-medium text-slate-700">
                                  Deactivation reason
                                  <input
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    name="reason"
                                    required
                                  />
                                </label>
                                <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-700 px-3 text-sm font-bold text-white hover:bg-slate-800 sm:w-fit">
                                  Deactivate Link
                                </button>
                              </form>
                            </EntryModal>
                          ) : (
                            <span className="text-xs text-slate-500">Retained</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
              <span>
                Page {selectedSupplierCatalog.page} / showing up to{" "}
                {selectedSupplierCatalog.pageSize} catalog items
              </span>
              <div className="flex gap-2">
                {selectedSupplierCatalog.hasPreviousPage ? (
                  <Link
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    href={catalogPageHref(selectedSupplierCatalog.page - 1)}
                  >
                    Previous
                  </Link>
                ) : null}
                {selectedSupplierCatalog.hasNextPage ? (
                  <Link
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    href={catalogPageHref(selectedSupplierCatalog.page + 1)}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
