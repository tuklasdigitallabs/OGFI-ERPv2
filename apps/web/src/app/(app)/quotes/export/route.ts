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
import { canExportSupplierQuotes } from "@/server/services/exportAuthorization";
import { listQuoteRequests } from "@/server/services/quotes";

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

  try {
    await logOperationalExportAudit({
      session,
      reportId: "supplier-quotes",
      eventType: "report.export_started"
    });
    const requests = await listQuoteRequests(session);
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

    await logOperationalExportAudit({
      session,
      reportId: "supplier-quotes",
      eventType: "report.export_completed",
      rowCount: quoteRows.length
    });

    return csvExportResponse(rows, "supplier-quotes.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "supplier-quotes"
      })
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "supplier-quotes",
      error
    });
    throw error;
  }
}
