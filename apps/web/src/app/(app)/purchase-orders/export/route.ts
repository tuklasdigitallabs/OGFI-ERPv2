import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit
} from "@/server/services/exportAudit";
import { canExportPurchaseOrders } from "@/server/services/exportAuthorization";
import {
  listPurchaseOrders,
  listPurchaseOrdersDashboardProfile,
  normalizePurchaseOrderFilters,
  resolvePurchaseOrderDashboardProfile,
  type PurchaseOrderListFilters
} from "@/server/services/purchaseOrders";
import { getOperationalReportTrustContext } from "@/server/services/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }

  const url = new URL(request.url);
  const dashboardProfile = resolvePurchaseOrderDashboardProfile(
    url.searchParams.get("dashboard") ?? undefined
  );
  const filters: PurchaseOrderListFilters = normalizePurchaseOrderFilters({
    query: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    expectedFrom: url.searchParams.get("expectedFrom") ?? undefined,
    expectedTo: url.searchParams.get("expectedTo") ?? undefined,
    minAmount: url.searchParams.get("minAmount") ?? undefined,
    maxAmount: url.searchParams.get("maxAmount") ?? undefined,
    approver: url.searchParams.get("approver") ?? undefined
  });
  const trustContext = await getOperationalReportTrustContext(session);
  const auditMetadata = {
    companyId: session.context.companyId,
    companyName: session.context.companyName,
    brandId: session.context.brandId,
    brandName: session.context.brandName,
    locationId: session.context.locationId,
    locationName: session.context.locationName,
    locationType: session.context.locationType,
    filters: dashboardProfile ? { dashboardProfile } : filters,
    trustGateMode: trustContext.trustGateMode,
    trustGateLabel: trustContext.trustGateLabel,
    trustGateSourceDecisionId: trustContext.trustGateSourceDecisionId,
    requireScopeFilters: trustContext.requireScopeFilters
  };
  if (!canExportPurchaseOrders(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "purchase-order-status",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED",
      metadata: auditMetadata
    });
    return exportPermissionDeniedResponse();
  }

  await logOperationalExportAudit({
    session,
    reportId: "purchase-order-status",
    eventType: "report.export_started",
    metadata: auditMetadata
  });
  try {
    const orders = dashboardProfile
      ? await listPurchaseOrdersDashboardProfile(session, dashboardProfile)
      : await listPurchaseOrders(session, filters);
    if (!orders) {
      return new Response("Unknown dashboard profile", { status: 400 });
    }
    const rows = [
      [
        "PO Number",
        "Status",
        "Cancellation Subtype",
        "Cancellation Reason",
        "Cancelled At",
        "Supplier",
        "Supplier Code",
        "Purchase Request",
        "Quote Reference",
        "Delivery Location",
        "Expected Delivery",
        "Delivery Aging",
        "Days Overdue",
        "Currency",
        "Total Amount",
        "Line Count",
        "Ordered Qty",
        "Received Qty",
        "Closed/Cancelled Qty",
        "Open Qty",
        "Received Value",
        "Closed/Cancelled Value",
        "Open Value",
        "Current Approver",
        "Last Sent At",
        "Last Sent By",
        "Last Send Method",
        "Last Send Reference",
        "Created By",
        "Created At"
      ],
      ...orders.map((order) => [
        order.publicReference,
        order.status,
        order.cancellationSubtype,
        order.cancellationReason ?? "",
        order.cancelledAt ?? "",
        order.supplierName,
        order.supplierCode,
        order.purchaseRequestReference,
        order.selectedQuoteReference,
        order.deliveryLocationName,
        order.expectedDeliveryDate,
        order.deliveryAgingStatus,
        String(order.daysOverdue),
        order.currencyCode,
        order.totalAmount.toFixed(2),
        order.lineCount,
        order.orderedQty.toFixed(3),
        order.receivedQty.toFixed(3),
        order.cancelledQty.toFixed(3),
        order.openQty.toFixed(3),
        order.receivedValue.toFixed(2),
        order.cancelledValue.toFixed(2),
        order.openValue.toFixed(2),
        order.currentApproverName,
        order.lastIssuedAt ?? "",
        order.lastIssueActorName ?? "",
        order.lastIssueMethod ?? "",
        order.lastIssueReference ?? "",
        order.createdByName,
        order.createdAt
      ])
    ];

    await logOperationalExportAudit({
      session,
      reportId: "purchase-order-status",
      eventType: "report.export_completed",
      rowCount: orders.length,
      metadata: auditMetadata
    });

    return csvExportResponse(rows, "purchase-orders.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "purchase-order-status",
        extra: [
          ["Filter Query", filters.query ?? ""],
          ["Filter Status", filters.status ?? ""],
          ["Filter Expected From", filters.expectedFrom ?? ""],
          ["Filter Expected To", filters.expectedTo ?? ""],
          ["Filter Min Amount", filters.minAmount ?? ""],
          ["Filter Max Amount", filters.maxAmount ?? ""],
          ["Filter Approver", filters.approver ?? ""]
        ]
      })
    });
  } catch (error) {
    await logOperationalExportAudit({
      session,
      reportId: "purchase-order-status",
      eventType: "report.export_failed",
      reasonCode: "EXPORT_FAILED",
      metadata: {
        ...auditMetadata,
        errorMessage: error instanceof Error ? error.message : "Unknown export error"
      }
    });
    throw error;
  }
}
