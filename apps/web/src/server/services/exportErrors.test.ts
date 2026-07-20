import { describe, expect, test } from "vitest";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
  getStrictDateSearchParam,
  exportPermissionDeniedResponse
} from "./exportErrors";

describe("export error responses", () => {
  test("returns stable authentication and authorization responses", async () => {
    const authResponse = exportAuthRequiredResponse();
    const deniedResponse = exportPermissionDeniedResponse();

    expect(authResponse.status).toBe(401);
    expect(authResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(authResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(authResponse.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(deniedResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(deniedResponse.json()).resolves.toEqual({
      error: "PERMISSION_DENIED"
    });
  });

  test("returns a stable validation response for oversized inventory search filters", async () => {
    const response = exportErrorResponse(new Error("INVENTORY_SEARCH_QUERY_TOO_LONG"));

    expect(response?.status).toBe(400);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response?.json()).resolves.toEqual({
      error: "INVENTORY_SEARCH_QUERY_TOO_LONG"
    });
  });

  test("returns stable validation responses for Phase 2 export date filters", async () => {
    for (const code of [
      "BRANCH_OPERATIONS_BUSINESS_DATE_INVALID",
      "FOOD_COST_BUSINESS_DATE_INVALID",
      "FOOD_SAFETY_BUSINESS_DATE_INVALID",
      "INCIDENT_FILTER_DATE_INVALID",
      "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
    ]) {
      const response = exportErrorResponse(new Error(code));

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({ error: code });
    }
  });

  test("strict date search params reject malformed calendar dates", () => {
    expect(
      getStrictDateSearchParam(
        new URLSearchParams("requestedAt=2026-07-04"),
        "requestedAt",
        "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
      )
    ).toBe("2026-07-04");
    expect(
      getStrictDateSearchParam(
        new URLSearchParams("status=open"),
        "requestedAt",
        "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
      )
    ).toBeUndefined();
    expect(() =>
      getStrictDateSearchParam(
        new URLSearchParams("requestedAt=2026-02-31"),
        "requestedAt",
        "MAINTENANCE_REQUESTED_AT_FILTER_INVALID"
      )
    ).toThrow("MAINTENANCE_REQUESTED_AT_FILTER_INVALID");
  });

  test("does not mask unknown export failures", () => {
    expect(exportErrorResponse(new Error("DATABASE_UNAVAILABLE"))).toBeNull();
    expect(exportErrorResponse("INVENTORY_SEARCH_QUERY_TOO_LONG")).toBeNull();
  });
});
