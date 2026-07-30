import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL(
    "../prisma/migrations/20260731100000_stock_count_submitted_cancellation_guard/migration.sql",
    import.meta.url,
  )),
  "utf8",
);

describe("submitted stock-count cancellation history guard", () => {
  test("permits only the constrained submitted-to-cancelled terminal transition", () => {
    expect(migration).toContain('OLD."status" = \'SUBMITTED\'');
    expect(migration).toContain('NEW."status" = \'CANCELLED\'');
    expect(migration).toContain('NEW."version" = OLD."version" + 1');
    expect(migration).toContain('NULLIF(BTRIM(NEW."cancellationReason"), \'\') IS NOT NULL');

    for (const immutableField of [
      "id",
      "stockCountSessionId",
      "tenantId",
      "companyId",
      "inventoryLocationId",
      "attemptNumber",
      "blindCount",
      "freezeMovements",
      "cutoffAt",
      "startedAt",
      "submittedAt",
      "reviewedAt",
      "reviewNotes",
      "reason",
      "evidenceReference",
      "createdByUserId",
      "assignedToUserId",
      "reviewedByUserId",
      "createdAt",
    ]) {
      expect(migration).toContain(
        `NEW."${immutableField}" IS NOT DISTINCT FROM OLD."${immutableField}"`,
      );
    }
  });

  test("keeps destructive and subsequent terminal mutations denied", () => {
    expect(migration).toContain("Stock count attempt history is immutable");
    expect(migration).toContain("Terminal stock count attempt evidence is immutable");
    expect(migration).toContain(
      "('SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')",
    );
    expect(migration).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });
});
