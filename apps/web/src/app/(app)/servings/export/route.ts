import { permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { csvExportResponse } from "@/server/services/csv";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  exportPermissionDeniedResponse,
} from "@/server/services/exportErrors";
import {
  buildReportCsvMetadata,
  logOperationalExportAudit,
  logOperationalExportFailure,
} from "@/server/services/exportAudit";
import { getReportExportPolicy } from "@/server/services/policySettings";
import { listRestaurantConsumptionExportRows } from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

function optional(value: string | null) {
  return value?.trim() || undefined;
}

const servingStatuses = [
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "DERIVATION_BLOCKED",
  "READY_TO_POST",
  "POSTING",
  "POSTED",
  "REVERSED",
  "CANCELLED",
] as const;

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return exportAuthRequiredResponse();
  if (!session.permissionCodes.includes(permissions.consumptionView)) {
    return exportPermissionDeniedResponse();
  }
  const url = new URL(request.url);
  const rawStatus = optional(url.searchParams.get("status"));
  const normalizedStatus = servingStatuses.find(
    (status) => status === rawStatus,
  );
  const rawFrom = optional(url.searchParams.get("from"));
  const rawTo = optional(url.searchParams.get("to"));
  const filters = {
    query: optional(url.searchParams.get("q"))?.slice(0, 120),
    status: normalizedStatus,
    businessDateFrom:
      rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : undefined,
    businessDateTo:
      rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : undefined,
  };
  const policy = await getReportExportPolicy(session);
  const metadata = {
    maxRows: policy.maxRows,
    status: filters.status ?? "ALL",
    queryApplied: Boolean(filters.query),
  };
  try {
    await logOperationalExportAudit({
      session,
      reportId: "restaurant-expected-consumption",
      eventType: "report.export_started",
      metadata,
    });
    const rows = await listRestaurantConsumptionExportRows(
      session,
      filters,
      policy.maxRows,
    );
    await logOperationalExportAudit({
      session,
      reportId: "restaurant-expected-consumption",
      eventType: "report.export_completed",
      rowCount: rows.length,
      metadata,
    });
    return csvExportResponse(
      [
        [
          "Business Date",
          "Service Period",
          "Declaration Status",
          "Source",
          "Revision",
          "Menu Item Code",
          "Menu Item",
          "Disposition",
          "Quantity Served",
          "Ingredient Code",
          "Ingredient",
          "Expected Quantity",
          "Base UOM",
          "Recipe Version ID",
          "Derivation Snapshot SHA-256",
          "Ledger Posting Status",
        ],
        ...rows.map(({ declaration, line, ingredient }: any) => [
          new Date(declaration.businessDate).toISOString().slice(0, 10),
          declaration.servicePeriodCode,
          declaration.status,
          declaration.sourceType,
          declaration.revisionNo,
          line?.menuItemCodeSnapshot ?? "",
          line?.menuItemNameSnapshot ?? "",
          line?.disposition ?? "",
          line ? String(line.quantityServed) : "",
          ingredient?.item?.itemCode ?? "",
          ingredient?.item?.itemName ?? "",
          ingredient ? String(ingredient.roundedQuantityBaseUom) : "",
          ingredient?.baseUom?.uomCode ?? "",
          ingredient?.recipeVersionId ?? "",
          declaration.derivationSnapshotHash ?? "",
          declaration.posting?.status ?? "NOT_POSTED",
        ]),
      ],
      "restaurant-expected-consumption.csv",
      {
        metadata: await buildReportCsvMetadata({
          session,
          reportId: "restaurant-expected-consumption",
          extra: [
            ["Status", filters.status ?? "All statuses"],
            ["Search", filters.query ?? "No search"],
            ["From", filters.businessDateFrom ?? "No lower date"],
            ["To", filters.businessDateTo ?? "No upper date"],
            ["Maximum Rows", policy.maxRows],
            [
              "Interpretation",
              "Recipe-derived expected/book consumption; not independent physical actual consumption",
            ],
          ],
        }),
      },
    );
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "restaurant-expected-consumption",
      error,
      metadata,
    });
    const response = exportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
