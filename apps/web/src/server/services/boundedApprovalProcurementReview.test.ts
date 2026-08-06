import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderProcurementReview,
  buildPurchaseRequestProcurementReview,
  buildQuotationRecommendationProcurementReview,
} from "./boundedApprovalProcurementReview";
import type { EligibleApprovalStep } from "./approvalRouting";

const ids = {
  approval: "00000000-0000-4000-8000-000000000101",
  step: "00000000-0000-4000-8000-000000000102",
  request: "00000000-0000-4000-8000-000000000103",
  requestLine1: "00000000-0000-4000-8000-000000000104",
  requestLine2: "00000000-0000-4000-8000-000000000105",
  company: "00000000-0000-4000-8000-000000000106",
  brand: "00000000-0000-4000-8000-000000000107",
  location: "00000000-0000-4000-8000-000000000108",
  department: "00000000-0000-4000-8000-000000000109",
  costCenter: "00000000-0000-4000-8000-000000000110",
  user: "00000000-0000-4000-8000-000000000111",
  item1: "00000000-0000-4000-8000-000000000112",
  item2: "00000000-0000-4000-8000-000000000113",
  uomKg: "00000000-0000-4000-8000-000000000114",
  uomCase: "00000000-0000-4000-8000-000000000115",
  recommendation: "00000000-0000-4000-8000-000000000116",
  quotationRequest: "00000000-0000-4000-8000-000000000117",
  quote1: "00000000-0000-4000-8000-000000000118",
  quote2: "00000000-0000-4000-8000-000000000119",
  quoteLine1: "00000000-0000-4000-8000-000000000120",
  quoteLine2: "00000000-0000-4000-8000-000000000121",
  supplier1: "00000000-0000-4000-8000-000000000122",
  supplier2: "00000000-0000-4000-8000-000000000123",
  order: "00000000-0000-4000-8000-000000000124",
  orderLine1: "00000000-0000-4000-8000-000000000125",
  orderLine2: "00000000-0000-4000-8000-000000000126",
  evidence: "00000000-0000-4000-8000-000000000127",
};

function eligible(documentType: string, documentId = ids.request): EligibleApprovalStep {
  return {
    approvalInstanceId: ids.approval,
    approvalInstanceStepId: ids.step,
    documentType,
    documentId,
    stepOrder: 1,
    assignedUserId: ids.user,
    assignedRoleId: null,
    requiredPermissionCode: "purchasing.purchase_request.approve",
    activatedAt: new Date("2026-08-06T01:00:00.000Z"),
    dueAt: new Date("2026-08-07T01:00:00.000Z"),
  };
}

const company = {
  id: ids.company,
  code: "OGF",
  legalName: "One Gourmet Foods Inc.",
  tradingName: "One Gourmet",
  currencyCode: "PHP",
};
const brand = { id: ids.brand, code: "YL", name: "Yakiniku Like" };
const location = { id: ids.location, code: "YL-SM-NORTH", name: "YL SM North" };
const department = { id: ids.department, code: "OPS", name: "Operations" };
const costCenter = { id: ids.costCenter, code: "STORE", name: "Store Operations" };
const requester = { id: ids.user, displayName: "Branch Requester" };

function evidence(sourceRecordId: string) {
  return {
    id: ids.evidence,
    sourceRecordId,
    sourceLineId: null,
    purpose: "EVIDENCE",
    caption: "Approved supporting document",
    requiredForAction: "APPROVE",
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    attachment: {
      originalFilename: "evidence.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadState: "CONSUMED",
      scanState: "CLEAN",
      availabilityState: "AVAILABLE",
    },
  };
}

function purchaseRequestLines() {
  return [
    {
      id: ids.requestLine2,
      lineNumber: 2,
      itemId: ids.item2,
      uomId: ids.uomCase,
      description: "Beverage cases",
      requestedQty: "3.000000",
      estimatedUnitCost: "900.000000",
      estimatedLineTotal: "2700.000000",
      budgetLineId: null,
      uomCode: "CASE",
      purpose: "Opening service",
      notes: null,
      item: { itemCode: "BEV-01", itemName: "Calamansi Juice" },
      uom: { uomCode: "CASE" },
    },
    {
      id: ids.requestLine1,
      lineNumber: 1,
      itemId: ids.item1,
      uomId: ids.uomKg,
      description: "Beef cut",
      requestedQty: "12.500000",
      estimatedUnitCost: "500.000000",
      estimatedLineTotal: "6250.000000",
      budgetLineId: null,
      uomCode: "KG",
      purpose: "Service demand",
      notes: "Keep chilled",
      item: { itemCode: "MEAT-01", itemName: "Beef Harami" },
      uom: { uomCode: "KG" },
    },
  ];
}

describe("bounded procurement approval review adapters", () => {
  it("builds a deterministic Purchase Request digest from complete ordered raw-value lines", () => {
    const request = {
      id: ids.request,
      publicReference: "PR-2026-0001",
      status: "PENDING_APPROVAL",
      version: 4,
      urgency: "HIGH",
      requiredDate: new Date("2026-08-10T00:00:00.000Z"),
      justification: "High-risk opening stock",
      createdAt: new Date("2026-08-05T00:00:00.000Z"),
      updatedAt: new Date("2026-08-06T00:00:00.000Z"),
      company,
      brand,
      requestLocation: location,
      department,
      costCenter,
      requester,
      comments: [],
      lines: purchaseRequestLines(),
    };
    const first = buildPurchaseRequestProcurementReview({
      eligible: eligible("PurchaseRequest"),
      request,
      evidence: [evidence(ids.request)],
    });
    const second = buildPurchaseRequestProcurementReview({
      eligible: eligible("PurchaseRequest"),
      request: { ...request, lines: [...request.lines].reverse() },
      evidence: [evidence(ids.request)],
    });

    expect(first.reviewDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.reviewDigest).toBe(first.reviewDigest);
    expect(first.canonicalSnapshot.source.lines.map((line) => line.lineNumber)).toEqual([1, 2]);
    expect(first.presentation.lines.map((line) => line.quantity)).toEqual([
      { raw: "12.500000", uomCode: "KG" },
      { raw: "3.000000", uomCode: "CASE" },
    ]);
    expect(first.presentation.amounts[0]).toEqual({
      label: "Estimated total",
      raw: "8950",
      currencyCode: "PHP",
    });
  });

  it("includes every competing quotation and selected-quote evidence without aggregating UOM quantities", () => {
    const quote = (input: {
      id: string;
      supplierId: string;
      reference: string;
      total: string;
      lineId: string;
      sourceLineId: string;
      sourceLineNumber: number;
      uomId: string;
      uomCode: string;
      quantity: string;
    }) => ({
      id: input.id,
      quoteReference: input.reference,
      quoteDate: new Date("2026-08-05T00:00:00.000Z"),
      validityDate: new Date("2026-08-20T00:00:00.000Z"),
      currencyCode: "PHP",
      subtotalAmount: input.total,
      taxAmount: "0",
      discountAmount: "0",
      freightAmount: "0",
      otherChargesAmount: "0",
      totalAmount: input.total,
      terms: "Net 15",
      supplierAccreditationSnapshot: "APPROVED",
      status: "RECORDED",
      supplier: {
        id: input.supplierId,
        supplierCode: input.reference,
        legalName: `${input.reference} Supplier Inc.`,
        tradingName: `${input.reference} Supplier`,
        accreditationStatus: "APPROVED",
      },
      lines: [
        {
          id: input.lineId,
          sourcePrLineId: input.sourceLineId,
          itemId: ids.item1,
          quantity: input.quantity,
          uomId: input.uomId,
          unitPrice: "500",
          lineTotal: input.total,
          availabilityStatus: "AVAILABLE",
          leadTimeDays: 2,
          notes: null,
          item: { itemCode: "MEAT-01", itemName: "Beef Harami" },
          uom: { uomCode: input.uomCode },
          sourcePrLine: {
            lineNumber: input.sourceLineNumber,
            description: "Beef cut",
          },
        },
      ],
    });
    const recommendation = {
      id: ids.recommendation,
      status: "PENDING_APPROVAL",
      version: 2,
      updatedAt: new Date("2026-08-06T00:00:00.000Z"),
      submittedAt: new Date("2026-08-06T00:00:00.000Z"),
      quotationRequestId: ids.quotationRequest,
      selectedSupplierQuotationId: ids.quote2,
      currencyCode: "PHP",
      selectedEvaluatedTotal: "6500",
      lowestEvaluatedTotal: "6200",
      quoteCount: 2,
      isLowestEvaluatedCost: false,
      selectionReason: "Cold-chain reliability",
      nonLowestJustification: "Lower spoilage risk",
      singleSourceJustification: null,
      evaluationSnapshot: { scoringVersion: 1, weightedScores: [82, 91] },
      preparedBy: { id: ids.user, displayName: "Purchasing Officer" },
      company,
      quotationRequest: {
        publicReference: "QR-2026-0001",
        purchaseRequest: {
          id: ids.request,
          publicReference: "PR-2026-0001",
          status: "APPROVED",
          version: 4,
          requesterUserId: "00000000-0000-4000-8000-000000000999",
          requiredDate: new Date("2026-08-10T00:00:00.000Z"),
          brand,
          requestLocation: location,
          department,
          costCenter,
        },
        supplierQuotes: [
          quote({
            id: ids.quote2,
            supplierId: ids.supplier2,
            reference: "QUOTE-B",
            total: "6500",
            lineId: ids.quoteLine2,
            sourceLineId: ids.requestLine2,
            sourceLineNumber: 2,
            uomId: ids.uomCase,
            uomCode: "CASE",
            quantity: "3",
          }),
          quote({
            id: ids.quote1,
            supplierId: ids.supplier1,
            reference: "QUOTE-A",
            total: "6200",
            lineId: ids.quoteLine1,
            sourceLineId: ids.requestLine1,
            sourceLineNumber: 1,
            uomId: ids.uomKg,
            uomCode: "KG",
            quantity: "12.5",
          }),
        ],
      },
    };
    const result = buildQuotationRecommendationProcurementReview({
      eligible: eligible("QuotationRecommendation", ids.recommendation),
      recommendation,
      evidence: [evidence(ids.quote2)],
    });

    expect(result.canonicalSnapshot.source.quotes).toHaveLength(2);
    expect(result.presentation.quoteComparisons).toHaveLength(2);
    expect(result.presentation.quoteComparisons.find((item) => item.selected)?.evidence).toHaveLength(1);
    expect(result.presentation.quoteComparisons.map((item) => item.lines[0]?.quantity)).toEqual([
      { raw: "12.5", uomCode: "KG" },
      { raw: "3", uomCode: "CASE" },
    ]);
    expect(result.presentation.riskFlags).toContain("NON_LOWEST_QUOTE_SELECTED");
  });

  it("fails closed for family mismatch and preserves every Purchase Order line independently", () => {
    expect(() =>
      buildPurchaseOrderProcurementReview({
        eligible: eligible("PurchaseRequest", ids.order),
        order: {} as never,
        evidence: [],
      }),
    ).toThrow("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");

    const result = buildPurchaseOrderProcurementReview({
      eligible: eligible("PurchaseOrder", ids.order),
      order: {
        id: ids.order,
        publicReference: "PO-2026-0001",
        status: "PENDING_APPROVAL",
        updatedAt: new Date("2026-08-06T00:00:00.000Z"),
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
        expectedDeliveryDate: new Date("2026-08-10T00:00:00.000Z"),
        currencyCode: "PHP",
        subtotalAmount: "8950",
        taxAmount: "0",
        discountAmount: "0",
        totalAmount: "8950",
        sourceSnapshot: {
          schemaVersion: 1,
          quotationRecommendationId: ids.recommendation,
        },
        company,
        brand,
        deliveryLocation: location,
        department,
        costCenter,
        createdBy: { id: ids.user, displayName: "Purchasing Officer" },
        supplier: {
          id: ids.supplier1,
          supplierCode: "SUP-01",
          legalName: "Supplier Inc.",
          tradingName: "Supplier",
          accreditationStatus: "APPROVED",
        },
        purchaseRequest: {
          ...{
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
          id: ids.request,
          publicReference: "PR-2026-0001",
          version: 4,
          requesterUserId: "00000000-0000-4000-8000-000000000998",
        },
        quotationRecommendation: {
          ...{
            evaluationSnapshot: { scoringVersion: 1 },
          },
          id: ids.recommendation,
          version: 2,
          updatedAt: new Date("2026-08-06T00:00:00.000Z"),
          preparedByUserId: "00000000-0000-4000-8000-000000000997",
          selectedSupplierQuotationId: ids.quote1,
        },
        selectedSupplierQuotation: {
          id: ids.quote1,
          quoteReference: "QUOTE-A",
          quoteDate: new Date("2026-08-05T00:00:00.000Z"),
          validityDate: null,
          currencyCode: "PHP",
          totalAmount: "8950",
          supplierAccreditationSnapshot: "APPROVED",
        },
        lines: purchaseRequestLines().map((line, index) => ({
          id: index === 0 ? ids.orderLine2 : ids.orderLine1,
          lineNumber: line.lineNumber,
          sourcePrLineId: line.id,
          sourceSupplierQuoteLineId: index === 0 ? ids.quoteLine2 : ids.quoteLine1,
          itemId: line.itemId,
          uomId: line.uomId!,
          description: line.description,
          orderedQty: line.requestedQty,
          receivedQty: "0",
          cancelledQty: "0",
          unitPrice: line.estimatedUnitCost,
          taxAmount: "0",
          discountAmount: "0",
          lineTotal: line.estimatedLineTotal,
          budgetLineId: null,
          availabilityStatus: "AVAILABLE",
          leadTimeDays: 2,
          notes: line.notes,
          item: line.item,
          uom: line.uom!,
        })),
      },
      evidence: [evidence(ids.order)],
    });

    expect(result.presentation.lines.map((line) => line.quantity)).toEqual([
      { raw: "12.500000", uomCode: "KG" },
      { raw: "3.000000", uomCode: "CASE" },
    ]);
    expect(result.canonicalSnapshot.source.lines).toHaveLength(2);
    expect(Object.keys(result.canonicalSnapshot.source.purchaseRequest)).toEqual([
      "id",
      "publicReference",
      "version",
      "requesterUserId",
    ]);
    expect(Object.keys(result.canonicalSnapshot.source.quotationRecommendation)).toEqual([
      "id",
      "version",
      "updatedAt",
      "preparedByUserId",
      "selectedSupplierQuotationId",
    ]);
    expect(result.sourceRevision).toBe("updatedAt:2026-08-06T00:00:00.000Z");
  });
});
