import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import { logOperationalExportAudit } from "@/server/services/exportAudit";
import { canExportPurchaseOrders } from "@/server/services/exportAuthorization";
import {
  listPurchaseOrders,
  type PurchaseOrderListFilters
} from "@/server/services/purchaseOrders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportPurchaseOrders(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "purchase-order-status",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const url = new URL(request.url);
  const filters: PurchaseOrderListFilters = {
    query: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    expectedFrom: url.searchParams.get("expectedFrom") ?? undefined,
    expectedTo: url.searchParams.get("expectedTo") ?? undefined,
    minAmount: url.searchParams.get("minAmount") ?? undefined,
    maxAmount: url.searchParams.get("maxAmount") ?? undefined,
    approver: url.searchParams.get("approver") ?? undefined
  };

  await logOperationalExportAudit({
    session,
    reportId: "purchase-order-status",
    eventType: "report.export_started"
  });
  const orders = await listPurchaseOrders(session, filters);
  const rows = [
    [
      "PO Number",
      "Status",
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
    rowCount: orders.length
  });

  return csvExportResponse(rows, "purchase-orders.csv");
}
