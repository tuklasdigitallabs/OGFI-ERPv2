import { parseDateOnlyUtc } from "./projectDates";

const validationErrorStatusByCode = new Map<string, number>([
  ["BRANCH_OPERATIONS_BUSINESS_DATE_INVALID", 400],
  ["FOOD_COST_BUSINESS_DATE_INVALID", 400],
  ["FOOD_SAFETY_BUSINESS_DATE_INVALID", 400],
  ["INCIDENT_FILTER_DATE_INVALID", 400],
  ["INVENTORY_SEARCH_QUERY_TOO_LONG", 400],
  ["INVENTORY_RECONCILIATION_PROFILE_UNSUPPORTED", 400],
  ["RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG", 400],
  ["STOCK_ADJUSTMENT_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["TRANSFER_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["WASTAGE_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["PURCHASE_REQUEST_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["PURCHASE_ORDER_DASHBOARD_PROFILE_UNSUPPORTED", 400],
  ["MAINTENANCE_REQUESTED_AT_FILTER_INVALID", 400],
  ["REPORT_EXPORT_SCOPE_FILTER_REQUIRED", 400],
  ["PROJECT_EXPORT_RATE_LIMITED", 429]
]);
const safeExportErrorCodePattern = /^[A-Z0-9_]+$/;

function exportJsonErrorResponse(error: string, status: number) {
  return Response.json(
    { error },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      },
      status
    }
  );
}

export function exportAuthRequiredResponse() {
  return exportJsonErrorResponse("AUTH_REQUIRED", 401);
}

export function exportPermissionDeniedResponse() {
  return exportJsonErrorResponse("PERMISSION_DENIED", 403);
}

export function exportErrorResponse(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const status = validationErrorStatusByCode.get(error.message);
  if (!status) {
    return null;
  }

  return exportJsonErrorResponse(error.message, status);
}

export function getStrictDateSearchParam(
  searchParams: URLSearchParams,
  key: string,
  errorCode: string
) {
  const value = searchParams.get(key) ?? undefined;
  if (!value) {
    return undefined;
  }
  if (!parseDateOnlyUtc(value)) {
    throw new Error(errorCode);
  }
  return value;
}

export function getExportFailureReasonCode(error: unknown) {
  if (error instanceof Error && safeExportErrorCodePattern.test(error.message)) {
    return error.message;
  }
  return "EXPORT_FAILED";
}
