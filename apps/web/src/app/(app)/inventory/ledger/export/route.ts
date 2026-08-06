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
import { canExportInventoryLedger } from "@/server/services/exportAuthorization";
import {
  listInventoryMovements,
  type InventoryMovementFilters
} from "@/server/services/inventory";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportInventoryLedger(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "movement-ledger",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const url = new URL(request.url);
  const filters: InventoryMovementFilters = {
    query: url.searchParams.get("q") ?? undefined,
    movementType: url.searchParams.get("movementType") ?? undefined
  };
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = {
    maxRows: exportPolicy.maxRows,
    searchApplied: Boolean(filters.query),
    movementTypeFilterApplied: Boolean(filters.movementType)
  };

  let movements: Awaited<ReturnType<typeof listInventoryMovements>>;
  try {
    await logOperationalExportAudit({
      session,
      reportId: "movement-ledger",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    movements = await listInventoryMovements(session, filters, {
      maxRows: exportPolicy.maxRows
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "movement-ledger",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
  const rows = [
    [
      "Occurred At",
      "Movement Type",
      "Location",
      "Inventory Location",
      "Item Code",
      "Item Name",
      "Entered Quantity",
      "Entered UOM",
      "Base Delta",
      "Base UOM",
      "Lot",
      "Expiry",
      "Source Type",
      "Event Key",
      "Reason",
      "Posted By"
    ],
    ...movements.map((movement) => [
      movement.occurredAt,
      movement.movementType,
      movement.locationName,
      movement.inventoryLocationName,
      movement.itemCode,
      movement.itemName,
      movement.enteredQuantity,
      movement.enteredUomCode,
      movement.quantityDeltaBaseUom,
      movement.baseUomCode,
      movement.lotNumber ?? "",
      movement.expiryDate ?? "",
      movement.sourceDocumentType,
      movement.sourceEventKey,
      movement.reasonCode ?? "",
      movement.postedByName
    ])
  ];

  await logOperationalExportAudit({
    session,
    reportId: "movement-ledger",
    eventType: "report.export_completed",
    rowCount: movements.length,
    metadata: auditMetadata
  });

  return csvExportResponse(rows, "inventory-ledger.csv", {
    metadata: await buildReportCsvMetadata({
      session,
      reportId: "movement-ledger",
      extra: [["Maximum Rows", exportPolicy.maxRows]]
    })
  });
}
