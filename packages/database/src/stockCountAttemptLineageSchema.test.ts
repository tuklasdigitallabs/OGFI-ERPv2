import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260724170000_stock_count_attempt_scope_lineage_guards/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("stock-count attempt lineage trigger schema", () => {
  test("does not read a line-only field from the StockAdjustment header row", () => {
    const headerFunction = migrationSource.match(
      /CREATE OR REPLACE FUNCTION "validate_stock_adjustment_attempt_lineage"\(\)[\s\S]*?\n\$\$;/,
    )?.[0];
    expect(headerFunction).toBeDefined();
    expect(headerFunction).toContain('NEW."sourceStockCountAttemptId"');
    expect(headerFunction).not.toContain('NEW."sourceStockCountAttemptLineId"');
  });
});
