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
import { canExportInventoryBalances } from "@/server/services/exportAuthorization";
import {
  listInventoryBalances,
  type InventoryBalanceFilters
} from "@/server/services/inventory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportInventoryBalances(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "stock-balances",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }

  const url = new URL(request.url);
  const filters: InventoryBalanceFilters = {
    query: url.searchParams.get("q") ?? undefined
  };

  let balances: Awaited<ReturnType<typeof listInventoryBalances>>;
  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-balances",
      eventType: "report.export_started"
    });
    balances = await listInventoryBalances(session, filters);
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-balances",
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
      "Location",
      "Inventory Location",
      "Item Code",
      "Item Name",
      "Category",
      "Quantity On Hand",
      "Base UOM",
      "Lot",
      "Expiry",
      "Version",
      "Updated At"
    ],
    ...balances.map((balance) => [
      balance.locationName,
      balance.inventoryLocationName,
      balance.itemCode,
      balance.itemName,
      balance.categoryName,
      balance.qtyOnHand,
      balance.baseUomCode,
      balance.lotNumber ?? "",
      balance.expiryDate ?? "",
      balance.version,
      balance.updatedAt
    ])
  ];

  await logOperationalExportAudit({
    session,
    reportId: "stock-balances",
    eventType: "report.export_completed",
    rowCount: balances.length
  });

  return csvExportResponse(rows, "stock-balances.csv", {
    metadata: await buildReportCsvMetadata({
      session,
      reportId: "stock-balances"
    })
  });
}
