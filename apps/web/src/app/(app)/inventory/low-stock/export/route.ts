import { getSessionContext } from "@/server/services/context";
import { exportLowStockRows } from "@/server/services/lowStock";
import { getReportExportPolicy } from "@/server/services/policySettings";
import { csvExportResponse } from "@/server/services/csv";
import { exportAuthRequiredResponse, exportErrorResponse } from "@/server/services/exportErrors";
import { buildReportCsvMetadata, logOperationalExportAudit, logOperationalExportFailure } from "@/server/services/exportAudit";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return exportAuthRequiredResponse();
  const url = new URL(request.url);
  try {
    const policy = await getReportExportPolicy(session);
    const rows = await exportLowStockRows(session, { query: url.searchParams.get("q") ?? "", alertsOnly: url.searchParams.get("view") !== "all", maxRows: policy.maxRows });
    await logOperationalExportAudit({ session, reportId: "low-stock", eventType: "report.export_completed", rowCount: rows.length });
    return csvExportResponse([
      ["Storage", "Item code", "Item", "Recorded on-hand", "Threshold", "Base UOM", "Balance rows", "Active", "Eligible", "Low stock", "Version", "Threshold updated UTC"],
      ...rows.map(row => [row.inventoryLocationName, row.itemCode, row.itemName, row.recordedOnHand, row.thresholdQuantity, row.baseUomCode, row.balanceRows, String(row.active), String(row.eligible), String(row.lowStock), row.version, row.updatedAt]),
    ], "low-stock.csv", { metadata: await buildReportCsvMetadata({ session, reportId: "low-stock", extra: [["Measure", "Recorded on-hand; configured no-balance pairs are zero"], ["View", url.searchParams.get("view") === "all" ? "Configured thresholds" : "Low-stock alerts"]] }) });
  } catch (error) {
    await logOperationalExportFailure({ session, reportId: "low-stock", error });
    return exportErrorResponse(error) ?? Response.json({ error: "LOW_STOCK_EXPORT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
