import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertStockCountCanCancel,
  assertStockCountCanEnter,
  assertStockCountCanGenerateAdjustment,
  assertStockCountCanReview,
  assertStockCountCanStart,
  assertStockCountCanSubmit,
  assertStockCountReviewerSegregation,
  calculateCountVariance,
  filterCountVarianceLines
} from "./stockCounts";

describe("stock count foundation rules", () => {
  test("list page gate allows every stock-count action permission", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/counts/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canUseStockCounts(session.permissionCodes)");
  });

  test("service read gate allows every stock-count action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "stockCounts.ts"), "utf8");

    expect(source).toContain("canUseStockCounts(session.permissionCodes)");
  });

  test("starts draft counts only", () => {
    expect(() => assertStockCountCanStart("DRAFT")).not.toThrow();
    expect(() => assertStockCountCanStart("IN_PROGRESS")).toThrow(
      "STOCK_COUNT_NOT_DRAFT_FOR_START"
    );
  });

  test("allows entry and submit only while open", () => {
    expect(() => assertStockCountCanEnter("IN_PROGRESS")).not.toThrow();
    expect(() => assertStockCountCanEnter("RECOUNT_REQUESTED")).not.toThrow();
    expect(() => assertStockCountCanEnter("SUBMITTED")).toThrow(
      "STOCK_COUNT_NOT_OPEN_FOR_ENTRY"
    );

    expect(() => assertStockCountCanSubmit("IN_PROGRESS")).not.toThrow();
    expect(() => assertStockCountCanSubmit("RECOUNT_REQUESTED")).not.toThrow();
    expect(() => assertStockCountCanSubmit("REVIEWED")).toThrow(
      "STOCK_COUNT_NOT_OPEN_FOR_SUBMIT"
    );
  });

  test("reviews submitted counts only", () => {
    expect(() => assertStockCountCanReview("SUBMITTED")).not.toThrow();
    expect(() => assertStockCountCanReview("IN_PROGRESS")).toThrow(
      "STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW"
    );
  });

  test("blocks creator or counter from reviewing their own count", () => {
    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "reviewer-1",
        createdByUserId: "creator-1",
        countedByUserIds: ["counter-1", null]
      })
    ).not.toThrow();

    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "user-1",
        createdByUserId: "user-1",
        countedByUserIds: ["counter-1"]
      })
    ).toThrow("STOCK_COUNT_SELF_REVIEW_BLOCKED");

    expect(() =>
      assertStockCountReviewerSegregation({
        reviewerUserId: "counter-1",
        createdByUserId: "creator-1",
        countedByUserIds: ["counter-1"]
      })
    ).toThrow("STOCK_COUNT_SELF_REVIEW_BLOCKED");
  });

  test("generates variance adjustments from reviewed counts only", () => {
    expect(() => assertStockCountCanGenerateAdjustment("REVIEWED")).not.toThrow();
    expect(() => assertStockCountCanGenerateAdjustment("SUBMITTED")).toThrow(
      "STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT"
    );
  });

  test("blocks cancellation after review or cancellation", () => {
    expect(() => assertStockCountCanCancel("DRAFT")).not.toThrow();
    expect(() => assertStockCountCanCancel("SUBMITTED")).not.toThrow();
    expect(() => assertStockCountCanCancel("REVIEWED")).toThrow(
      "STOCK_COUNT_NOT_CANCELLABLE"
    );
    expect(() => assertStockCountCanCancel("CANCELLED")).toThrow(
      "STOCK_COUNT_NOT_CANCELLABLE"
    );
  });

  test("calculates variance from immutable snapshot", () => {
    expect(calculateCountVariance(8, 10)).toBe(-2);
    expect(calculateCountVariance(12, 10)).toBe(2);
    expect(calculateCountVariance(10, 10)).toBe(0);
    expect(() => calculateCountVariance(-1, 10)).toThrow(
      "STOCK_COUNT_QUANTITY_INVALID"
    );
  });

  test("filters only counted non-zero variance lines", () => {
    const lines = [
      {
        countedQuantityBaseUom: 10,
        varianceQuantityBaseUom: 0
      },
      {
        countedQuantityBaseUom: 8,
        varianceQuantityBaseUom: -2
      },
      {
        countedQuantityBaseUom: 12,
        varianceQuantityBaseUom: 2
      }
    ];

    expect(filterCountVarianceLines(lines)).toHaveLength(2);
    expect(() =>
      filterCountVarianceLines([
        {
          countedQuantityBaseUom: null,
          varianceQuantityBaseUom: null
        }
      ])
    ).toThrow("STOCK_COUNT_HAS_UNCOUNTED_LINES");
  });

  test("migration guards count-derived adjustments against duplicates", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701001000_stock_count_variance_adjustment_bridge/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("COUNT_VARIANCE");
    expect(migration).toContain(
      '"StockAdjustment_sourceStockCountSessionId_key"'
    );
    expect(migration).toContain(
      '"StockAdjustmentLine_sourceStockCountLineId_key"'
    );
    expect(migration).toContain(
      '"sourceDocumentType" = \'StockCountSession\''
    );
  });

  test("stock count export includes line variance detail without breaking blind-count review controls", () => {
    const source = readFileSync(path.resolve(__dirname, "stockCounts.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/counts/export/route.ts"),
      "utf8"
    );

    expect(source).toContain("buildStockCountExportRows");
    expect(source).toContain('"System Qty"');
    expect(source).toContain('"Counted Qty"');
    expect(source).toContain('"Variance Qty"');
    expect(source).toContain("permissions.stockCountReview");
    expect(source).toContain("canShowSystemQuantity ? Number(line.systemQuantityBaseUom) : \"\"");
    expect(source).toContain(
      "canShowSystemQuantity && line.varianceQuantityBaseUom !== null"
    );
    expect(route).toContain("buildStockCountExportRows(session)");
    expect(route).toContain("exportErrorResponse(error)");
  });
});
