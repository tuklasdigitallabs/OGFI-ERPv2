import { type NextRequest } from "next/server";
import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import { logOperationalExportAudit } from "@/server/services/exportAudit";
import { canExportPurchaseRequests } from "@/server/services/exportAuthorization";
import {
  listPurchaseRequests,
  type PurchaseRequestStatus
} from "@/server/services/purchaseRequests";

const statuses: Array<PurchaseRequestStatus | "ALL"> = [
  "ALL",
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "RETURNED",
  "REJECTED",
  "CANCELLED"
];

export const dynamic = "force-dynamic";

function normalizeStatus(value: string | null): PurchaseRequestStatus | "ALL" {
  return statuses.includes(value as PurchaseRequestStatus | "ALL")
    ? (value as PurchaseRequestStatus | "ALL")
    : "ALL";
}

export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportPurchaseRequests(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "purchase-request-register",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const searchParams = request.nextUrl.searchParams;
  await logOperationalExportAudit({
    session,
    reportId: "purchase-request-register",
    eventType: "report.export_started"
  });
  const records = await listPurchaseRequests(session, {
    status: normalizeStatus(searchParams.get("status")),
    search: searchParams.get("search") ?? ""
  });

  const rows = [
    [
      "Reference",
      "Status",
      "Required Date",
      "Location",
      "Item",
      "Line Description",
      "Quantity",
      "UOM",
      "Purpose"
    ],
    ...records.map((record) => [
      record.publicReference,
      record.status,
      record.requiredDate,
      session.context.locationName,
      record.line.itemName ?? "",
      record.line.description,
      record.line.requestedQty,
      record.line.uomCode,
      record.line.purpose
    ])
  ];

  await logOperationalExportAudit({
    session,
    reportId: "purchase-request-register",
    eventType: "report.export_completed",
    rowCount: records.length
  });

  return csvExportResponse(rows, "purchase-requests.csv");
}
