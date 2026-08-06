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
import { canExportSupplierQuotes } from "@/server/services/exportAuthorization";
import { listQuoteRequests } from "@/server/services/quotes";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return exportAuthRequiredResponse();
  }
  if (!canExportSupplierQuotes(session)) {
    await logOperationalExportAudit({
      session,
      reportId: "supplier-quotes",
      eventType: "report.export_denied",
      reasonCode: "PERMISSION_DENIED"
    });
    return exportPermissionDeniedResponse();
  }
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = { maxRows: exportPolicy.maxRows };

  try {
    await logOperationalExportAudit({
      session,
      reportId: "supplier-quotes",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    const requests = await listQuoteRequests(session, {
      maxRows: exportPolicy.maxRows
    });
    const quoteRows = requests.flatMap((request) =>
      request.quotes.flatMap((quote) => {
        const lines = quote.lines.length > 0 ? quote.lines : [null];
        return lines.map((line) => [
          request.publicReference,
          request.requiredDate,
          session.context.locationName,
          line?.itemName ?? request.line.itemName ?? request.line.description,
          line?.quantity ?? request.line.requestedQty,
          line?.uomCode ?? request.line.uomCode,
          quote.supplierName,
          quote.quoteReference,
          quote.quoteDate,
          quote.currencyCode,
          line?.lineTotal ?? quote.totalAmount,
          quote.subtotalAmount,
          quote.taxAmount,
          quote.discountAmount,
          quote.freightAmount,
          quote.otherChargesAmount,
          quote.totalAmount,
          quote.supplierAccreditationStatus,
          quote.isLowestRecordedCost,
          line?.availabilityStatus ?? "",
          line?.leadTimeDays ?? "",
          quote.status
        ]);
      })
    );
    const rows = [
      [
        "Purchase Request",
        "Required Date",
        "Location",
        "Item",
        "Requested Quantity",
        "Requested UOM",
        "Supplier",
        "Quote Reference",
        "Quote Date",
        "Currency",
        "Line Amount",
        "Subtotal Amount",
        "Tax Amount",
        "Discount Amount",
        "Freight Amount",
        "Other Charges Amount",
        "Quote Total Amount",
        "Supplier Accreditation",
        "Lowest Recorded Cost",
        "Availability",
        "Lead Days",
        "Status"
      ],
      ...quoteRows
    ];
    if (quoteRows.length > exportPolicy.maxRows) {
      throw new Error("REPORT_EXPORT_ROW_LIMIT_EXCEEDED");
    }

    await logOperationalExportAudit({
      session,
      reportId: "supplier-quotes",
      eventType: "report.export_completed",
      rowCount: quoteRows.length,
      metadata: auditMetadata
    });

    return csvExportResponse(rows, "supplier-quotes.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "supplier-quotes",
        extra: [["Maximum Rows", exportPolicy.maxRows]]
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "supplier-quotes",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
