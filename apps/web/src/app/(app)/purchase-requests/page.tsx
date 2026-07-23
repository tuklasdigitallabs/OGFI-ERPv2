import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge, ButtonLink, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { TaskSheet } from "@/components/TaskSheet";
import { PurchaseRequestLinesEditor } from "@/components/PurchaseRequestLinesEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import {
  canUsePurchaseRequests,
  getDefaultAppRoute,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  createDraftPurchaseRequest,
  listPurchaseRequestDraftOptions,
  listPurchaseRequestPage,
  listPurchaseRequestsDashboardProfilePage,
  resolvePurchaseRequestDashboardProfile,
  type PurchaseRequestSlaStatus,
  type PurchaseRequestStatus,
} from "@/server/services/purchaseRequests";
import { canExportPurchaseRequests } from "@/server/services/exportAuthorization";
import { getPurchasingControlPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

async function createDraft(formData: FormData) {
  "use server";

  let request: Awaited<ReturnType<typeof createDraftPurchaseRequest>>;
  try {
    request = await createDraftPurchaseRequest(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/purchase-requests", error));
  }
  revalidatePath("/purchase-requests");
  redirect(`/purchase-requests/${request.id}`);
}

const statusOptions: Array<{
  label: string;
  value: PurchaseRequestStatus | "ALL";
}> = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Pending", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Returned", value: "RETURNED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

function normalizeStatus(value?: string): PurchaseRequestStatus | "ALL" {
  return statusOptions.some((option) => option.value === value)
    ? (value as PurchaseRequestStatus | "ALL")
    : "ALL";
}

function slaBadgeTone(status: PurchaseRequestSlaStatus) {
  if (status === "OVERDUE") {
    return "destructive" as const;
  }
  if (status === "DUE_TODAY") {
    return "warning" as const;
  }
  if (status === "ON_TRACK") {
    return "info" as const;
  }
  return "neutral" as const;
}

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; search?: string; status?: string; dashboard?: string; page?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUsePurchaseRequests(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const filters = await searchParams;
  const actionFeedback = getActionFeedback(filters);
  const dashboardProfile = resolvePurchaseRequestDashboardProfile(filters.dashboard);
  const requestedPage = Math.max(1, Number(filters.page) || 1);
  const selectedStatus = normalizeStatus(filters.status);
  const search = filters.search?.trim() ?? "";
  const exportParams = new URLSearchParams();
  if (dashboardProfile) {
    exportParams.set("dashboard", dashboardProfile);
  } else if (search) {
    exportParams.set("search", search);
  }
  if (!dashboardProfile && selectedStatus !== "ALL") {
    exportParams.set("status", selectedStatus);
  }
  const exportHref = `/purchase-requests/export${exportParams.size ? `?${exportParams.toString()}` : ""}`;
  const canExportPurchaseRequestCsv = canExportPurchaseRequests(session);
  const [dashboardProfilePage, workspaceRequests, draftOptions, purchasingPolicy] = await Promise.all([
    dashboardProfile
      ? listPurchaseRequestsDashboardProfilePage(session, dashboardProfile, requestedPage)
      : Promise.resolve(null),
    dashboardProfile ? Promise.resolve(null) : listPurchaseRequestPage(session, {
      status: selectedStatus,
      search,
    }, { page: requestedPage }),
    listPurchaseRequestDraftOptions(session),
    getPurchasingControlPolicy(session),
  ]);
  const requests = dashboardProfilePage?.items ?? workspaceRequests?.items ?? [];
  const canCreateDraft = session.permissionCodes.includes(
    permissions.purchaseRequestCreate,
  );

  return (
    <AppShell
      session={session}
      title="Purchase Requests"
      subtitle="Create, submit, and audit scoped branch requests"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />
      <div className="mb-5 ogfi-workflow-cue">
        <div className="flex flex-wrap gap-2">
          <span>Warehouse-first</span>
          <span>Request Stock</span>
          <span>Purchase Request when warehouse is unavailable</span>
        </div>
        <p className="mt-3 text-sm">
          <strong>Branch demand starts with stock availability control.</strong>{" "}
          Warehouse stock should move through Transfer Requests; unavailable stock
          continues through Purchase Request approval, quotation, PO, receiving,
          and ledger posting.
        </p>
        <p className="mt-2 text-xs text-blue-900/75">
          Current purchasing policy: standard approval from PHP{" "}
          {purchasingPolicy.standardApprovalThresholdPhp.toLocaleString("en-PH")},
          high-value review from PHP{" "}
          {purchasingPolicy.highValueApprovalThresholdPhp.toLocaleString("en-PH")},
          executive review from PHP{" "}
          {purchasingPolicy.seniorApprovalThresholdPhp.toLocaleString("en-PH")},
          emergency cap PHP{" "}
          {purchasingPolicy.emergencyMaxAmountPhp.toLocaleString("en-PH")}, and{" "}
          {purchasingPolicy.minimumQuotes} quote
          {purchasingPolicy.minimumQuotes === 1 ? "" : "s"} from PHP{" "}
          {purchasingPolicy.quotationRequiredThresholdPhp.toLocaleString("en-PH")}
          {" "}when quotation comparison is required.
        </p>
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Draft PRs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {requests.filter((request) => request.status === "DRAFT").length}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">
            Pending approval
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {
              requests.filter(
                (request) => request.status === "PENDING_APPROVAL",
              ).length
            }
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">
            Authorized location
          </p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.context.locationName}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold text-slate-500">Active role</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {session.user.role}
          </p>
        </Panel>
      </div>

      <div className="space-y-4">
        {canCreateDraft ? (
          <div className="flex justify-end">
            <TaskSheet title="Create Draft PR" description="Build and review request lines before creating the draft." trigger={<span>Create Purchase Request</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
              <PurchaseRequestLinesEditor
                action={createDraft}
                budgetLines={draftOptions.budgetLines}
                items={draftOptions.items}
                uoms={draftOptions.uoms}
              />
            </TaskSheet>
          </div>
        ) : null}

        <section className="min-w-0 space-y-4">
          <div className="ogfi-data-surface">
            {dashboardProfile ? (
              <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
                <p><strong>Dashboard filter: Open purchase requests.</strong> This list, its pages, and its export include Draft, Pending Approval, Approved, and Returned requests in the selected location.</p>
                <div className="flex flex-wrap gap-2">
                  {canExportPurchaseRequestCsv ? <ButtonLink href={exportHref} tone="secondary">Export CSV</ButtonLink> : null}
                  <ButtonLink href="/purchase-requests" tone="secondary">Clear dashboard filter</ButtonLink>
                </div>
              </div>
            ) : (
            <form className="ogfi-filter-bar grid gap-3 lg:grid-cols-[1fr_12rem_auto_auto] lg:items-end">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Search
                <input
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  defaultValue={search}
                  name="search"
                  placeholder="Request, item, purpose..."
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  defaultValue={selectedStatus}
                  name="status"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                Apply Filters
              </button>
              {canExportPurchaseRequestCsv ? (
                <ButtonLink
                  href={exportHref}
                  className="min-h-10 bg-slate-100 text-blue-700 hover:bg-blue-50"
                >
                  Export CSV
                </ButtonLink>
              ) : null}
            </form>
            )}
            <div className="ogfi-table-head hidden grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500 md:grid">
              <span>Request</span>
              <span>Item</span>
              <span>Required</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {requests.length === 0 ? (
              <div className="ogfi-empty-state">
                <p className="font-semibold text-slate-900">
                  No matching requests
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Adjust the filters or create a scoped draft request for this
                  location.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <div
                    key={request.id}
                    data-testid="purchase-request-row"
                    className="ogfi-list-row ogfi-table-row grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center"
                  >
                    <div>
                      <h3 className="font-bold text-slate-950">
                        {request.publicReference}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {session.context.locationName}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {request.lines[0]?.itemName ??
                          request.lines[0]?.description ??
                          "No lines"}
                      </p>
                      {request.lines[0]?.itemName ? (
                        <p className="text-xs text-slate-500">
                          {request.lines[0].description}
                        </p>
                      ) : null}
                      <div className="mt-1 grid gap-1 text-xs text-slate-500">
                        {request.lines.slice(0, 3).map((line) => (
                          <p key={line.id}>
                            {line.lineNumber}. {line.requestedQty}{" "}
                            {line.uomCode} / {line.purpose}
                          </p>
                        ))}
                        {request.lines.length > 3 ? (
                          <p className="font-medium text-slate-600">
                            +{request.lines.length - 3} more line
                            {request.lines.length - 3 === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {request.requiredDate}
                      </p>
                      {request.isEmergency ? (
                        <Badge tone={slaBadgeTone(request.slaStatus)} size="sm">
                          {request.slaLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <Badge
                      tone={request.status === "DRAFT" ? "neutral" : "warning"}
                    >
                      {request.status.replace("_", " ")}
                    </Badge>
                    <ButtonLink
                      href={`/purchase-requests/${request.id}`}
                      className="bg-slate-100 text-blue-700 hover:bg-blue-50"
                    >
                      View
                    </ButtonLink>
                  </div>
                ))}
              </div>
            )}
            {dashboardProfilePage ? (
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <p>Showing {(dashboardProfilePage.page - 1) * dashboardProfilePage.pageSize + (requests.length ? 1 : 0)}-{(dashboardProfilePage.page - 1) * dashboardProfilePage.pageSize + requests.length} of {dashboardProfilePage.totalCount} open purchase requests</p>
                <div className="flex items-center gap-2">
                  {dashboardProfilePage.page > 1 ? <ButtonLink href={`/purchase-requests?dashboard=${dashboardProfile}&page=${dashboardProfilePage.page - 1}`} tone="secondary">Previous</ButtonLink> : <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-400">Previous</span>}
                  <span className="font-semibold text-slate-700">Page {dashboardProfilePage.page} of {dashboardProfilePage.totalPages}</span>
                  {dashboardProfilePage.page < dashboardProfilePage.totalPages ? <ButtonLink href={`/purchase-requests?dashboard=${dashboardProfile}&page=${dashboardProfilePage.page + 1}`} tone="secondary">Next</ButtonLink> : <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-400">Next</span>}
                </div>
              </div>
            ) : null}
            {!dashboardProfile && workspaceRequests && workspaceRequests.totalItems > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-slate-600">Page {workspaceRequests.page} of {workspaceRequests.totalPages} · {workspaceRequests.totalItems} requests</span>
                <div className="flex gap-2">
                  {workspaceRequests.page > 1 ? <ButtonLink href={`/purchase-requests?${new URLSearchParams({ ...(search ? { search } : {}), ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}), page: String(workspaceRequests.page - 1) }).toString()}`} tone="secondary">Previous</ButtonLink> : null}
                  {workspaceRequests.page < workspaceRequests.totalPages ? <ButtonLink href={`/purchase-requests?${new URLSearchParams({ ...(search ? { search } : {}), ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}), page: String(workspaceRequests.page + 1) }).toString()}`} tone="secondary">Next</ButtonLink> : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
