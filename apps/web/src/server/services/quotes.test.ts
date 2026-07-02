import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertQuotationRecommendationJustification,
  evaluateQuotationRecommendation,
  parseSupplierQuoteLineInputs
} from "./quotes";

describe("quotation recommendation rules", () => {
  test("parses multiple supplier quote lines from the capture form", () => {
    const formData = new FormData();
    formData.append("sourcePrLineId", "11111111-1111-4111-8111-111111111111");
    formData.append("lineQuantity", "12");
    formData.append("lineUomId", "22222222-2222-4222-8222-222222222222");
    formData.append("lineUnitPrice", "150.25");
    formData.append("lineAvailabilityStatus", "Available");
    formData.append("lineLeadTimeDays", "3");
    formData.append("lineNotes", "Full case pack");
    formData.append("sourcePrLineId", "33333333-3333-4333-8333-333333333333");
    formData.append("lineQuantity", "4");
    formData.append("lineUomId", "44444444-4444-4444-8444-444444444444");
    formData.append("lineUnitPrice", "88");
    formData.append("lineAvailabilityStatus", "Partial");
    formData.append("lineLeadTimeDays", "");
    formData.append("lineNotes", "");

    expect(parseSupplierQuoteLineInputs(formData)).toEqual([
      {
        sourcePrLineId: "11111111-1111-4111-8111-111111111111",
        quantity: 12,
        uomId: "22222222-2222-4222-8222-222222222222",
        unitPrice: 150.25,
        availabilityStatus: "Available",
        leadTimeDays: 3,
        notes: "Full case pack"
      },
      {
        sourcePrLineId: "33333333-3333-4333-8333-333333333333",
        quantity: 4,
        uomId: "44444444-4444-4444-8444-444444444444",
        unitPrice: 88,
        availabilityStatus: "Partial",
        leadTimeDays: undefined,
        notes: undefined
      }
    ]);
  });

  test("requires quote capture to preserve every approved request line", () => {
    const source = readFileSync(path.resolve(__dirname, "quotes.ts"), "utf8");

    expect(source).toContain("SUPPLIER_QUOTE_LINE_DUPLICATE");
    expect(source).toContain("SUPPLIER_QUOTE_LINES_INCOMPLETE");
    expect(source).toContain("SUPPLIER_QUOTE_LINES_LIMIT_EXCEEDED");
    expect(source).toContain("create: quoteLines");
    expect(source).toContain("lineCount: quoteLines.length");
    expect(source).not.toContain('take: 1,\n        include: {\n          item: true,\n          uom: true');
  });

  test("identifies the selected quote and lowest evaluated total", () => {
    const evaluation = evaluateQuotationRecommendation(
      [
        { id: "quote-a", totalAmount: 150, currencyCode: "PHP" },
        { id: "quote-b", totalAmount: 125, currencyCode: "PHP" }
      ],
      "quote-b"
    );

    expect(evaluation).toEqual({
      selectedEvaluatedTotal: 125,
      lowestEvaluatedTotal: 125,
      quoteCount: 2,
      currencyCode: "PHP",
      isLowestEvaluatedCost: true
    });
  });

  test("requires justification for a non-lowest recommendation", () => {
    expect(() =>
      assertQuotationRecommendationJustification({
        quoteCount: 2,
        isLowestEvaluatedCost: false
      })
    ).toThrow("NON_LOWEST_JUSTIFICATION_REQUIRED");

    expect(() =>
      assertQuotationRecommendationJustification({
        quoteCount: 2,
        isLowestEvaluatedCost: false,
        nonLowestJustification: "Shorter lead time protects branch opening."
      })
    ).not.toThrow();
  });

  test("requires single-source justification when only one quote exists", () => {
    expect(() =>
      assertQuotationRecommendationJustification({
        quoteCount: 1,
        isLowestEvaluatedCost: true
      })
    ).toThrow("SINGLE_SOURCE_JUSTIFICATION_REQUIRED");

    expect(() =>
      assertQuotationRecommendationJustification({
        quoteCount: 1,
        isLowestEvaluatedCost: true,
        singleSourceJustification: "Only accredited supplier available."
      })
    ).not.toThrow();
  });

  test("blocks mixed-currency comparisons until evaluated FX policy exists", () => {
    expect(() =>
      evaluateQuotationRecommendation(
        [
          { id: "quote-a", totalAmount: 150, currencyCode: "PHP" },
          { id: "quote-b", totalAmount: 125, currencyCode: "USD" }
        ],
        "quote-b"
      )
    ).toThrow("MIXED_CURRENCY_QUOTES_UNSUPPORTED");
  });

  test("records quotation recommendation approval routing as an active control", () => {
    const source = readFileSync(path.resolve(__dirname, "quotes.ts"), "utf8");

    expect(source).toContain('documentType: "QuotationRecommendation"');
    expect(source).toContain("requiredBeforePurchaseOrder: true");
    expect(source).toContain('status: "DRAFT_NOT_SUBMITTED"');
    expect(source).not.toContain("approvalRoutingDeferred");
  });
});
