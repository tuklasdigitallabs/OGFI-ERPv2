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
  listInventoryPositiveStockProfileExportRows,
  listInventoryBalances,
  resolveInventoryBalanceDashboardRequest,
  type InventoryBalanceFilters
} from "@/server/services/inventory";
import { getReportExportPolicy } from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

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
    try {
      await logOperationalExportAudit({
        session,
        reportId: "stock-balances",
        eventType: "report.export_started",
        metadata: auditMetadata
      });
      const balances = await listInventoryPositiveStockProfileExportRows(session, {
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
        "positive-stock.csv",
        {
          metadata: await buildReportCsvMetadata({
            session,
            reportId: "stock-balances",
            extra: [
              ["Dashboard Profile", profileRequest.profile],
              ["Search", profileRequest.query || "All positive stock rows"],
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
  const rows = inventoryBalanceCsvRows(balances);

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
