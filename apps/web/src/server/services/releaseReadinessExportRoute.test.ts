import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SessionContext } from "./context";

const mockServices = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  canExportReleaseReadiness: vi.fn(),
  buildReleaseReadinessExportRows: vi.fn(),
  buildReportCsvMetadata: vi.fn(),
  logOperationalExportAudit: vi.fn(),
  logOperationalExportFailure: vi.fn()
}));

vi.mock("@/server/services/context", () => ({
  getSessionContext: mockServices.getSessionContext
}));

vi.mock("@/server/services/exportAuthorization", () => ({
  canExportReleaseReadiness: mockServices.canExportReleaseReadiness
}));

vi.mock("@/server/services/csv", async () => import("./csv"));

vi.mock("@/server/services/exportErrors", async () => import("./exportErrors"));

vi.mock("@/server/services/exportAudit", () => ({
  buildReportCsvMetadata: mockServices.buildReportCsvMetadata,
  logOperationalExportAudit: mockServices.logOperationalExportAudit,
  logOperationalExportFailure: mockServices.logOperationalExportFailure
}));

vi.mock("@/server/services/releaseReadiness", () => ({
  buildReleaseReadinessExportRows: mockServices.buildReleaseReadinessExportRows
}));

import { GET as readinessExportGET } from "../../app/(app)/admin/readiness/export/route";

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "admin@ogfi.example",
    displayName: "ERP Administrator",
    role: "ERP Administrator"
  },
  context: {
    tenantId: "tenant-1",
    companyId: "company-1",
    companyName: "One Gourmet Foods Inc.",
    brandId: "brand-1",
    brandName: "Yakiniku Like",
    locationId: "warehouse-1",
    locationName: "One Gourmet Main Warehouse",
    locationType: "WAREHOUSE"
  },
  authorizedLocations: [],
  permissionCodes: []
};

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("release readiness export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getSessionContext.mockResolvedValue(session);
    mockServices.canExportReleaseReadiness.mockReturnValue(true);
    mockServices.buildReportCsvMetadata.mockResolvedValue([
      ["Report ID", "release-readiness"],
      ["Scope", "Company release readiness"]
    ]);
    mockServices.buildReleaseReadinessExportRows.mockResolvedValue([
      ["Section", "Status"],
      ["Gate register", "READY"]
    ]);
  });

  test("serves a matching CSV checksum header and downloadable SHA-256 sidecar", async () => {
    const generatedAt = "2026-07-07T01:02:03.000Z";
    const csvResponse = await readinessExportGET(
      request(`/admin/readiness/export?generatedAt=${encodeURIComponent(generatedAt)}`)
    );
    const csvBody = await csvResponse.text();
    const expectedChecksum = createHash("sha256").update(csvBody).digest("hex");

    expect(csvResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=release-readiness-register.csv"
    );
    expect(csvResponse.headers.get("X-OGFI-CSV-SHA256")).toBe(expectedChecksum);
    expect(csvBody).toContain("Generated At UTC,2026-07-07T01:02:03.000Z");
    expect(csvBody).toContain("Gate register,READY");

    const checksumResponse = await readinessExportGET(
      request(
        `/admin/readiness/export?generatedAt=${encodeURIComponent(
          generatedAt
        )}&format=sha256`
      )
    );

    await expect(checksumResponse.text()).resolves.toBe(
      `${expectedChecksum}  release-readiness-register.csv\n`
    );
    expect(checksumResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=release-readiness-register.csv.sha256"
    );
    expect(checksumResponse.headers.get("Content-Type")).toContain("text/plain");
  });
});
