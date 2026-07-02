import { describe, expect, test } from "vitest";
import {
  exportAuthRequiredResponse,
  exportErrorResponse,
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

  test("does not mask unknown export failures", () => {
    expect(exportErrorResponse(new Error("DATABASE_UNAVAILABLE"))).toBeNull();
    expect(exportErrorResponse("INVENTORY_SEARCH_QUERY_TOO_LONG")).toBeNull();
  });
});
