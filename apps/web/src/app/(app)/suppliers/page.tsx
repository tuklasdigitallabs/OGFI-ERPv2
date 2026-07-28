import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { Badge, Panel, PaginationBar, WorkspaceTabs } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { UrlOwnedTaskSheet } from "@/components/UrlOwnedTaskSheet";
import {
  UrlOwnedActionTaskSheet,
  type UrlOwnedActionState
} from "@/components/UrlOwnedActionTaskSheet";
import {
  actionErrorRedirectPath,
  getActionErrorCode,
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
  getSupplierItemLinkLookup,
  listSuppliers,
  updateSupplierAccreditation
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

async function updateSupplierAccreditationAction(formData: FormData) {
  "use server";

  try {
    await updateSupplierAccreditation(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/suppliers", error));
  }
  revalidatePath("/suppliers");
  const supplierId = formData.get("supplierId");
  redirect(typeof supplierId === "string" ? `/suppliers?supplier=${supplierId}` : "/suppliers");
}

async function createSupplierItemLinkAction(
  _previousState: UrlOwnedActionState,
  formData: FormData
): Promise<UrlOwnedActionState> {
  "use server";

  try {
    await createSupplierItemLink(formData);
  } catch (error) {
    const code = getActionErrorCode(error);
    return {
      feedback: getActionFeedback({ error: code }),
      status: "error"
    };
  }
  revalidatePath("/suppliers");
  return {
    feedback: getActionFeedback({ success: "SUPPLIER_ITEM_LINK_CREATED" }),
    status: "success"
  };
}

async function deactivateSupplierItemLinkAction(
  _previousState: UrlOwnedActionState,
  formData: FormData
): Promise<UrlOwnedActionState> {
  "use server";

  try {
    await deactivateSupplierItemLink(formData);
  } catch (error) {
    const code = getActionErrorCode(error);
    return {
      feedback: getActionFeedback({ error: code }),
      status: "error"
    };
  }
  return {
    feedback: getActionFeedback({ success: "SUPPLIER_ITEM_LINK_DEACTIVATED" }),
    status: "success"
  };
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

function accreditationLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function accreditationTone(status: string) {
  if (status === "APPROVED") {
    return "success";
  }
  if (status === "BLOCKED") {
    return "danger";
  }
  if (status === "SUSPENDED") {
    return "warning";
  }
  return "info";
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback({ error: params.error });
  const supplierQuery = firstParam(params.query) ?? "";
  const supplierStatus = firstParam(params.status);
  const supplierAccreditationStatus = firstParam(params.accreditationStatus);
  const supplierPageValue = Number(firstParam(params.page) ?? "1");
  const supplierAction = firstParam(params.supplierAction);
  const selectedSupplierId = firstParam(params.supplier);
  const supplierTabValue = firstParam(params.tab);
  const supplierTab = supplierTabValue === "catalog" || supplierTabValue === "accreditation" || supplierTabValue === "audit"
    ? supplierTabValue
    : "overview";
  const linkAction = firstParam(params.linkAction) === "create" ? "create" : null;
  const selectedSupplierItemLinkId = firstParam(params.selectedSupplierItemLinkId);
  const itemLinkQuery = firstParam(params.itemLinkQuery) ?? "";
  const itemLinkPage = Number(firstParam(params.itemLinkPage) ?? "1");
  const selectedItemId = firstParam(params.selectedItemId);
  const uomLinkQuery = firstParam(params.uomLinkQuery) ?? "";
  const uomLinkPage = Number(firstParam(params.uomLinkPage) ?? "1");
  const selectedUomId = firstParam(params.selectedUomId);
  const [supplierData] = await Promise.all([
    listSuppliers(session, {
      query: supplierQuery,
      status: supplierStatus === "ACTIVE" || supplierStatus === "INACTIVE" ? supplierStatus : undefined,
      accreditationStatus: supplierAccreditationStatus && ["PENDING_REVIEW", "APPROVED", "SUSPENDED", "BLOCKED"].includes(supplierAccreditationStatus)
        ? supplierAccreditationStatus as "PENDING_REVIEW" | "APPROVED" | "SUSPENDED" | "BLOCKED"
        : undefined,
      page: Number.isFinite(supplierPageValue) && supplierPageValue > 0 ? Math.min(supplierPageValue, 10_000) : 1,
      pageSize: 25
    })
  ]);
  const suppliers = supplierData.suppliers;
  const approvedCount = suppliers.filter((supplier) => supplier.accreditationStatus === "APPROVED").length;
  const activeItemLinkCount = suppliers.reduce((count, supplier) => count + supplier.itemLinkCount, 0);
  const catalogQuery = firstParam(params.catalogQuery) ?? "";
  const catalogStatus = firstParam(params.catalogStatus);
  const catalogCategory = firstParam(params.catalogCategory);
  const catalogCategoryQuery = firstParam(params.catalogCategoryQuery) ?? "";
  const catalogCategoryPage = Number(firstParam(params.catalogCategoryPage) ?? "1");
  const catalogPage = Number(firstParam(params.catalogPage) ?? "1");
  const hasSupplierFilters = Boolean(supplierQuery || supplierStatus || supplierAccreditationStatus);
  const selectedSupplierCatalog = selectedSupplierId && supplierTab === "catalog"
    ? await getSupplierCatalog(session, selectedSupplierId, {
        query: catalogQuery,
        status:
          catalogStatus === "ACTIVE" || catalogStatus === "INACTIVE"
            ? catalogStatus
            : "ALL",
        ...(catalogCategory ? { categoryId: catalogCategory } : {}),
        categoryQuery: catalogCategoryQuery,
        categoryPage: Number.isFinite(catalogCategoryPage) ? catalogCategoryPage : 1,
        categoryPageSize: 25,
        page: Number.isFinite(catalogPage) ? catalogPage : 1,
        pageSize: 25
      })
    : null;
  const selectedSupplier = selectedSupplierCatalog?.supplier
    ?? supplierData.suppliers.find((supplier) => supplier.id === selectedSupplierId)
    ?? null;
  const selectedSupplierItemLink = selectedSupplierCatalog?.itemLinks.find(
    (link) => link.id === selectedSupplierItemLinkId
  ) ?? null;
  const selectedLinkAction =
    selectedSupplier?.status === "ACTIVE" && linkAction === null && selectedSupplierItemLinkId
      ? "deactivate"
      : null;
  const selectedSupplierLinkLookup =
    selectedSupplier?.status === "ACTIVE" && linkAction === "create"
      ? await getSupplierItemLinkLookup(session, selectedSupplier.id, {
          itemQuery: itemLinkQuery,
          itemPage: Number.isFinite(itemLinkPage) && itemLinkPage > 0 ? itemLinkPage : 1,
          ...(selectedItemId ? { selectedItemId } : {}),
          uomQuery: uomLinkQuery,
          uomPage: Number.isFinite(uomLinkPage) && uomLinkPage > 0 ? uomLinkPage : 1,
          ...(selectedUomId ? { selectedUomId } : {}),
          pageSize: 25
      })
      : null;
  const catalogBaseParams = new URLSearchParams();
  if (selectedSupplierId) {
    catalogBaseParams.set("supplier", selectedSupplierId);
    catalogBaseParams.set("tab", "catalog");
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
  if (catalogCategoryQuery) catalogBaseParams.set("catalogCategoryQuery", catalogCategoryQuery);
  if (catalogCategoryPage > 1) catalogBaseParams.set("catalogCategoryPage", String(catalogCategoryPage));
  if (supplierQuery) catalogBaseParams.set("query", supplierQuery);
  if (supplierStatus) catalogBaseParams.set("status", supplierStatus);
  if (supplierAccreditationStatus) catalogBaseParams.set("accreditationStatus", supplierAccreditationStatus);
  if (supplierPageValue > 1) catalogBaseParams.set("page", String(supplierPageValue));
  const catalogPageHref = (page: number) => {
    const nextParams = new URLSearchParams(catalogBaseParams);
    nextParams.set("catalogPage", String(page));
    return `/suppliers?${nextParams.toString()}`;
  };
  const catalogCategoryPageHref = (page: number) => {
    const nextParams = new URLSearchParams(catalogBaseParams);
    if (catalogPage > 1) nextParams.set("catalogPage", String(catalogPage));
    nextParams.set("catalogCategoryPage", String(page));
    return `/suppliers?${nextParams.toString()}`;
  };
  const clearCatalogFiltersHref = () => {
    const nextParams = new URLSearchParams({ supplier: selectedSupplierId ?? "", tab: "catalog" });
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (supplierPageValue > 1) nextParams.set("page", String(supplierPageValue));
    return `/suppliers?${nextParams.toString()}`;
  };
  const supplierActionHref = (supplierId: string, action?: "accreditation" | "deactivate") => {
    const nextParams = new URLSearchParams({ supplier: supplierId });
    nextParams.set("tab", action === "accreditation" || action === "deactivate" ? "accreditation" : "overview");
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (supplierPageValue > 1) nextParams.set("page", String(supplierPageValue));
    if (action) nextParams.set("supplierAction", action);
    return `/suppliers?${nextParams.toString()}`;
  };
  const supplierRegisterHref = () => {
    const nextParams = new URLSearchParams();
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (supplierPageValue > 1) nextParams.set("page", String(supplierPageValue));
    return nextParams.size ? `/suppliers?${nextParams.toString()}` : "/suppliers";
  };
  const supplierLinkActionHref = (supplierId: string) => {
    const nextParams = new URLSearchParams({ supplier: supplierId, tab: "catalog", linkAction: "create" });
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (catalogQuery) nextParams.set("catalogQuery", catalogQuery);
    if (catalogStatus) nextParams.set("catalogStatus", catalogStatus);
    if (catalogCategory) nextParams.set("catalogCategory", catalogCategory);
    if (catalogCategoryQuery) nextParams.set("catalogCategoryQuery", catalogCategoryQuery);
    if (catalogCategoryPage > 1) nextParams.set("catalogCategoryPage", String(catalogCategoryPage));
    if (catalogPage > 1) nextParams.set("catalogPage", String(catalogPage));
    if (itemLinkQuery) nextParams.set("itemLinkQuery", itemLinkQuery);
    if (itemLinkPage > 1) nextParams.set("itemLinkPage", String(itemLinkPage));
    if (selectedItemId) nextParams.set("selectedItemId", selectedItemId);
    if (uomLinkQuery) nextParams.set("uomLinkQuery", uomLinkQuery);
    if (uomLinkPage > 1) nextParams.set("uomLinkPage", String(uomLinkPage));
    if (selectedUomId) nextParams.set("selectedUomId", selectedUomId);
    return `/suppliers?${nextParams.toString()}`;
  };
  const supplierItemLinkActionHref = (supplierId: string, linkId?: string) => {
    const nextParams = new URLSearchParams({ supplier: supplierId, tab: "catalog" });
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (catalogQuery) nextParams.set("catalogQuery", catalogQuery);
    if (catalogStatus) nextParams.set("catalogStatus", catalogStatus);
    if (catalogCategory) nextParams.set("catalogCategory", catalogCategory);
    if (catalogCategoryQuery) nextParams.set("catalogCategoryQuery", catalogCategoryQuery);
    if (catalogCategoryPage > 1) nextParams.set("catalogCategoryPage", String(catalogCategoryPage));
    if (catalogPage > 1) nextParams.set("catalogPage", String(catalogPage));
    if (linkId) nextParams.set("selectedSupplierItemLinkId", linkId);
    return `/suppliers?${nextParams.toString()}`;
  };
  const supplierWorkspaceHref = (supplierId: string, tab: "overview" | "catalog" | "accreditation" | "audit") => {
    const nextParams = new URLSearchParams({ supplier: supplierId, tab });
    if (supplierQuery) nextParams.set("query", supplierQuery);
    if (supplierStatus) nextParams.set("status", supplierStatus);
    if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
    if (supplierPageValue > 1) nextParams.set("page", String(supplierPageValue));
    if (tab === "catalog") {
      if (catalogQuery) nextParams.set("catalogQuery", catalogQuery);
      if (catalogStatus) nextParams.set("catalogStatus", catalogStatus);
      if (catalogCategory) nextParams.set("catalogCategory", catalogCategory);
      if (catalogCategoryQuery) nextParams.set("catalogCategoryQuery", catalogCategoryQuery);
      if (catalogCategoryPage > 1) nextParams.set("catalogCategoryPage", String(catalogCategoryPage));
      if (catalogPage > 1) nextParams.set("catalogPage", String(catalogPage));
    }
    return `/suppliers?${nextParams.toString()}`;
  };
  const supplierLookupPageHref = (supplierId: string, kind: "item" | "uom", page: number) => {
    const nextParams = new URLSearchParams(supplierLinkActionHref(supplierId).split("?")[1] ?? "");
    nextParams.set(kind === "item" ? "itemLinkPage" : "uomLinkPage", String(page));
    return `/suppliers?${nextParams.toString()}`;
  };
  const selectedSupplierAction = supplierAction === "accreditation" || supplierAction === "deactivate" ? supplierAction : null;

  return (
    <AppShell
      session={session}
      title="Suppliers"
      subtitle="Company-scoped supplier master data"
      activeNav="suppliers"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className={selectedSupplier ? "ogfi-coordination-cue hidden lg:block" : "ogfi-coordination-cue"}>
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
      <div className={selectedSupplier ? "mb-5 hidden gap-4 md:grid-cols-4 lg:grid" : "mb-5 grid gap-4 md:grid-cols-4"}>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Suppliers</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{supplierData.suppliersPage.totalSuppliers}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Approved</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{approvedCount}</p>
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

      <div className={selectedSupplier ? "mb-5 hidden flex-wrap justify-end gap-2 lg:flex" : "mb-5 flex flex-wrap justify-end gap-2"}>
        <EntryModal title="Create Supplier" triggerLabel="Create Supplier" triggerClassName="min-h-11">
          <form action={createSupplierAction} className="ogfi-form-shell mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Supplier code
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="supplierCode" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Legal name
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="legalName" required />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Trading name
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="tradingName" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Tax identifier
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="taxIdentifier" />
              </label>
              {supplierData.canViewSupplierConfidential ? (
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Payment terms
                  <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="paymentTerms" />
                </label>
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600" role="status"><p className="font-semibold text-slate-800">Payment terms: Restricted</p><p className="mt-1 text-xs">Confidential supplier terms cannot be viewed or entered with the current permission.</p></div>
              )}
            </div>
            <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Primary contact
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="primaryContactName" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact role
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="primaryContactRole" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact email
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="primaryContactEmail" type="email" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Contact phone
                <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="primaryContactPhone" />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Creation reason
              <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="reason" required />
            </label>
            <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              Create Supplier
            </button>
          </form>
        </EntryModal>
        {/* Supplier-item creation is available in the selected-supplier composer below. */}
        <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900" role="status">
          Link a supplier item from a selected supplier catalog. The global action is intentionally unavailable while the bounded lookup composer is used.
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <section className="ogfi-data-surface order-2 lg:order-1" data-testid="supplier-register-workspace">
          <div className="ogfi-section-header">
            <div>
              <h2 id="supplier-register-heading" className="text-lg font-bold text-slate-950" tabIndex={-1}>Supplier Register</h2>
              <p className="text-sm text-slate-500">
                Company-scoped list with catalog health, not the full catalog
              </p>
            </div>
            <Badge tone="info">Master data</Badge>
          </div>
          <form method="get" className="grid gap-2 border-b border-slate-100 bg-slate-50 p-4 md:grid-cols-[1fr_180px_180px_auto]">
            <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="query" defaultValue={supplierQuery} placeholder="Search supplier code or name" aria-label="Search suppliers" />
            <select className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="status" defaultValue={supplierStatus ?? ""} aria-label="Filter supplier lifecycle">
              <option value="">All lifecycle</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            </select>
            <select className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="accreditationStatus" defaultValue={supplierAccreditationStatus ?? ""} aria-label="Filter accreditation">
              <option value="">All accreditation</option><option value="PENDING_REVIEW">Pending review</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option><option value="BLOCKED">Blocked</option>
            </select>
            <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Apply filters</button>
          </form>
          {suppliers.length === 0 ? (
            <div className="ogfi-empty-state">
              <p className="font-semibold text-slate-900">{hasSupplierFilters ? "No suppliers match the current filters" : "No suppliers configured"}</p>
              <p className="mt-1 text-sm text-slate-600">
                {hasSupplierFilters
                  ? "Clear or change the supplier filters to view other company-scoped records."
                  : "Add active suppliers before quotation comparison and purchase orders are enabled."}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <table className="w-full table-fixed text-left text-sm" data-testid="supplier-desktop-table">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr><th className="w-[15%] px-4 py-3">Code / terms</th><th className="w-[18%] px-4 py-3">Supplier</th><th className="w-[17%] px-4 py-3">Primary contact</th><th className="w-[22%] px-4 py-3">Catalog summary</th><th className="w-[13%] px-4 py-3">Status</th><th className="w-[15%] px-4 py-3">Control</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id} data-testid="supplier-row" className="align-top hover:bg-slate-50/70">
                        <td className="break-words px-4 py-4"><p className="font-bold text-slate-950">{supplier.supplierCode}</p><p className="mt-1 text-xs text-slate-500">{supplierData.canViewSupplierConfidential ? supplier.paymentTerms ?? "Not configured" : "Restricted"}</p></td>
                        <td className="break-words px-4 py-4"><p className="font-semibold text-slate-800">{supplier.tradingName ?? supplier.legalName}</p><p className="mt-1 text-xs text-slate-500">{supplier.legalName}</p></td>
                        <td className="break-words px-4 py-4"><p className="font-medium text-slate-700">{supplier.primaryContact?.name ?? "No primary contact"}</p><p className="mt-1 text-xs text-slate-500">{supplier.primaryContact?.email ?? supplier.primaryContact?.phone ?? "Not configured"}</p></td>
                        <td className="break-words px-4 py-4"><p className="font-semibold text-blue-800">{supplier.itemLinkCount} catalog item{supplier.itemLinkCount === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-slate-500">{supplier.itemLinks.length ? `Preview: ${supplier.itemLinks.map((link) => `${link.itemName} / ${link.purchaseUomCode}`).join(", ")}${supplier.itemLinkCount > supplier.itemLinks.length ? "…" : ""}` : "No catalog links yet."}</p><Link className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-blue-700 hover:underline" href={supplierWorkspaceHref(supplier.id, "catalog")}>View catalog<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></Link></td>
                        <td className="px-4 py-4"><div className="flex flex-col items-start gap-2"><Badge tone={accreditationTone(supplier.accreditationStatus)}>{accreditationLabel(supplier.accreditationStatus)}</Badge><Badge tone={supplier.status === "ACTIVE" ? "success" : "neutral"}>{supplier.status === "ACTIVE" ? "Lifecycle active" : "Lifecycle inactive"}</Badge></div></td>
                        <td className="px-4 py-4">{supplier.status === "ACTIVE" ? <div className="flex flex-col gap-2"><Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-white px-3 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50" href={supplierActionHref(supplier.id, "accreditation")}>Open controls</Link><Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-white px-3 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50" href={supplierActionHref(supplier.id, "deactivate")}>Deactivate</Link></div> : <p className="text-xs text-slate-500">Retained read-only history</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden" data-testid="supplier-responsive-cards">
                {suppliers.map((supplier) => (
                  <article key={supplier.id} data-testid="supplier-card" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-base font-bold text-slate-950">{supplier.tradingName ?? supplier.legalName}</p><p className="mt-1 break-words text-xs text-slate-500">{supplier.supplierCode} · {supplier.legalName}</p></div><Badge tone={supplier.status === "ACTIVE" ? "success" : "neutral"}>{supplier.status}</Badge></div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
                      <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Accreditation</dt><dd className="mt-1 break-words text-slate-800">{accreditationLabel(supplier.accreditationStatus)}</dd></div>
                      <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Payment terms</dt><dd className="mt-1 break-words text-slate-800">{supplierData.canViewSupplierConfidential ? supplier.paymentTerms ?? "Not configured" : "Restricted"}</dd></div>
                      <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Primary contact</dt><dd className="mt-1 break-words text-slate-800">{supplier.primaryContact?.name ?? "Not configured"}</dd><dd className="break-words text-xs text-slate-500">{supplier.primaryContact?.email ?? supplier.primaryContact?.phone ?? ""}</dd></div>
                      <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Catalog</dt><dd className="mt-1 text-slate-800">{supplier.itemLinkCount} item{supplier.itemLinkCount === 1 ? "" : "s"}</dd></div>
                    </dl>
                    <p className="mt-4 break-words text-xs text-slate-500">{supplier.itemLinks.length ? `Preview: ${supplier.itemLinks.map((link) => `${link.itemName} / ${link.purchaseUomCode}`).join(", ")}${supplier.itemLinkCount > supplier.itemLinks.length ? "…" : ""}` : "No catalog links yet."}</p>
                    <div className="mt-4 grid gap-2"><Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700" href={supplierWorkspaceHref(supplier.id, "catalog")}>View catalog</Link>{supplier.status === "ACTIVE" ? <div className="grid grid-cols-2 gap-2"><Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" href={supplierActionHref(supplier.id, "accreditation")}>Open controls</Link><Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700" href={supplierActionHref(supplier.id, "deactivate")}>Deactivate</Link></div> : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Inactive supplier retained as read-only history.</p>}</div>
                  </article>
                ))}
              </div>
            </>
          )}
          {supplierData.suppliersPage.totalSuppliers > 0 ? (
            <PaginationBar
              page={supplierData.suppliersPage.page}
              pageSize={supplierData.suppliersPage.pageSize}
              totalItems={supplierData.suppliersPage.totalSuppliers}
              itemLabel="suppliers"
              getPageHref={(nextPage) => {
                const nextParams = new URLSearchParams({ page: String(nextPage) });
                if (supplierQuery) nextParams.set("query", supplierQuery);
                if (supplierStatus) nextParams.set("status", supplierStatus);
                if (supplierAccreditationStatus) nextParams.set("accreditationStatus", supplierAccreditationStatus);
                return `/suppliers?${nextParams.toString()}`;
              }}
            />
          ) : null}
        </section>
        {selectedSupplier ? (
          <section className="ogfi-data-surface order-1 lg:order-2" data-testid="selected-supplier-workspace">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Selected supplier workspace</h2>
                <p className="text-sm text-slate-500">{selectedSupplier.tradingName ?? selectedSupplier.legalName} · {selectedSupplier.supplierCode}</p>
              </div>
              <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 hover:underline" href={supplierRegisterHref()}>Close supplier</Link>
            </div>
            <div className="grid gap-3 border-b border-slate-100 bg-blue-50/40 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div><p className="text-xs font-bold uppercase text-blue-700">Company</p><p className="mt-1 break-words font-semibold text-slate-950">{session.context.companyName}</p></div>
              <div><p className="text-xs font-bold uppercase text-blue-700">Supplier</p><p className="mt-1 break-words font-semibold text-slate-950">{selectedSupplier.supplierCode}</p></div>
              <div><p className="text-xs font-bold uppercase text-blue-700">Scope</p><p className="mt-1 text-slate-700">Company-wide supplier master</p></div>
              <div><p className="text-xs font-bold uppercase text-blue-700">Status</p><p className="mt-1 text-slate-700">{accreditationLabel(selectedSupplier.accreditationStatus)} · {selectedSupplier.status}</p></div>
              <div><p className="text-xs font-bold uppercase text-blue-700">Next action</p><p className="mt-1 text-slate-700">{selectedSupplier.status === "ACTIVE" ? "Review catalog or accreditation" : "Read-only retained history"}</p></div>
            </div>
            <WorkspaceTabs
              itemClassName="min-h-11"
              items={[
                { label: "Overview", href: supplierWorkspaceHref(selectedSupplier.id, "overview"), active: supplierTab === "overview" },
                { label: "Catalog", href: supplierWorkspaceHref(selectedSupplier.id, "catalog"), active: supplierTab === "catalog" },
                { label: "Accreditation", href: supplierWorkspaceHref(selectedSupplier.id, "accreditation"), active: supplierTab === "accreditation" },
                { label: "Audit", href: supplierWorkspaceHref(selectedSupplier.id, "audit"), active: supplierTab === "audit" }
              ]}
            />
            {supplierTab === "overview" ? (
              <div className="grid gap-3 p-5 md:grid-cols-3">
                <div><p className="text-xs font-bold uppercase text-slate-400">Lifecycle</p><p className="mt-1 font-semibold text-slate-900">{selectedSupplier.status}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Accreditation</p><p className="mt-1 font-semibold text-slate-900">{accreditationLabel(selectedSupplier.accreditationStatus)}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Next action</p><p className="mt-1 text-sm text-slate-700">{selectedSupplier.status === "ACTIVE" ? "Review catalog or accreditation controls" : "Retained history; no new sourcing"}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Primary contact</p><p className="mt-1 text-sm text-slate-700">{selectedSupplier.primaryContact?.name ?? "Not configured"}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Payment terms</p><p className="mt-1 break-words text-sm text-slate-700">{supplierData.canViewSupplierConfidential ? selectedSupplier.paymentTerms ?? "Not configured" : "Restricted"}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Catalog links</p><p className="mt-1 font-semibold text-slate-900">{"itemLinkCount" in selectedSupplier ? selectedSupplier.itemLinkCount : "Open Catalog"}</p></div>
              </div>
            ) : null}
            {supplierTab === "audit" ? (
              <div className="p-5 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">Supplier audit history is available in Admin Audit.</p>
                <p className="mt-1">This read-only handoff does not expose raw event metadata here. Use the bounded, redacted Admin Audit workspace for the authoritative company-scoped history.</p>
                <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 font-semibold text-blue-700 hover:bg-slate-50" href={`/admin?tab=audit&entityType=Supplier&entityId=${selectedSupplier.id}`}>Open Admin Audit</Link>
              </div>
            ) : null}
            {supplierTab === "accreditation" && selectedSupplier.status === "ACTIVE" ? (
              <div className="border-t border-slate-100 bg-blue-50/40 px-5 py-4">
                <div className="mb-3"><h3 className="font-bold text-slate-950">Update supplier accreditation</h3><p className="text-sm text-slate-600">Only the selected supplier is affected.</p></div>
                <form action={updateSupplierAccreditationAction} className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto] md:items-end">
                  <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Accreditation status<select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" defaultValue={selectedSupplier.accreditationStatus} name="accreditationStatus" required><option value="PENDING_REVIEW">Pending review</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option><option value="BLOCKED">Blocked</option></select></label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Reason<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="reason" minLength={5} required /></label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Evidence reference<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="evidenceReference" /></label>
                  <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-bold text-white">Save</button>
                </form>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slate-700 hover:underline" href={supplierActionHref(selectedSupplier.id, "deactivate")}>Open supplier deactivation controls</Link>
              </div>
            ) : null}
            {supplierTab === "accreditation" && selectedSupplier.status !== "ACTIVE" ? (
              <div className="border-t border-slate-100 bg-slate-50 p-5 text-sm text-slate-700" role="status">
                <p className="font-semibold text-slate-950">Inactive supplier retained as read-only history.</p>
                <p className="mt-1">Accreditation and lifecycle controls are unavailable because this supplier is inactive. Audit history remains available from the Audit tab.</p>
              </div>
            ) : null}
          </section>
        ) : null}
        {selectedSupplierCatalog && selectedSupplier && supplierTab === "catalog" ? (
          <section className="ogfi-data-surface order-1 lg:order-2" data-testid="supplier-catalog-workspace">
            <div className="ogfi-section-header">
              <div>
                <h2 id="supplier-catalog-heading" className="text-lg font-bold text-slate-950" tabIndex={-1}>
                  {selectedSupplier.tradingName ?? selectedSupplier.legalName} Catalog
                </h2>
                <p className="text-sm text-slate-500">
                  Full supplier-item maintenance surface with searchable, paged results
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                href={supplierRegisterHref()}
              >
                Close catalog
              </Link>
            </div>

            {selectedSupplierAction === "accreditation" && selectedSupplier.status === "ACTIVE" ? (
              <div className="border-b border-slate-100 bg-blue-50/40 px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-950">Update supplier accreditation</h3>
                    <p className="text-sm text-slate-600">The selected supplier is the only record affected.</p>
                  </div>
                  <Link className="text-sm font-semibold text-blue-700 hover:underline" href={supplierActionHref(selectedSupplier.id)}>Close controls</Link>
                </div>
                <form action={updateSupplierAccreditationAction} className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto] md:items-end">
                  <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Accreditation status
                    <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3" defaultValue={selectedSupplier.accreditationStatus} name="accreditationStatus" required>
                      <option value="PENDING_REVIEW">Pending review</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option><option value="BLOCKED">Blocked</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Reason
                    <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="reason" minLength={5} required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Evidence reference
                    <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="evidenceReference" placeholder="Supplier file or review note" />
                  </label>
                  <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Save</button>
                </form>
              </div>
            ) : null}
            {selectedSupplierAction === "deactivate" && selectedSupplier.status === "ACTIVE" ? (
              <div className="border-b border-slate-100 bg-amber-50/60 px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-950">Deactivate supplier</h3>
                    <p className="text-sm text-slate-600">History is retained and PO accreditation is suspended.</p>
                  </div>
                  <Link className="text-sm font-semibold text-blue-700 hover:underline" href={supplierActionHref(selectedSupplier.id)}>Close controls</Link>
                </div>
                <form action={deactivateSupplierAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Deactivation reason
                    <input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" name="reason" minLength={5} required />
                  </label>
                  <button className="min-h-11 rounded-md bg-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-800">Deactivate supplier</button>
                </form>
              </div>
            ) : null}

            {selectedLinkAction === "deactivate" ? (
              selectedSupplierItemLink && selectedSupplierItemLink.status === "ACTIVE" ? (
                <UrlOwnedActionTaskSheet
                  action={deactivateSupplierItemLinkAction}
                  title="Deactivate supplier-item link"
                  size="default"
                  description="This keeps history and prevents new sourcing from using the selected supplier-item link."
                  returnHref={supplierItemLinkActionHref(selectedSupplier.id)}
                  focusTargetId={`supplier-link-control-${selectedSupplierItemLink.id}`}
                  successFocusTargetId="supplier-catalog-heading"
                  formId="deactivate-supplier-item-link-form"
                  formClassName="ogfi-form-shell grid gap-4"
                  submitLabel="Deactivate link"
                  pendingSubmitLabel="Deactivating link…"
                  pendingLiveMessage="Deactivating the selected supplier-item link…"
                  draftStorageKey={`supplier-link-deactivate:${session.user.id}:${selectedSupplier.id}:${selectedSupplierItemLink.id}`}
                  formChildren={(
                    <>
                    <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                    <input name="supplierItemLinkId" type="hidden" value={selectedSupplierItemLink.id} />
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-950">{selectedSupplierItemLink.itemName}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {selectedSupplierItemLink.itemCode} · {selectedSupplierItemLink.purchaseUomCode} · {selectedSupplierItemLink.status}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">Only this selected link is affected. The server rechecks supplier, company, tenant, and active status.</p>
                    </div>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">
                      Deactivation reason
                      <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm" name="reason" minLength={5} required />
                    </label>
                    </>
                  )}
                />
              ) : (
                <UrlOwnedTaskSheet
                  title="Deactivate supplier-item link"
                  size="default"
                  description="This keeps history and prevents new sourcing from using the selected supplier-item link."
                  returnHref={supplierItemLinkActionHref(selectedSupplier.id)}
                  focusTargetId="supplier-catalog-heading"
                  cancelLabel="Return to catalog"
                >
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    This link is unavailable in the current supplier, filter, or page context. Return to the catalog and select an active link.
                  </p>
                </UrlOwnedTaskSheet>
              )
            ) : null}

            {selectedSupplier.status === "ACTIVE" && !selectedSupplierLinkLookup ? (
              <div className="border-b border-slate-100 bg-blue-50/40 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-950">Link an item to this supplier</h3>
                    <p className="text-sm text-slate-600">Searchable item and purchase-UOM lookups are scoped to the selected company.</p>
                  </div>
                  <Link id="create-supplier-link-trigger" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" href={supplierLinkActionHref(selectedSupplier.id)}>
                    Create supplier-item link
                  </Link>
                </div>
              </div>
            ) : null}

            {selectedSupplierLinkLookup ? (
              <UrlOwnedActionTaskSheet
                action={createSupplierItemLinkAction}
                title="Create supplier-item link"
                description={`${session.context.companyName} · ${selectedSupplier.supplierCode} · ${selectedSupplier.tradingName ?? selectedSupplier.legalName}. Only this active supplier is affected.`}
                returnHref={supplierItemLinkActionHref(selectedSupplier.id)}
                focusTargetId="create-supplier-link-trigger"
                size="workspace"
                formId="create-supplier-item-link-form"
                formClassName="mt-5 grid gap-3"
                submitLabel="Link supplier item"
                pendingSubmitLabel="Linking supplier item…"
                pendingLiveMessage="Creating the selected supplier-item link…"
                preserveSelectionParams={[
                  { selectName: "itemId", paramName: "selectedItemId" },
                  { selectName: "purchaseUomId", paramName: "selectedUomId" }
                ]}
                submitDisabled={selectedSupplierLinkLookup.items.options.length === 0 || selectedSupplierLinkLookup.uoms.options.length === 0}
                draftStorageKey={`supplier-link-create:${session.user.id}:${selectedSupplier.id}`}
                beforeForm={(
                  <div className="grid gap-5">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                  <p className="font-bold">Company-scoped link task</p>
                  <p className="mt-1">Search and page through bounded active item and purchase-UOM records. Catalog and Supplier Register context remain unchanged when this task closes.</p>
                </div>
                <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input name="supplier" type="hidden" value={selectedSupplier.id} />
                  <input name="tab" type="hidden" value="catalog" />
                  <input name="linkAction" type="hidden" value="create" />
                  {supplierQuery ? <input name="query" type="hidden" value={supplierQuery} /> : null}
                  {supplierStatus ? <input name="status" type="hidden" value={supplierStatus} /> : null}
                  {supplierAccreditationStatus ? <input name="accreditationStatus" type="hidden" value={supplierAccreditationStatus} /> : null}
                  {supplierPageValue > 1 ? <input name="page" type="hidden" value={supplierPageValue} /> : null}
                  {catalogQuery ? <input name="catalogQuery" type="hidden" value={catalogQuery} /> : null}
                  {catalogStatus ? <input name="catalogStatus" type="hidden" value={catalogStatus} /> : null}
                  {catalogCategory ? <input name="catalogCategory" type="hidden" value={catalogCategory} /> : null}
                  {catalogCategoryQuery ? <input name="catalogCategoryQuery" type="hidden" value={catalogCategoryQuery} /> : null}
                  {catalogCategoryPage > 1 ? <input name="catalogCategoryPage" type="hidden" value={catalogCategoryPage} /> : null}
                  {catalogPage > 1 ? <input name="catalogPage" type="hidden" value={catalogPage} /> : null}
                  {selectedItemId ? <input name="selectedItemId" type="hidden" value={selectedItemId} /> : null}
                  {selectedUomId ? <input name="selectedUomId" type="hidden" value={selectedUomId} /> : null}
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Search item
                    <input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" name="itemLinkQuery" defaultValue={itemLinkQuery} placeholder="Item name or code" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Search purchase UOM
                    <input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" name="uomLinkQuery" defaultValue={uomLinkQuery} placeholder="UOM code or name" />
                  </label>
                  <button className="min-h-11 self-end rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Search lookups</button>
                </form>
                  </div>
                )}
                formChildren={(
                  <>
                  <input name="supplierId" type="hidden" value={selectedSupplier.id} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Item
                      <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" defaultValue={selectedItemId ?? ""} name="itemId" required>
                        <option value="">Select an item</option>
                        {selectedSupplierLinkLookup.items.options.map((item) => <option key={item.id} value={item.id}>{item.itemName} / {item.itemCode}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Purchase UOM
                      <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" defaultValue={selectedUomId ?? ""} name="purchaseUomId" required>
                        <option value="">Select a purchase UOM</option>
                        {selectedSupplierLinkLookup.uoms.options.map((uom) => <option key={uom.id} value={uom.id}>{uom.uomCode} / {uom.uomName}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Supplier SKU<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" name="supplierSku" /></label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Supplier item name<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" name="supplierItemName" /></label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Lead days<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" min="0" name="leadTimeDays" type="number" /></label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Preferred rank<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" min="0" name="preferredRank" type="number" /></label>
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Minimum order quantity<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" min="0.000001" name="minOrderQty" step="0.000001" type="number" /></label>
                    {selectedSupplierCatalog.canViewSupplierConfidential ? (
                      <>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">Reference unit price<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" data-sensitive="true" min="0.000001" name="unitPrice" step="0.000001" type="number" /></label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">Price effective from<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" data-sensitive="true" name="effectiveFrom" type="date" /></label>
                      </>
                    ) : (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 md:col-span-2" role="status"><p className="font-semibold text-slate-800">Reference price: Restricted</p><p className="mt-1 text-xs">Confidential supplier pricing cannot be viewed or entered with the current permission.</p></div>
                    )}
                    <label className="grid gap-1 text-sm font-medium text-slate-700">Link reason<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" minLength={5} name="reason" required /></label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <span>Items: page {selectedSupplierLinkLookup.items.page} of {Math.max(1, Math.ceil(selectedSupplierLinkLookup.items.totalItems / selectedSupplierLinkLookup.items.pageSize))} ({selectedSupplierLinkLookup.items.totalItems} matches)</span>
                    <span className="flex gap-3">
                      {selectedSupplierLinkLookup.items.hasPreviousPage ? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href={supplierLookupPageHref(selectedSupplier.id, "item", selectedSupplierLinkLookup.items.page - 1)}>Previous items</Link> : null}
                      {selectedSupplierLinkLookup.items.hasNextPage ? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href={supplierLookupPageHref(selectedSupplier.id, "item", selectedSupplierLinkLookup.items.page + 1)}>Next items</Link> : null}
                    </span>
                    <span>UOMs: page {selectedSupplierLinkLookup.uoms.page} of {Math.max(1, Math.ceil(selectedSupplierLinkLookup.uoms.totalItems / selectedSupplierLinkLookup.uoms.pageSize))} ({selectedSupplierLinkLookup.uoms.totalItems} matches)</span>
                    <span className="flex gap-3">
                      {selectedSupplierLinkLookup.uoms.hasPreviousPage ? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href={supplierLookupPageHref(selectedSupplier.id, "uom", selectedSupplierLinkLookup.uoms.page - 1)}>Previous UOMs</Link> : null}
                      {selectedSupplierLinkLookup.uoms.hasNextPage ? <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href={supplierLookupPageHref(selectedSupplier.id, "uom", selectedSupplierLinkLookup.uoms.page + 1)}>Next UOMs</Link> : null}
                    </span>
                  </div>
                  {selectedSupplierLinkLookup.items.options.length === 0 || selectedSupplierLinkLookup.uoms.options.length === 0 ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">No active item or purchase-UOM options match the current lookup. Adjust the searches before creating a link.</p> : null}
                  </>
                )}
              />
            ) : null}

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
                  {selectedSupplierCatalog.canViewSupplierConfidential ? selectedSupplier.paymentTerms ?? "Not configured" : "Restricted"}
                </p>
              </div>
            </div>

            <form
              action="/suppliers"
              className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[1.5fr_0.8fr_1fr_auto]"
            >
              <input name="supplier" type="hidden" value={selectedSupplier.id} />
              <input name="tab" type="hidden" value="catalog" />
              {supplierQuery ? <input name="query" type="hidden" value={supplierQuery} /> : null}
              {supplierStatus ? <input name="status" type="hidden" value={supplierStatus} /> : null}
              {supplierAccreditationStatus ? <input name="accreditationStatus" type="hidden" value={supplierAccreditationStatus} /> : null}
              {supplierPageValue > 1 ? <input name="page" type="hidden" value={supplierPageValue} /> : null}
              <label className="relative grid gap-1 text-sm font-medium text-slate-700">
                Search catalog
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400"
                />
                <input
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-9 text-sm"
                  defaultValue={catalogQuery}
                  name="catalogQuery"
                  placeholder="Item, SKU, supplier item"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  defaultValue={catalogStatus ?? ""}
                  name="catalogStatus"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Category
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
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
                <input
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  defaultValue={catalogCategoryQuery}
                  name="catalogCategoryQuery"
                  placeholder="Refine category options"
                  aria-label="Refine category options"
                />
                {selectedSupplierCatalog.categoriesPage.hasNextPage || selectedSupplierCatalog.categoriesPage.hasPreviousPage ? (
                  <span className="text-xs font-normal text-slate-500">
                    Showing category options {selectedSupplierCatalog.categoriesPage.page} of {Math.max(1, Math.ceil(selectedSupplierCatalog.categoriesPage.totalItems / selectedSupplierCatalog.categoriesPage.pageSize))}; refine search or use the arrows below.
                  </span>
                ) : null}
              </label>
              <div className="flex items-end gap-2">
                <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                  Apply
                </button>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  href={clearCatalogFiltersHref()}
                >
                  Clear
                </Link>
              </div>
            </form>

            <div className="hidden lg:block">
              <table className="w-full table-fixed text-left text-sm" data-testid="supplier-catalog-desktop-table">
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
                        <p className="font-semibold text-slate-950">{selectedSupplierCatalog.summary.totalCount === 0 ? "No catalog links configured" : "No catalog links match the current filters"}</p>
                        <p className="mt-1">{selectedSupplierCatalog.summary.totalCount === 0 ? selectedSupplier.status === "ACTIVE" ? "Create the first supplier-item link for this active supplier." : "This inactive supplier has no catalog history. New links are unavailable." : "Clear or change the catalog filters to view other retained links."}</p>
                      </td>
                    </tr>
                  ) : (
                    selectedSupplierCatalog.itemLinks.map((link) => (
                      <tr key={link.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <p className="break-words font-semibold text-slate-950">{link.itemName}</p>
                          <p className="mt-1 break-words text-xs text-slate-500">
                            {link.itemCode} / {link.categoryName}
                          </p>
                          {link.supplierItemName ? (
                            <p className="mt-2 break-words text-xs text-slate-500">
                              Supplier name: {link.supplierItemName}
                            </p>
                          ) : null}
                        </td>
                        <td className="break-words px-5 py-4 text-slate-700">
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
                          {!selectedSupplierCatalog.canViewSupplierConfidential ? (
                            <span className="text-slate-500">Restricted</span>
                          ) : link.latestPrice ? (
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
                          {selectedSupplier.status === "ACTIVE" && link.status === "ACTIVE" ? (
                            <Link
                              data-focus-key={`supplier-link-control-${link.id}`}
                              className="inline-flex min-h-11 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-950"
                              href={supplierItemLinkActionHref(selectedSupplier.id, link.id)}
                            >
                              Open controls
                            </Link>
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

            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden" data-testid="supplier-catalog-responsive-cards">
              {selectedSupplierCatalog.itemLinks.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 sm:col-span-2" role="status">
                  <p className="font-semibold text-slate-950">{selectedSupplierCatalog.summary.totalCount === 0 ? "No catalog links configured" : "No catalog links match the current filters"}</p>
                  <p className="mt-1">{selectedSupplierCatalog.summary.totalCount === 0 ? selectedSupplier.status === "ACTIVE" ? "Create the first supplier-item link for this active supplier." : "This inactive supplier has no catalog history. New links are unavailable." : "Clear or change the catalog filters to view other retained links."}</p>
                </div>
              ) : selectedSupplierCatalog.itemLinks.map((link) => (
                <article key={link.id} data-testid="supplier-catalog-card" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-bold text-slate-950">{link.itemName}</h3><p className="mt-1 break-words text-xs text-slate-500">{link.itemCode} · {link.categoryName}</p></div><Badge tone={link.status === "ACTIVE" ? "success" : "neutral"}>{link.status}</Badge></div>
                  {link.supplierItemName ? <p className="mt-3 break-words text-sm text-slate-700"><span className="font-semibold">Supplier name:</span> {link.supplierItemName}</p> : null}
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
                    <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Supplier SKU</dt><dd className="mt-1 break-words text-slate-800">{link.supplierSku ?? "Not set"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">UOM / MOQ</dt><dd className="mt-1 break-words text-slate-800">{link.purchaseUomCode} / {link.minOrderQty ?? "Not set"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Lead / rank</dt><dd className="mt-1 break-words text-slate-800">{link.leadTimeDays ?? "No"} lead days / Rank {link.preferredRank ?? "not set"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs font-bold uppercase text-slate-500">Reference price</dt><dd className="mt-1 break-words text-slate-800">{!selectedSupplierCatalog.canViewSupplierConfidential ? "Restricted" : link.latestPrice ? `${formatCurrency(link.latestPrice.unitPrice, link.latestPrice.currencyCode)} · Effective ${link.latestPrice.effectiveFrom}` : "No reference price"}</dd></div>
                  </dl>
                  <div className="mt-4">{selectedSupplier.status === "ACTIVE" && link.status === "ACTIVE" ? <Link data-focus-key={`supplier-link-control-${link.id}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" href={supplierItemLinkActionHref(selectedSupplier.id, link.id)}>Open controls</Link> : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{selectedSupplier.status === "ACTIVE" ? "Inactive link retained as read-only history." : "Supplier and catalog links are retained as read-only history."}</p>}</div>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
              <span>
                Showing {selectedSupplierCatalog.rangeStart}–{selectedSupplierCatalog.rangeEnd} of {selectedSupplierCatalog.filteredCount} filtered catalog items · Page {selectedSupplierCatalog.page} of {selectedSupplierCatalog.totalPages}
              </span>
              <div className="flex gap-2">
                {selectedSupplierCatalog.hasPreviousPage ? (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    href={catalogPageHref(selectedSupplierCatalog.page - 1)}
                  >
                    Previous
                  </Link>
                ) : null}
                {selectedSupplierCatalog.hasNextPage ? (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    href={catalogPageHref(selectedSupplierCatalog.page + 1)}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
            {selectedSupplierCatalog.categoriesPage.hasPreviousPage || selectedSupplierCatalog.categoriesPage.hasNextPage ? (
              <div className="flex justify-end gap-2 px-5 pb-4">
                {selectedSupplierCatalog.categoriesPage.hasPreviousPage ? (
                  <Link className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" href={catalogCategoryPageHref(selectedSupplierCatalog.categoriesPage.page - 1)}>
                    Previous category options
                  </Link>
                ) : null}
                {selectedSupplierCatalog.categoriesPage.hasNextPage ? (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                    href={catalogCategoryPageHref(selectedSupplierCatalog.categoriesPage.page + 1)}
                  >
                    Next category options
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
