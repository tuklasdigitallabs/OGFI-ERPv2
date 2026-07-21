import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(
    new URL(
      "../../app/(app)/admin/evidence-retention/page.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("evidence retention administration surface", () => {
  it("uses the dedicated permission, paginated metadata register, and trusted hold action", () => {
    expect(page).toContain("permissions.evidenceRetentionView");
    expect(page).toContain("permissions.evidenceLegalHoldSet");
    expect(page).toContain("listEvidenceRetentionRegister({");
    expect(page).toContain("pageSize: 10");
    expect(page).toContain("assertTrustedServerActionOrigin()");
    expect(page).toContain("setEvidenceLegalHold({");
    expect(page).toContain("expectedRowVersion: Number(");
    expect(page).toContain("Number.isFinite(parsed)");
  });

  it("states the intentional metadata-only and preservation-only boundaries", () => {
    expect(page).toContain("Metadata only");
    expect(page).toContain("never exposes storage paths");
    expect(page).toContain("Hold release and physical purge are intentionally unavailable");
    expect(page).toContain("You have view-only access");
    expect(page).not.toContain("/download");
    expect(page).toContain("legalHoldReason");
    expect(page).toContain('"active" : "archived"');
  });
});
