const validationErrorStatusByCode = new Map<string, number>([
  ["INVENTORY_SEARCH_QUERY_TOO_LONG", 400],
  ["PROJECT_EXPORT_RATE_LIMITED", 429]
]);

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
