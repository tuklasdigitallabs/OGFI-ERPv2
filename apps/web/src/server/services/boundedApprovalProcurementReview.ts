import { createHash } from "node:crypto";
import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import type { EligibleApprovalStep } from "./approvalRouting";
import type { SessionContext } from "./context";

export const boundedApprovalProcurementFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
] as const;

type BoundedApprovalProcurementReviewClient = Pick<
  TransactionClient,
  | "controlledEvidenceAttachment"
  | "purchaseOrder"
  | "purchaseRequest"
  | "quotationRecommendation"
  | "userScopeAssignment"
>;

export type BoundedApprovalProcurementFamily =
  (typeof boundedApprovalProcurementFamilies)[number];

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export type ProcurementReviewEvidence = {
  id: string;
  sourceRecordId: string;
  sourceLineId: string | null;
  purpose: string;
  caption: string | null;
  requiredForAction: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadState: string;
  scanState: string;
  availabilityState: string;
  createdAt: string;
  updatedAt: string;
};

export type ProcurementReviewLine = {
  id: string;
  lineNumber: number | null;
  itemCode: string | null;
  itemName: string | null;
  description: string;
  quantity: { raw: string; uomCode: string };
  unitAmount: { raw: string; currencyCode: string } | null;
  lineAmount: { raw: string; currencyCode: string } | null;
  purpose: string | null;
  availabilityStatus: string | null;
  leadTimeDays: number | null;
  notes: string | null;
};

export type ProcurementReviewPresentation = {
  heading: string;
  publicReference: string;
  status: string;
  scope: {
    company: { id: string; code: string; name: string };
    brand: { id: string; code: string; name: string } | null;
    location: { id: string; code: string; name: string };
    department: { id: string; code: string; name: string } | null;
    costCenter: { id: string; code: string; name: string } | null;
  };
  owner: { userId: string; displayName: string; roleLabel: string };
  dates: Array<{ label: string; value: string }>;
  approval: {
    stepOrder: number;
    activatedAt: string;
    dueAt: string | null;
  };
  amounts: Array<{
    label: string;
    raw: string;
    currencyCode: string;
  }>;
  rationale: Array<{ label: string; value: string }>;
  riskFlags: string[];
  evidence: ProcurementReviewEvidence[];
  lines: ProcurementReviewLine[];
  quoteComparisons: Array<{
    quoteId: string;
    quoteReference: string;
    supplierName: string;
    supplierAccreditationStatus: string;
    status: string;
    selected: boolean;
    quoteDate: string;
    validityDate: string | null;
    currencyCode: string;
    subtotalAmount: string;
    taxAmount: string;
    discountAmount: string;
    freightAmount: string;
    otherChargesAmount: string;
    totalAmount: string;
    terms: string | null;
    evidenceAccess: "AUTHORIZED";
    evidence: ProcurementReviewEvidence[];
    lines: ProcurementReviewLine[];
  }>;
};

type CanonicalApprovalContext = {
  approvalInstanceId: string;
  approvalInstanceStepId: string;
  stepOrder: number;
  activatedAt: string;
  dueAt: string | null;
  requiredPermissionCode: string;
};

type CanonicalScope = ProcurementReviewPresentation["scope"];

export type PurchaseRequestCanonicalReviewSnapshot = {
  schemaVersion: 1;
  family: "PurchaseRequest";
  approval: CanonicalApprovalContext;
  source: {
    id: string;
    publicReference: string;
    status: string;
    version: number;
    urgency: string;
    currencyCode: string;
    requiredDate: string;
    justification: string;
    createdAt: string;
    updatedAt: string;
    scope: CanonicalScope;
    requester: { id: string; displayName: string };
    evidence: ProcurementReviewEvidence[];
    comments: Array<{
      id: string;
      authorUserId: string;
      authorName: string;
      body: string;
      createdAt: string;
    }>;
    lines: Array<{
      id: string;
      lineNumber: number;
      itemId: string | null;
      itemCode: string | null;
      itemName: string | null;
      uomId: string | null;
      uomCode: string;
      description: string;
      requestedQty: string;
      estimatedUnitCost: string;
      estimatedLineTotal: string;
      budgetLineId: string | null;
      purpose: string;
      notes: string | null;
    }>;
  };
};

export type QuotationRecommendationCanonicalReviewSnapshot = {
  schemaVersion: 1;
  family: "QuotationRecommendation";
  approval: CanonicalApprovalContext;
  source: {
    id: string;
    status: string;
    version: number;
    updatedAt: string;
    submittedAt: string | null;
    quotationRequestId: string;
    quotationRequestReference: string;
    selectedSupplierQuotationId: string;
    currencyCode: string;
    selectedEvaluatedTotal: string;
    lowestEvaluatedTotal: string;
    quoteCount: number;
    isLowestEvaluatedCost: boolean;
    selectionReason: string;
    nonLowestJustification: string | null;
    singleSourceJustification: string | null;
    evaluationSnapshot: CanonicalJson;
    scope: CanonicalScope;
    preparedBy: { id: string; displayName: string };
    purchaseRequest: {
      id: string;
      publicReference: string;
      status: string;
      version: number;
      requesterUserId: string;
      requiredDate: string;
    };
    quotes: Array<{
      id: string;
      supplier: {
        id: string;
        supplierCode: string;
        name: string;
        accreditationStatus: string;
      };
      quoteReference: string;
      quoteDate: string;
      validityDate: string | null;
      currencyCode: string;
      subtotalAmount: string;
      taxAmount: string;
      discountAmount: string;
      freightAmount: string;
      otherChargesAmount: string;
      totalAmount: string;
      terms: string | null;
      supplierAccreditationSnapshot: string | null;
      status: string;
      evidence: ProcurementReviewEvidence[];
      lines: Array<{
        id: string;
        sourcePrLineId: string | null;
        sourcePrLineNumber: number | null;
        sourcePrDescription: string | null;
        itemId: string | null;
        itemCode: string | null;
        itemName: string | null;
        quantity: string;
        uomId: string;
        uomCode: string;
        unitPrice: string;
        lineTotal: string;
        availabilityStatus: string;
        leadTimeDays: number | null;
        notes: string | null;
      }>;
    }>;
  };
};

export type PurchaseOrderCanonicalReviewSnapshot = {
  schemaVersion: 1;
  family: "PurchaseOrder";
  approval: CanonicalApprovalContext;
  source: {
    id: string;
    publicReference: string;
    status: string;
    updatedAt: string;
    createdAt: string;
    expectedDeliveryDate: string;
    currencyCode: string;
    subtotalAmount: string;
    taxAmount: string;
    discountAmount: string;
    totalAmount: string;
    sourceSnapshot: CanonicalJson;
    scope: CanonicalScope;
    createdBy: { id: string; displayName: string };
    supplier: {
      id: string;
      supplierCode: string;
      name: string;
      accreditationStatus: string;
    };
    purchaseRequest: {
      id: string;
      publicReference: string;
      version: number;
      requesterUserId: string;
    };
    quotationRecommendation: {
      id: string;
      version: number;
      updatedAt: string;
      preparedByUserId: string;
      selectedSupplierQuotationId: string;
    };
    selectedSupplierQuotation: {
      id: string;
      quoteReference: string;
      quoteDate: string;
      validityDate: string | null;
      currencyCode: string;
      totalAmount: string;
      supplierAccreditationSnapshot: string | null;
    };
    evidence: ProcurementReviewEvidence[];
    lines: Array<{
      id: string;
      lineNumber: number;
      sourcePrLineId: string | null;
      sourceSupplierQuoteLineId: string | null;
      itemId: string | null;
      itemCode: string | null;
      itemName: string | null;
      uomId: string;
      uomCode: string;
      description: string;
      orderedQty: string;
      receivedQty: string;
      cancelledQty: string;
      unitPrice: string;
      taxAmount: string;
      discountAmount: string;
      lineTotal: string;
      budgetLineId: string | null;
      availabilityStatus: string | null;
      leadTimeDays: number | null;
      notes: string | null;
    }>;
  };
};

export type BoundedApprovalProcurementReview =
  | {
      family: "PurchaseRequest";
      sourceRevision: string;
      reviewDigest: string;
      sourceHref: string;
      sourceAccess: "AUTHORIZED";
      presentation: ProcurementReviewPresentation;
      canonicalSnapshot: PurchaseRequestCanonicalReviewSnapshot;
    }
  | {
      family: "QuotationRecommendation";
      sourceRevision: string;
      reviewDigest: string;
      sourceHref: string;
      sourceAccess: "AUTHORIZED";
      presentation: ProcurementReviewPresentation;
      canonicalSnapshot: QuotationRecommendationCanonicalReviewSnapshot;
    }
  | {
      family: "PurchaseOrder";
      sourceRevision: string;
      reviewDigest: string;
      sourceHref: string;
      sourceAccess: "AUTHORIZED";
      presentation: ProcurementReviewPresentation;
      canonicalSnapshot: PurchaseOrderCanonicalReviewSnapshot;
    };

type EvidenceRow = {
  id: string;
  sourceRecordId: string;
  sourceLineId: string | null;
  purpose: string;
  caption: string | null;
  requiredForAction: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachment: {
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadState: string;
    scanState: string;
    availabilityState: string;
  };
};

function unavailable(): never {
  throw new Error("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
}

function decimalRaw(value: { toString(): string }) {
  return value.toString();
}

function iso(value: Date) {
  return value.toISOString();
}

function canonicalizeUnknown(value: unknown): CanonicalJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return unavailable();
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeUnknown);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalizeUnknown(child)]),
    );
  }
  return unavailable();
}

export function canonicalProcurementReviewJson(value: CanonicalJson) {
  return JSON.stringify(canonicalizeUnknown(value));
}

export function procurementReviewDigest(value: CanonicalJson) {
  return createHash("sha256")
    .update(canonicalProcurementReviewJson(value), "utf8")
    .digest("hex");
}

function approvalContext(eligible: EligibleApprovalStep): CanonicalApprovalContext {
  return {
    approvalInstanceId: eligible.approvalInstanceId,
    approvalInstanceStepId: eligible.approvalInstanceStepId,
    stepOrder: eligible.stepOrder,
    activatedAt: iso(eligible.activatedAt),
    dueAt: eligible.dueAt ? iso(eligible.dueAt) : null,
    requiredPermissionCode: eligible.requiredPermissionCode,
  };
}

function evidenceRows(rows: EvidenceRow[]): ProcurementReviewEvidence[] {
  return rows
    .map((row) => ({
      id: row.id,
      sourceRecordId: row.sourceRecordId,
      sourceLineId: row.sourceLineId,
      purpose: row.purpose,
      caption: row.caption,
      requiredForAction: row.requiredForAction,
      originalFilename: row.attachment.originalFilename,
      mimeType: row.attachment.mimeType,
      sizeBytes: row.attachment.sizeBytes,
      uploadState: row.attachment.uploadState,
      scanState: row.attachment.scanState,
      availabilityState: row.attachment.availabilityState,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }))
    .sort((left, right) =>
      `${left.sourceRecordId}:${left.sourceLineId ?? ""}:${left.id}`.localeCompare(
        `${right.sourceRecordId}:${right.sourceLineId ?? ""}:${right.id}`,
      ),
    );
}

function riskFlagsForEvidence(evidence: ProcurementReviewEvidence[]) {
  const flags: string[] = [];
  if (evidence.length === 0) flags.push("NO_CONTROLLED_EVIDENCE_ATTACHED");
  if (evidence.some((item) => item.availabilityState !== "AVAILABLE")) {
    flags.push("EVIDENCE_NOT_AVAILABLE");
  }
  return flags;
}

function scope(input: {
  company: { id: string; code: string; legalName: string; tradingName: string | null };
  brand: { id: string; code: string; name: string } | null;
  location: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  costCenter: { id: string; code: string; name: string } | null;
}): CanonicalScope {
  return {
    company: {
      id: input.company.id,
      code: input.company.code,
      name: input.company.tradingName ?? input.company.legalName,
    },
    brand: input.brand,
    location: input.location,
    department: input.department,
    costCenter: input.costCenter,
  };
}

type PurchaseRequestBuilderInput = {
  eligible: EligibleApprovalStep;
  request: {
    id: string;
    publicReference: string;
    status: string;
    version: number;
    urgency: string;
    requiredDate: Date;
    justification: string;
    createdAt: Date;
    updatedAt: Date;
    company: {
      id: string;
      code: string;
      legalName: string;
      tradingName: string | null;
      currencyCode: string;
    };
    brand: { id: string; code: string; name: string } | null;
    requestLocation: { id: string; code: string; name: string };
    department: { id: string; code: string; name: string } | null;
    costCenter: { id: string; code: string; name: string } | null;
    requester: { id: string; displayName: string };
    comments: Array<{
      id: string;
      authorUserId: string;
      body: string;
      createdAt: Date;
      author: { displayName: string };
    }>;
    lines: Array<{
      id: string;
      lineNumber: number;
      itemId: string | null;
      uomId: string | null;
      description: string;
      requestedQty: { toString(): string };
      estimatedUnitCost: { toString(): string };
      estimatedLineTotal: { toString(): string };
      budgetLineId: string | null;
      uomCode: string;
      purpose: string;
      notes: string | null;
      item: { itemCode: string; itemName: string } | null;
      uom: { uomCode: string } | null;
    }>;
  };
  evidence: EvidenceRow[];
};

export function buildPurchaseRequestProcurementReview(
  input: PurchaseRequestBuilderInput,
): Extract<BoundedApprovalProcurementReview, { family: "PurchaseRequest" }> {
  if (
    input.eligible.documentType !== "PurchaseRequest" ||
    input.eligible.documentId !== input.request.id ||
    input.request.status !== "PENDING_APPROVAL" ||
    input.request.lines.length === 0
  ) {
    return unavailable();
  }
  const requestScope = scope({
    company: input.request.company,
    brand: input.request.brand,
    location: input.request.requestLocation,
    department: input.request.department,
    costCenter: input.request.costCenter,
  });
  const evidence = evidenceRows(input.evidence);
  const lines = [...input.request.lines]
    .sort((left, right) => left.lineNumber - right.lineNumber || left.id.localeCompare(right.id))
    .map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      itemId: line.itemId,
      itemCode: line.item?.itemCode ?? null,
      itemName: line.item?.itemName ?? null,
      uomId: line.uomId,
      uomCode: line.uom?.uomCode ?? line.uomCode,
      description: line.description,
      requestedQty: decimalRaw(line.requestedQty),
      estimatedUnitCost: decimalRaw(line.estimatedUnitCost),
      estimatedLineTotal: decimalRaw(line.estimatedLineTotal),
      budgetLineId: line.budgetLineId,
      purpose: line.purpose,
      notes: line.notes,
    }));
  const canonicalSnapshot: PurchaseRequestCanonicalReviewSnapshot = {
    schemaVersion: 1,
    family: "PurchaseRequest",
    approval: approvalContext(input.eligible),
    source: {
      id: input.request.id,
      publicReference: input.request.publicReference,
      status: input.request.status,
      version: input.request.version,
      urgency: input.request.urgency,
      currencyCode: input.request.company.currencyCode,
      requiredDate: iso(input.request.requiredDate),
      justification: input.request.justification,
      createdAt: iso(input.request.createdAt),
      updatedAt: iso(input.request.updatedAt),
      scope: requestScope,
      requester: input.request.requester,
      evidence,
      comments: [...input.request.comments]
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((comment) => ({
          id: comment.id,
          authorUserId: comment.authorUserId,
          authorName: comment.author.displayName,
          body: comment.body,
          createdAt: iso(comment.createdAt),
        })),
      lines,
    },
  };
  const currencyCode = input.request.company.currencyCode;
  return {
    family: "PurchaseRequest",
    sourceRevision: `version:${input.request.version}`,
    reviewDigest: procurementReviewDigest(canonicalSnapshot as unknown as CanonicalJson),
    sourceHref: `/purchase-requests/${input.request.id}`,
    sourceAccess: "AUTHORIZED",
    canonicalSnapshot,
    presentation: {
      heading: `Purchase Request ${input.request.publicReference}`,
      publicReference: input.request.publicReference,
      status: input.request.status,
      scope: requestScope,
      owner: {
        userId: input.request.requester.id,
        displayName: input.request.requester.displayName,
        roleLabel: "Requester",
      },
      dates: [
        { label: "Required date", value: iso(input.request.requiredDate) },
        { label: "Submitted source updated", value: iso(input.request.updatedAt) },
      ],
      approval: {
        stepOrder: input.eligible.stepOrder,
        activatedAt: iso(input.eligible.activatedAt),
        dueAt: input.eligible.dueAt ? iso(input.eligible.dueAt) : null,
      },
      amounts: [
        {
          label: "Estimated total",
          raw: lines
            .reduce(
              (sum, line) => sum.plus(line.estimatedLineTotal),
              new Prisma.Decimal(0),
            )
            .toString(),
          currencyCode,
        },
      ],
      rationale: [
        { label: "Urgency", value: input.request.urgency },
        { label: "Justification", value: input.request.justification },
        ...canonicalSnapshot.source.comments.map((comment) => ({
          label: `Comment by ${comment.authorName}`,
          value: comment.body,
        })),
      ],
      riskFlags: riskFlagsForEvidence(evidence),
      evidence,
      lines: lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: line.description,
        quantity: { raw: line.requestedQty, uomCode: line.uomCode },
        unitAmount: { raw: line.estimatedUnitCost, currencyCode },
        lineAmount: { raw: line.estimatedLineTotal, currencyCode },
        purpose: line.purpose,
        availabilityStatus: null,
        leadTimeDays: null,
        notes: line.notes,
      })),
      quoteComparisons: [],
    },
  };
}

type QuotationRecommendationBuilderInput = {
  eligible: EligibleApprovalStep;
  recommendation: {
    id: string;
    status: string;
    version: number;
    updatedAt: Date;
    submittedAt: Date | null;
    quotationRequestId: string;
    selectedSupplierQuotationId: string;
    currencyCode: string;
    selectedEvaluatedTotal: { toString(): string };
    lowestEvaluatedTotal: { toString(): string };
    quoteCount: number;
    isLowestEvaluatedCost: boolean;
    selectionReason: string;
    nonLowestJustification: string | null;
    singleSourceJustification: string | null;
    evaluationSnapshot: Prisma.JsonValue;
    preparedBy: { id: string; displayName: string };
    company: { id: string; code: string; legalName: string; tradingName: string | null };
    quotationRequest: {
      publicReference: string;
      purchaseRequest: {
        id: string;
        publicReference: string;
        status: string;
        version: number;
        requesterUserId: string;
        requiredDate: Date;
        brand: { id: string; code: string; name: string } | null;
        requestLocation: { id: string; code: string; name: string };
        department: { id: string; code: string; name: string } | null;
        costCenter: { id: string; code: string; name: string } | null;
      };
      supplierQuotes: Array<{
        id: string;
        quoteReference: string;
        quoteDate: Date;
        validityDate: Date | null;
        currencyCode: string;
        subtotalAmount: { toString(): string };
        taxAmount: { toString(): string };
        discountAmount: { toString(): string };
        freightAmount: { toString(): string };
        otherChargesAmount: { toString(): string };
        totalAmount: { toString(): string };
        terms: string | null;
        supplierAccreditationSnapshot: string | null;
        status: string;
        supplier: {
          id: string;
          supplierCode: string;
          legalName: string;
          tradingName: string | null;
          accreditationStatus: string;
        };
        lines: Array<{
          id: string;
          sourcePrLineId: string | null;
          itemId: string | null;
          quantity: { toString(): string };
          uomId: string;
          unitPrice: { toString(): string };
          lineTotal: { toString(): string };
          availabilityStatus: string;
          leadTimeDays: number | null;
          notes: string | null;
          item: { itemCode: string; itemName: string } | null;
          uom: { uomCode: string };
          sourcePrLine: { lineNumber: number; description: string } | null;
        }>;
      }>;
    };
  };
  evidence: EvidenceRow[];
};

export function buildQuotationRecommendationProcurementReview(
  input: QuotationRecommendationBuilderInput,
): Extract<BoundedApprovalProcurementReview, { family: "QuotationRecommendation" }> {
  if (
    input.eligible.documentType !== "QuotationRecommendation" ||
    input.eligible.documentId !== input.recommendation.id ||
    input.recommendation.status !== "PENDING_APPROVAL"
  ) {
    return unavailable();
  }
  const purchaseRequest = input.recommendation.quotationRequest.purchaseRequest;
  const recommendationScope = scope({
    company: input.recommendation.company,
    brand: purchaseRequest.brand,
    location: purchaseRequest.requestLocation,
    department: purchaseRequest.department,
    costCenter: purchaseRequest.costCenter,
  });
  const allEvidence = evidenceRows(input.evidence);
  const quotes = [...input.recommendation.quotationRequest.supplierQuotes]
    .sort((left, right) =>
      left.quoteDate.getTime() - right.quoteDate.getTime() || left.id.localeCompare(right.id),
    )
    .map((quote) => ({
      id: quote.id,
      supplier: {
        id: quote.supplier.id,
        supplierCode: quote.supplier.supplierCode,
        name: quote.supplier.tradingName ?? quote.supplier.legalName,
        accreditationStatus: quote.supplier.accreditationStatus,
      },
      quoteReference: quote.quoteReference,
      quoteDate: iso(quote.quoteDate),
      validityDate: quote.validityDate ? iso(quote.validityDate) : null,
      currencyCode: quote.currencyCode,
      subtotalAmount: decimalRaw(quote.subtotalAmount),
      taxAmount: decimalRaw(quote.taxAmount),
      discountAmount: decimalRaw(quote.discountAmount),
      freightAmount: decimalRaw(quote.freightAmount),
      otherChargesAmount: decimalRaw(quote.otherChargesAmount),
      totalAmount: decimalRaw(quote.totalAmount),
      terms: quote.terms,
      supplierAccreditationSnapshot: quote.supplierAccreditationSnapshot,
      status: quote.status,
      evidence: allEvidence.filter((item) => item.sourceRecordId === quote.id),
      lines: [...quote.lines]
        .sort(
          (left, right) =>
            (left.sourcePrLine?.lineNumber ?? Number.MAX_SAFE_INTEGER) -
              (right.sourcePrLine?.lineNumber ?? Number.MAX_SAFE_INTEGER) ||
            left.id.localeCompare(right.id),
        )
        .map((line) => ({
          id: line.id,
          sourcePrLineId: line.sourcePrLineId,
          sourcePrLineNumber: line.sourcePrLine?.lineNumber ?? null,
          sourcePrDescription: line.sourcePrLine?.description ?? null,
          itemId: line.itemId,
          itemCode: line.item?.itemCode ?? null,
          itemName: line.item?.itemName ?? null,
          quantity: decimalRaw(line.quantity),
          uomId: line.uomId,
          uomCode: line.uom.uomCode,
          unitPrice: decimalRaw(line.unitPrice),
          lineTotal: decimalRaw(line.lineTotal),
          availabilityStatus: line.availabilityStatus,
          leadTimeDays: line.leadTimeDays,
          notes: line.notes,
        })),
    }));
  if (
    quotes.length === 0 ||
    quotes.length !== input.recommendation.quoteCount ||
    quotes.some((quote) => quote.lines.length === 0) ||
    !quotes.some((quote) => quote.id === input.recommendation.selectedSupplierQuotationId)
  ) {
    return unavailable();
  }
  const canonicalSnapshot: QuotationRecommendationCanonicalReviewSnapshot = {
    schemaVersion: 1,
    family: "QuotationRecommendation",
    approval: approvalContext(input.eligible),
    source: {
      id: input.recommendation.id,
      status: input.recommendation.status,
      version: input.recommendation.version,
      updatedAt: iso(input.recommendation.updatedAt),
      submittedAt: input.recommendation.submittedAt
        ? iso(input.recommendation.submittedAt)
        : null,
      quotationRequestId: input.recommendation.quotationRequestId,
      quotationRequestReference: input.recommendation.quotationRequest.publicReference,
      selectedSupplierQuotationId: input.recommendation.selectedSupplierQuotationId,
      currencyCode: input.recommendation.currencyCode,
      selectedEvaluatedTotal: decimalRaw(input.recommendation.selectedEvaluatedTotal),
      lowestEvaluatedTotal: decimalRaw(input.recommendation.lowestEvaluatedTotal),
      quoteCount: input.recommendation.quoteCount,
      isLowestEvaluatedCost: input.recommendation.isLowestEvaluatedCost,
      selectionReason: input.recommendation.selectionReason,
      nonLowestJustification: input.recommendation.nonLowestJustification,
      singleSourceJustification: input.recommendation.singleSourceJustification,
      evaluationSnapshot: canonicalizeUnknown(input.recommendation.evaluationSnapshot),
      scope: recommendationScope,
      preparedBy: input.recommendation.preparedBy,
      purchaseRequest: {
        id: purchaseRequest.id,
        publicReference: purchaseRequest.publicReference,
        status: purchaseRequest.status,
        version: purchaseRequest.version,
        requesterUserId: purchaseRequest.requesterUserId,
        requiredDate: iso(purchaseRequest.requiredDate),
      },
      quotes,
    },
  };
  const selectedQuote = quotes.find(
    (quote) => quote.id === input.recommendation.selectedSupplierQuotationId,
  );
  if (!selectedQuote) return unavailable();
  const riskFlags = [
    ...(input.recommendation.isLowestEvaluatedCost ? [] : ["NON_LOWEST_QUOTE_SELECTED"]),
    ...(input.recommendation.quoteCount === 1 ? ["SINGLE_SOURCE"] : []),
    ...riskFlagsForEvidence(selectedQuote.evidence),
  ];
  return {
    family: "QuotationRecommendation",
    sourceRevision: `version:${input.recommendation.version};updatedAt:${iso(input.recommendation.updatedAt)}`,
    reviewDigest: procurementReviewDigest(canonicalSnapshot as unknown as CanonicalJson),
    sourceHref: `/quotes?requestId=${encodeURIComponent(purchaseRequest.id)}`,
    sourceAccess: "AUTHORIZED",
    canonicalSnapshot,
    presentation: {
      heading: `Quotation Recommendation for ${purchaseRequest.publicReference}`,
      publicReference: purchaseRequest.publicReference,
      status: input.recommendation.status,
      scope: recommendationScope,
      owner: {
        userId: input.recommendation.preparedBy.id,
        displayName: input.recommendation.preparedBy.displayName,
        roleLabel: "Prepared by",
      },
      dates: [
        { label: "Required date", value: iso(purchaseRequest.requiredDate) },
        { label: "Recommendation updated", value: iso(input.recommendation.updatedAt) },
      ],
      approval: {
        stepOrder: input.eligible.stepOrder,
        activatedAt: iso(input.eligible.activatedAt),
        dueAt: input.eligible.dueAt ? iso(input.eligible.dueAt) : null,
      },
      amounts: [
        {
          label: "Selected evaluated total",
          raw: decimalRaw(input.recommendation.selectedEvaluatedTotal),
          currencyCode: input.recommendation.currencyCode,
        },
        {
          label: "Lowest evaluated total",
          raw: decimalRaw(input.recommendation.lowestEvaluatedTotal),
          currencyCode: input.recommendation.currencyCode,
        },
      ],
      rationale: [
        { label: "Selection reason", value: input.recommendation.selectionReason },
        ...(input.recommendation.nonLowestJustification
          ? [{ label: "Non-lowest justification", value: input.recommendation.nonLowestJustification }]
          : []),
        ...(input.recommendation.singleSourceJustification
          ? [{ label: "Single-source justification", value: input.recommendation.singleSourceJustification }]
          : []),
      ],
      riskFlags,
      evidence: selectedQuote.evidence,
      lines: selectedQuote.lines.map((line) => ({
        id: line.id,
        lineNumber: line.sourcePrLineNumber,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: line.itemName ?? line.sourcePrDescription ?? "Quoted line",
        quantity: { raw: line.quantity, uomCode: line.uomCode },
        unitAmount: { raw: line.unitPrice, currencyCode: selectedQuote.currencyCode },
        lineAmount: { raw: line.lineTotal, currencyCode: selectedQuote.currencyCode },
        purpose: null,
        availabilityStatus: line.availabilityStatus,
        leadTimeDays: line.leadTimeDays,
        notes: line.notes,
      })),
      quoteComparisons: quotes.map((quote) => ({
        quoteId: quote.id,
        quoteReference: quote.quoteReference,
        supplierName: quote.supplier.name,
        supplierAccreditationStatus:
          quote.supplierAccreditationSnapshot ?? quote.supplier.accreditationStatus,
        status: quote.status,
        selected: quote.id === input.recommendation.selectedSupplierQuotationId,
        quoteDate: quote.quoteDate,
        validityDate: quote.validityDate,
        currencyCode: quote.currencyCode,
        subtotalAmount: quote.subtotalAmount,
        taxAmount: quote.taxAmount,
        discountAmount: quote.discountAmount,
        freightAmount: quote.freightAmount,
        otherChargesAmount: quote.otherChargesAmount,
        totalAmount: quote.totalAmount,
        terms: quote.terms,
        evidenceAccess: "AUTHORIZED",
        evidence: quote.evidence,
        lines: quote.lines.map((line) => ({
          id: line.id,
          lineNumber: line.sourcePrLineNumber,
          itemCode: line.itemCode,
          itemName: line.itemName,
          description: line.itemName ?? line.sourcePrDescription ?? "Quoted line",
          quantity: { raw: line.quantity, uomCode: line.uomCode },
          unitAmount: { raw: line.unitPrice, currencyCode: quote.currencyCode },
          lineAmount: { raw: line.lineTotal, currencyCode: quote.currencyCode },
          purpose: null,
          availabilityStatus: line.availabilityStatus,
          leadTimeDays: line.leadTimeDays,
          notes: line.notes,
        })),
      })),
    },
  };
}

type PurchaseOrderBuilderInput = {
  eligible: EligibleApprovalStep;
  order: {
    id: string;
    publicReference: string;
    status: string;
    updatedAt: Date;
    createdAt: Date;
    expectedDeliveryDate: Date;
    currencyCode: string;
    subtotalAmount: { toString(): string };
    taxAmount: { toString(): string };
    discountAmount: { toString(): string };
    totalAmount: { toString(): string };
    sourceSnapshot: Prisma.JsonValue;
    company: { id: string; code: string; legalName: string; tradingName: string | null };
    brand: { id: string; code: string; name: string } | null;
    deliveryLocation: { id: string; code: string; name: string };
    department: { id: string; code: string; name: string } | null;
    costCenter: { id: string; code: string; name: string } | null;
    createdBy: { id: string; displayName: string };
    supplier: {
      id: string;
      supplierCode: string;
      legalName: string;
      tradingName: string | null;
      accreditationStatus: string;
    };
    purchaseRequest: {
      id: string;
      publicReference: string;
      version: number;
      requesterUserId: string;
    };
    quotationRecommendation: {
      id: string;
      version: number;
      updatedAt: Date;
      preparedByUserId: string;
      selectedSupplierQuotationId: string;
    };
    selectedSupplierQuotation: {
      id: string;
      quoteReference: string;
      quoteDate: Date;
      validityDate: Date | null;
      currencyCode: string;
      totalAmount: { toString(): string };
      supplierAccreditationSnapshot: string | null;
    };
    lines: Array<{
      id: string;
      lineNumber: number;
      sourcePrLineId: string | null;
      sourceSupplierQuoteLineId: string | null;
      itemId: string | null;
      uomId: string;
      description: string;
      orderedQty: { toString(): string };
      receivedQty: { toString(): string };
      cancelledQty: { toString(): string };
      unitPrice: { toString(): string };
      taxAmount: { toString(): string };
      discountAmount: { toString(): string };
      lineTotal: { toString(): string };
      budgetLineId: string | null;
      availabilityStatus: string | null;
      leadTimeDays: number | null;
      notes: string | null;
      item: { itemCode: string; itemName: string } | null;
      uom: { uomCode: string };
    }>;
  };
  evidence: EvidenceRow[];
};

export function buildPurchaseOrderProcurementReview(
  input: PurchaseOrderBuilderInput,
): Extract<BoundedApprovalProcurementReview, { family: "PurchaseOrder" }> {
  if (
    input.eligible.documentType !== "PurchaseOrder" ||
    input.eligible.documentId !== input.order.id ||
    input.order.status !== "PENDING_APPROVAL" ||
    input.order.lines.length === 0
  ) {
    return unavailable();
  }
  const orderScope = scope({
    company: input.order.company,
    brand: input.order.brand,
    location: input.order.deliveryLocation,
    department: input.order.department,
    costCenter: input.order.costCenter,
  });
  const evidence = evidenceRows(input.evidence);
  const lines = [...input.order.lines]
    .sort((left, right) => left.lineNumber - right.lineNumber || left.id.localeCompare(right.id))
    .map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      sourcePrLineId: line.sourcePrLineId,
      sourceSupplierQuoteLineId: line.sourceSupplierQuoteLineId,
      itemId: line.itemId,
      itemCode: line.item?.itemCode ?? null,
      itemName: line.item?.itemName ?? null,
      uomId: line.uomId,
      uomCode: line.uom.uomCode,
      description: line.description,
      orderedQty: decimalRaw(line.orderedQty),
      receivedQty: decimalRaw(line.receivedQty),
      cancelledQty: decimalRaw(line.cancelledQty),
      unitPrice: decimalRaw(line.unitPrice),
      taxAmount: decimalRaw(line.taxAmount),
      discountAmount: decimalRaw(line.discountAmount),
      lineTotal: decimalRaw(line.lineTotal),
      budgetLineId: line.budgetLineId,
      availabilityStatus: line.availabilityStatus,
      leadTimeDays: line.leadTimeDays,
      notes: line.notes,
    }));
  const canonicalSnapshot: PurchaseOrderCanonicalReviewSnapshot = {
    schemaVersion: 1,
    family: "PurchaseOrder",
    approval: approvalContext(input.eligible),
    source: {
      id: input.order.id,
      publicReference: input.order.publicReference,
      status: input.order.status,
      updatedAt: iso(input.order.updatedAt),
      createdAt: iso(input.order.createdAt),
      expectedDeliveryDate: iso(input.order.expectedDeliveryDate),
      currencyCode: input.order.currencyCode,
      subtotalAmount: decimalRaw(input.order.subtotalAmount),
      taxAmount: decimalRaw(input.order.taxAmount),
      discountAmount: decimalRaw(input.order.discountAmount),
      totalAmount: decimalRaw(input.order.totalAmount),
      sourceSnapshot: canonicalizeUnknown(input.order.sourceSnapshot),
      scope: orderScope,
      createdBy: input.order.createdBy,
      supplier: {
        id: input.order.supplier.id,
        supplierCode: input.order.supplier.supplierCode,
        name: input.order.supplier.tradingName ?? input.order.supplier.legalName,
        accreditationStatus: input.order.supplier.accreditationStatus,
      },
      purchaseRequest: {
        id: input.order.purchaseRequest.id,
        publicReference: input.order.purchaseRequest.publicReference,
        version: input.order.purchaseRequest.version,
        requesterUserId: input.order.purchaseRequest.requesterUserId,
      },
      quotationRecommendation: {
        id: input.order.quotationRecommendation.id,
        version: input.order.quotationRecommendation.version,
        updatedAt: iso(input.order.quotationRecommendation.updatedAt),
        preparedByUserId: input.order.quotationRecommendation.preparedByUserId,
        selectedSupplierQuotationId:
          input.order.quotationRecommendation.selectedSupplierQuotationId,
      },
      selectedSupplierQuotation: {
        id: input.order.selectedSupplierQuotation.id,
        quoteReference: input.order.selectedSupplierQuotation.quoteReference,
        quoteDate: iso(input.order.selectedSupplierQuotation.quoteDate),
        validityDate: input.order.selectedSupplierQuotation.validityDate
          ? iso(input.order.selectedSupplierQuotation.validityDate)
          : null,
        currencyCode: input.order.selectedSupplierQuotation.currencyCode,
        totalAmount: decimalRaw(input.order.selectedSupplierQuotation.totalAmount),
        supplierAccreditationSnapshot:
          input.order.selectedSupplierQuotation.supplierAccreditationSnapshot,
      },
      evidence,
      lines,
    },
  };
  return {
    family: "PurchaseOrder",
    sourceRevision: `updatedAt:${iso(input.order.updatedAt)}`,
    reviewDigest: procurementReviewDigest(canonicalSnapshot as unknown as CanonicalJson),
    sourceHref: `/purchase-orders/${input.order.id}`,
    sourceAccess: "AUTHORIZED",
    canonicalSnapshot,
    presentation: {
      heading: `Purchase Order ${input.order.publicReference}`,
      publicReference: input.order.publicReference,
      status: input.order.status,
      scope: orderScope,
      owner: {
        userId: input.order.createdBy.id,
        displayName: input.order.createdBy.displayName,
        roleLabel: "Created by",
      },
      dates: [
        { label: "Expected delivery", value: iso(input.order.expectedDeliveryDate) },
        { label: "Purchase Order updated", value: iso(input.order.updatedAt) },
      ],
      approval: {
        stepOrder: input.eligible.stepOrder,
        activatedAt: iso(input.eligible.activatedAt),
        dueAt: input.eligible.dueAt ? iso(input.eligible.dueAt) : null,
      },
      amounts: [
        {
          label: "Purchase Order total",
          raw: decimalRaw(input.order.totalAmount),
          currencyCode: input.order.currencyCode,
        },
      ],
      rationale: [
        {
          label: "Selected supplier",
          value: input.order.supplier.tradingName ?? input.order.supplier.legalName,
        },
        {
          label: "Source quote",
          value: input.order.selectedSupplierQuotation.quoteReference,
        },
      ],
      riskFlags: [
        ...(input.order.supplier.accreditationStatus === "APPROVED"
          ? []
          : ["SUPPLIER_NOT_APPROVED"]),
        ...riskFlagsForEvidence(evidence),
      ],
      evidence,
      lines: lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: line.description,
        quantity: { raw: line.orderedQty, uomCode: line.uomCode },
        unitAmount: { raw: line.unitPrice, currencyCode: input.order.currencyCode },
        lineAmount: { raw: line.lineTotal, currencyCode: input.order.currencyCode },
        purpose: null,
        availabilityStatus: line.availabilityStatus,
        leadTimeDays: line.leadTimeDays,
        notes: line.notes,
      })),
      quoteComparisons: [],
    },
  };
}

function assertProcurementEligibility(
  session: SessionContext,
  eligible: EligibleApprovalStep,
  family: BoundedApprovalProcurementFamily,
) {
  if (
    eligible.documentType !== family ||
    !boundedApprovalProcurementFamilies.includes(
      eligible.documentType as BoundedApprovalProcurementFamily,
    ) ||
    !session.permissionCodes.includes(eligible.requiredPermissionCode)
  ) {
    return unavailable();
  }
}

async function assertLiveApprovalScope(
  session: SessionContext,
  location: { id: string; companyId: string; brandId: string | null },
  client: BoundedApprovalProcurementReviewClient,
) {
  const now = new Date();
  const assignment = await client.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        {
          OR: [
            { scopeType: "LOCATION", scopeId: location.id },
            { scopeType: "COMPANY", scopeId: location.companyId },
            ...(location.brandId
              ? [{ scopeType: "BRAND" as const, scopeId: location.brandId }]
              : []),
          ],
        },
      ],
      accessLevel: { in: ["APPROVE", "MANAGE"] },
    },
    select: { id: true },
  });
  if (!assignment) return unavailable();
}

async function loadEvidence(
  session: SessionContext,
  sourceType: "PURCHASE_REQUEST" | "SUPPLIER_QUOTATION" | "PURCHASE_ORDER",
  sourceRecordIds: string[],
  client: BoundedApprovalProcurementReviewClient,
) {
  if (sourceRecordIds.length === 0) return [];
  return client.controlledEvidenceAttachment.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceType,
      sourceRecordId: { in: sourceRecordIds },
      status: "ACTIVE",
      archivedAt: null,
    },
    select: {
      id: true,
      sourceRecordId: true,
      sourceLineId: true,
      purpose: true,
      caption: true,
      requiredForAction: true,
      createdAt: true,
      updatedAt: true,
      attachment: {
        select: {
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          uploadState: true,
          scanState: true,
          availabilityState: true,
        },
      },
    },
    orderBy: [{ sourceRecordId: "asc" }, { sourceLineId: "asc" }, { id: "asc" }],
  });
}

export async function getBoundedApprovalProcurementReview(
  session: SessionContext,
  eligible: EligibleApprovalStep,
  client: BoundedApprovalProcurementReviewClient = prisma,
): Promise<BoundedApprovalProcurementReview> {
  if (eligible.documentType === "PurchaseRequest") {
    assertProcurementEligibility(session, eligible, "PurchaseRequest");
    const request = await client.purchaseRequest.findFirst({
      where: {
        id: eligible.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL",
        company: { status: "ACTIVE" },
        requestLocation: { status: "ACTIVE" },
        OR: [{ brandId: null }, { brand: { status: "ACTIVE" } }],
      },
      include: {
        company: true,
        brand: true,
        requestLocation: true,
        department: true,
        costCenter: true,
        requester: { select: { id: true, displayName: true } },
        comments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: { author: { select: { displayName: true } } },
        },
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
          include: { item: true, uom: true },
        },
      },
    });
    if (!request || request.requesterUserId === session.user.id) return unavailable();
    await assertLiveApprovalScope(session, request.requestLocation, client);
    return buildPurchaseRequestProcurementReview({
      eligible,
      request,
      evidence: await loadEvidence(session, "PURCHASE_REQUEST", [request.id], client),
    });
  }

  if (eligible.documentType === "QuotationRecommendation") {
    assertProcurementEligibility(session, eligible, "QuotationRecommendation");
    const recommendation = await client.quotationRecommendation.findFirst({
      where: {
        id: eligible.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL",
        company: { status: "ACTIVE" },
        quotationRequest: {
          purchaseRequest: {
            requestLocation: { status: "ACTIVE" },
            OR: [{ brandId: null }, { brand: { status: "ACTIVE" } }],
          },
        },
      },
      include: {
        company: true,
        preparedBy: { select: { id: true, displayName: true } },
        quotationRequest: {
          include: {
            purchaseRequest: {
              include: {
                brand: true,
                requestLocation: true,
                department: true,
                costCenter: true,
              },
            },
            supplierQuotes: {
              include: {
                supplier: true,
                lines: {
                  include: { item: true, uom: true, sourcePrLine: true },
                },
              },
            },
          },
        },
      },
    });
    if (!recommendation) return unavailable();
    const purchaseRequest = recommendation.quotationRequest.purchaseRequest;
    if (
      recommendation.preparedByUserId === session.user.id ||
      purchaseRequest.requesterUserId === session.user.id
    ) {
      return unavailable();
    }
    await assertLiveApprovalScope(session, purchaseRequest.requestLocation, client);
    const quoteIds = recommendation.quotationRequest.supplierQuotes.map(
      (quote) => quote.id,
    );
    return buildQuotationRecommendationProcurementReview({
      eligible,
      recommendation,
      evidence: await loadEvidence(session, "SUPPLIER_QUOTATION", quoteIds, client),
    });
  }

  if (eligible.documentType === "PurchaseOrder") {
    assertProcurementEligibility(session, eligible, "PurchaseOrder");
    const order = await client.purchaseOrder.findFirst({
      where: {
        id: eligible.documentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PENDING_APPROVAL",
        company: { status: "ACTIVE" },
        deliveryLocation: { status: "ACTIVE" },
        OR: [{ brandId: null }, { brand: { status: "ACTIVE" } }],
      },
      select: {
        id: true,
        publicReference: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        expectedDeliveryDate: true,
        currencyCode: true,
        subtotalAmount: true,
        taxAmount: true,
        discountAmount: true,
        totalAmount: true,
        sourceSnapshot: true,
        createdByUserId: true,
        company: {
          select: { id: true, code: true, legalName: true, tradingName: true },
        },
        brand: { select: { id: true, code: true, name: true } },
        deliveryLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            companyId: true,
            brandId: true,
          },
        },
        department: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            legalName: true,
            tradingName: true,
            accreditationStatus: true,
          },
        },
        purchaseRequest: {
          select: {
            id: true,
            publicReference: true,
            version: true,
            requesterUserId: true,
          },
        },
        quotationRecommendation: {
          select: {
            id: true,
            version: true,
            updatedAt: true,
            preparedByUserId: true,
            selectedSupplierQuotationId: true,
          },
        },
        selectedSupplierQuotation: {
          select: {
            id: true,
            quoteReference: true,
            quoteDate: true,
            validityDate: true,
            currencyCode: true,
            totalAmount: true,
            supplierAccreditationSnapshot: true,
          },
        },
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
          select: {
            id: true,
            lineNumber: true,
            sourcePrLineId: true,
            sourceSupplierQuoteLineId: true,
            itemId: true,
            uomId: true,
            description: true,
            orderedQty: true,
            receivedQty: true,
            cancelledQty: true,
            unitPrice: true,
            taxAmount: true,
            discountAmount: true,
            lineTotal: true,
            budgetLineId: true,
            availabilityStatus: true,
            leadTimeDays: true,
            notes: true,
            item: { select: { itemCode: true, itemName: true } },
            uom: { select: { uomCode: true } },
          },
        },
      },
    });
    if (
      !order ||
      order.createdByUserId === session.user.id ||
      order.purchaseRequest.requesterUserId === session.user.id ||
      order.quotationRecommendation.preparedByUserId === session.user.id
    ) {
      return unavailable();
    }
    await assertLiveApprovalScope(session, order.deliveryLocation, client);
    return buildPurchaseOrderProcurementReview({
      eligible,
      order,
      evidence: await loadEvidence(session, "PURCHASE_ORDER", [order.id], client),
    });
  }

  return unavailable();
}
