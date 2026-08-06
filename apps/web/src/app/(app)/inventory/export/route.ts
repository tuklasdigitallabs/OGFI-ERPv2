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
  listInventoryBalanceDashboardProfileExportRows,
  listInventoryBalances,
  resolveInventoryBalanceDashboardRequest,
  type InventoryBalanceFilters
} from "@/server/services/inventory";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

function inventoryProfileExportName(profile: string) {
  switch (profile) {
    case "positive-stock-v1":
      return { filename: "positive-stock.csv", allRowsLabel: "All positive stock rows" };
    case "zero-stock-v1":
      return { filename: "zero-stock-rows.csv", allRowsLabel: "All zero stock rows" };
    case "lot-expiry-data-v1":
      return {
        filename: "lot-expiry-data-rows.csv",
        allRowsLabel: "All rows with lot or expiry data"
      };
    default:
      throw new Error("INVENTORY_BALANCE_DASHBOARD_PROFILE_UNSUPPORTED");
  }
}

function inventoryBalanceCsvRows(
  balances: Awaited<ReturnType<typeof listInventoryBalances>>
) {
  return [
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
}

function inventoryBalanceProfileValidationResponse(error: string) {
  return Response.json(
    { error },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}

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
  const dashboardValues = url.searchParams.getAll("dashboard");
  if (dashboardValues.length > 0) {
    const queryValues = url.searchParams.getAll("q");
    const hasUnsupportedParameter = [...url.searchParams.keys()].some(
      (key) => key !== "dashboard" && key !== "q"
    );
    if (hasUnsupportedParameter) {
      return inventoryBalanceProfileValidationResponse(
        "INVENTORY_BALANCE_DASHBOARD_PROFILE_FILTER_UNSUPPORTED"
      );
    }
    const profileRequest = resolveInventoryBalanceDashboardRequest(
      dashboardValues.length === 1 ? dashboardValues[0] : dashboardValues,
      queryValues.length <= 1 ? queryValues[0] : queryValues
    );
    if (profileRequest.error === "PROFILE_INVALID") {
      return inventoryBalanceProfileValidationResponse(
        "INVENTORY_BALANCE_DASHBOARD_PROFILE_UNSUPPORTED"
      );
    }
    if (profileRequest.error === "SEARCH_INVALID") {
      return inventoryBalanceProfileValidationResponse(
        "INVENTORY_BALANCE_DASHBOARD_PROFILE_SEARCH_INVALID"
      );
    }

    const exportPolicy = await getReportExportPolicy(session);
    const auditMetadata = {
      dashboardProfile: profileRequest.profile,
      maxRows: exportPolicy.maxRows
    };
    const exportName = inventoryProfileExportName(profileRequest.profile);
    try {
      await logOperationalExportAudit({
        session,
        reportId: "stock-balances",
        eventType: "report.export_started",
        metadata: auditMetadata
      });
      const balances = await listInventoryBalanceDashboardProfileExportRows(session, {
        profile: profileRequest.profile,
        ...(profileRequest.query ? { query: profileRequest.query } : {}),
        maxRows: exportPolicy.maxRows
      });
      await logOperationalExportAudit({
        session,
        reportId: "stock-balances",
        eventType: "report.export_completed",
        rowCount: balances.length,
        metadata: auditMetadata
      });
      return csvExportResponse(
        inventoryBalanceCsvRows(balances),
        exportName.filename,
        {
          metadata: await buildReportCsvMetadata({
            session,
            reportId: "stock-balances",
            extra: [
              ["Dashboard Profile", profileRequest.profile],
              [
                "Search",
                profileRequest.query || exportName.allRowsLabel
              ],
              ["Maximum Rows", exportPolicy.maxRows]
            ]
          })
        }
      );
    } catch (error) {
      await logOperationalExportFailure({
        session,
        reportId: "stock-balances",
        error,
        metadata: auditMetadata
      });
      const response = exportErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  const filters: InventoryBalanceFilters = {
    query: url.searchParams.get("q") ?? undefined
  };
  const exportPolicy = await getReportExportPolicy(session);
  const auditMetadata = {
    maxRows: exportPolicy.maxRows,
    searchApplied: Boolean(filters.query)
  };

  let balances: Awaited<ReturnType<typeof listInventoryBalances>>;
  try {
    await logOperationalExportAudit({
      session,
      reportId: "stock-balances",
      eventType: "report.export_started",
      metadata: auditMetadata
    });
    balances = await listInventoryBalances(session, filters, {
      maxRows: exportPolicy.maxRows
    });
  } catch (error) {
    await logOperationalExportFailure({
      session,
      reportId: "stock-balances",
      error,
      metadata: auditMetadata
    });
    const response = exportErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
  const rows = inventoryBalanceCsvRows(balances);

  await logOperationalExportAudit({
    session,
    reportId: "stock-balances",
    eventType: "report.export_completed",
    rowCount: balances.length,
    metadata: auditMetadata
  });

  return csvExportResponse(rows, "stock-balances.csv", {
      metadata: await buildReportCsvMetadata({
        session,
        reportId: "stock-balances",
        extra: [["Maximum Rows", exportPolicy.maxRows]]
      })
  });
}
