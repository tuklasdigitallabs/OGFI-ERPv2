import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { csvCell, csvExportResponse, csvRows, csvRowsWithMetadata } from "./csv";

const appRouteRoot = fileURLToPath(new URL("../../app/(app)/", import.meta.url));

describe("CSV helpers", () => {
  test("escapes cells with commas, quotes, or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Supplier, Inc.")).toBe("\"Supplier, Inc.\"");
    expect(csvCell("Quote \"A\"")).toBe("\"Quote \"\"A\"\"\"");
    expect(csvCell("Line 1\nLine 2")).toBe("\"Line 1\nLine 2\"");
    expect(csvCell(null)).toBe("");
  });

  test("neutralizes spreadsheet formula-like string cells", () => {
    expect(csvCell("=HYPERLINK(\"http://example.test\")")).toBe(
      "\"'=HYPERLINK(\"\"http://example.test\"\")\""
    );
    expect(csvCell("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(csvCell("-SUM(A1:A2)")).toBe("'-SUM(A1:A2)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("  =SUM(A1:A2)")).toBe("'  =SUM(A1:A2)");
    expect(csvCell(-5)).toBe("-5");
  });

  test("builds no-store CSV export responses", async () => {
    const rows = [
      ["Reference", "Supplier"],
      ["PR-001", "Supplier, Inc."]
    ];
    const generatedAt = new Date("2026-06-30T01:02:03.000Z");
    const response = csvExportResponse(rows, "purchase-requests.csv", {
      generatedAt,
      metadata: [["Scope", "Selected location"]]
    });

    expect(csvRows(rows)).toBe("Reference,Supplier\nPR-001,\"Supplier, Inc.\"");
    expect(
      csvRows(csvRowsWithMetadata(rows, "purchase-requests.csv", { generatedAt }))
    ).toBe(
      "Export File,purchase-requests.csv\nGenerated At UTC,2026-06-30T01:02:03.000Z\n\nReference,Supplier\nPR-001,\"Supplier, Inc.\""
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=purchase-requests.csv"
    );
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe(
      "Export File,purchase-requests.csv\nGenerated At UTC,2026-06-30T01:02:03.000Z\nScope,Selected location\n\nReference,Supplier\nPR-001,\"Supplier, Inc.\""
    );
  });

  test("can include a SHA-256 checksum header for controlled evidence exports", async () => {
    const rows = [
      ["Gate", "Status"],
      ["GO / NO-GO", "READY"]
    ];
    const generatedAt = new Date("2026-06-30T01:02:03.000Z");
    const response = csvExportResponse(rows, "release-readiness-register.csv", {
      generatedAt,
      checksumHeader: true
    });
    const body = await response.text();

    expect(response.headers.get("X-OGFI-CSV-SHA256")).toBe(
      createHash("sha256").update(body).digest("hex")
    );
  });

  test("keeps export routes on shared CSV response handling", () => {
    const exportRoutes = [
      "adjustments/export/route.ts",
      "admin/audit/export/route.ts",
      "counts/export/route.ts",
      "expansion/export/route.ts",
      "inventory/export/route.ts",
      "inventory/ledger/export/route.ts",
      "projects/activity/export/route.ts",
      "projects/export/route.ts",
      "projects/links/export/route.ts",
      "projects/tasks/export/route.ts",
      "purchase-orders/export/route.ts",
      "purchase-requests/export/route.ts",
      "quotes/export/route.ts",
      "receiving/export/route.ts",
      "transfers/export/route.ts",
      "wastage/export/route.ts"
    ];

    for (const routePath of exportRoutes) {
      const routeSource = readFileSync(`${appRouteRoot}${routePath}`, "utf8");

      expect(routeSource, `${routePath} imports shared CSV response helper`).toContain(
        "@/server/services/csv"
      );
      expect(routeSource, `${routePath} uses shared CSV response helper`).toContain(
        "csvExportResponse("
      );
      expect(routeSource, `${routePath} is explicitly dynamic`).toContain(
        'export const dynamic = "force-dynamic"'
      );
      expect(routeSource, `${routePath} imports shared export errors`).toContain(
        "@/server/services/exportErrors"
      );
      expect(routeSource, `${routePath} uses shared auth response`).toContain(
        "exportAuthRequiredResponse()"
      );
      expect(routeSource, `${routePath} does not define a local csvCell`).not.toMatch(
        /function\s+csvCell/
      );
      expect(routeSource, `${routePath} does not build manual CSV responses`).not.toMatch(
        /new\s+(NextResponse|Response)\s*\(/
      );
    }
  });

  test("PO status export carries trust metadata and cancellation subtype columns", () => {
    const routeSource = readFileSync(
      `${appRouteRoot}purchase-orders/export/route.ts`,
      "utf8"
    );
    const exportAuditSource = readFileSync(
      fileURLToPath(new URL("exportAudit.ts", import.meta.url)),
      "utf8"
    );

    expect(routeSource).toContain("getOperationalReportTrustContext");
    expect(routeSource).toContain("logOperationalExportAudit");
    expect(routeSource).toContain('"Cancellation Subtype"');
    expect(routeSource).toContain('"Cancellation Reason"');
    expect(routeSource).toContain('"Cancelled At"');
    expect(exportAuditSource).toContain("Reporting Trust Gate");
    expect(exportAuditSource).toContain("Scope Filters Required");
    expect(routeSource).toContain("metadata: auditMetadata");
  });
});
