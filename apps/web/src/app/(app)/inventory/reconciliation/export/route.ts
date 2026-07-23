import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit,
  logOperationalExportFailure
} from "@/server/services/exportAudit";
import { canExportInventoryLedgerVariance } from "@/server/services/exportAuthorization";
import {
  listInventoryLedgerVarianceExportRows,
  maxInventorySearchLength,
  resolveInventoryDashboardProfile
} from "@/server/services/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return exportAuthRequiredResponse();

  if (!canExportInventoryLedgerVariance(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "inventory-ledger-variance",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const params = new URL(request.url).searchParams;
  const profile = resolveInventoryDashboardProfile(
    params.get("dashboard") ?? undefined
  );
  if (!profile) {
    return exportErrorResponse(
      new Error("INVENTORY_RECONCILIATION_PROFILE_UNSUPPORTED")
    )!;
  }

  const query = params.get("q")?.trim() || undefined;
  if (query && query.length > maxInventorySearchLength) {
    return exportErrorResponse(new Error("INVENTORY_SEARCH_QUERY_TOO_LONG"))!;
  }
  const auditMetadata = {
    dashboardProfile: profile,
    searchQuery: query ?? null
  };

  try {
    await logOperationalExportAudit({
      session,
      reportId: "inventory-ledger-variance",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    const result = await listInventoryLedgerVarianceExportRows(session, {
      ...(query ? { query } : {})
    });
    const rows = [
      [
        "Location",
        "Inventory Location",
        "Item Code",
        "Item Name",
        "Lot",
        "Expiry",
        "Base UOM",
        "Cached Balance",
        "Ledger Total",
        "Variance"
      ],
      ...result.rows.map((row) => [
        row.locationName,
        row.inventoryLocationName,
        row.itemCode,
        row.itemName,
        row.lotNumber ?? "",
        row.expiryDate ?? "",
        row.baseUomCode,
        row.balanceQuantity,
        row.ledgerQuantity,
        row.varianceQuantity
      ])
    ];

    await logOperationalExportAudit({
      session,
      reportId: "inventory-ledger-variance",
      eventType: "report.export_completed",
      rowCount: result.totalItems,
      metadata: auditMetadata
    });

    return csvExportResponse(rows, "inventory-ledger-variance.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "inventory-ledger-variance",
        extra: [
          ["Dashboard Profile", profile],
          ["Search", result.query ?? "All variance rows"],
          ["Reconciliation Generated At UTC", result.generatedAt],
          [
            "Control Notice",
            "Diagnostic only. Do not edit balances or create adjustments to conceal cache-to-ledger differences."
          ]
        ]
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "inventory-ledger-variance",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
