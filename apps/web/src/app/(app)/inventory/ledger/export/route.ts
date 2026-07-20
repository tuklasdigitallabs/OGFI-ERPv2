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

  let movements: Awaited<ReturnType<typeof listInventoryMovements>>;
  try {
    await logOperationalExportAudit({
      session,
      reportId: "movement-ledger",
      eventType: "report.export_started"
    });
    movements = await listInventoryMovements(session, filters);
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "movement-ledger",
      error
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
    rowCount: movements.length
  });

  return csvExportResponse(rows, "inventory-ledger.csv", {
    metadata: await buildReportCsvMetadata({
      session,
      reportId: "movement-ledger"
    })
  });
}
