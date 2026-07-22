import { type NextRequest } from "next/server";
import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit,
  logOperationalExportFailure
} from "@/server/services/exportAudit";
import { canExportPurchaseRequests } from "@/server/services/exportAuthorization";
import {
  listPurchaseRequestsDashboardProfile,
  listPurchaseRequests,
  resolvePurchaseRequestDashboardProfile,
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
  const dashboardProfile = resolvePurchaseRequestDashboardProfile(
    searchParams.get("dashboard") ?? undefined,
  );
  try {
    await logOperationalExportAudit({
      session,
      reportId: "purchase-request-register",
      eventType: "report.export_started"
    });
    const records = dashboardProfile
      ? await listPurchaseRequestsDashboardProfile(session, dashboardProfile)
      : await listPurchaseRequests(session, {
          status: normalizeStatus(searchParams.get("status")),
          search: searchParams.get("search") ?? ""
        });
    if (!records) {
      return new Response("Unknown dashboard profile", { status: 400 });
    }

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

    return csvExportResponse(rows, "purchase-requests.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "purchase-request-register"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "purchase-request-register",
      error
    });
    throw error;
  }
}
