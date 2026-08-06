import { createHash } from "node:crypto";
import { prisma, type TransactionClient } from "@ogfi/database";
import type { EligibleApprovalStep } from "./approvalRouting";
import type { SessionContext } from "./context";

export const BOUNDED_INVENTORY_REVIEW_FAMILIES = [
  "InventoryTransfer",
  "StockCountAttemptReview",
  "WastageReport",
  "StockAdjustment",
] as const;

type BoundedApprovalInventoryReviewClient = Pick<
  TransactionClient,
  "inventoryTransfer" | "stockAdjustment" | "stockCountAttempt" | "wastageReport"
>;

export type BoundedInventoryReviewFamily =
  (typeof BOUNDED_INVENTORY_REVIEW_FAMILIES)[number];

type CanonicalPrimitive = string | number | boolean | null;
export type CanonicalReviewValue =
  | CanonicalPrimitive
  | CanonicalReviewValue[]
  | { [key: string]: CanonicalReviewValue };

type ApprovalReviewStepSnapshot = {
  approvalInstanceId: string;
  approvalInstanceStepId: string;
  stepOrder: number;
  activatedAt: string;
  dueAt: string | null;
};

type ReviewScope = {
  companyId: string;
  companyCode: string;
  companyName: string;
  brandId: string | null;
  brandName: string | null;
  locationId: string | null;
  locationName: string | null;
  sourceEndpoint: {
    locationId: string;
    code: string;
    name: string;
    brandId: string | null;
    brandName: string | null;
  } | null;
  destinationEndpoint: {
    locationId: string;
    code: string;
    name: string;
    brandId: string | null;
    brandName: string | null;
  } | null;
};

export type BoundedInventoryReviewMaterialLine = {
  lineNumber: number;
  itemCode: string;
  itemName: string;
  description: string;
  uomCode: string;
  quantities: Array<{ label: string; value: string; uomCode: string }>;
  unitCost: string | null;
  totalCost: string | null;
  reasonCode: string | null;
  evidenceReference: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  notes: string | null;
};

export type BoundedInventoryReviewPresentation = {
  title: string;
  publicReference: string;
  status: string;
  scope: ReviewScope;
  ownerName: string;
  createdAt: string;
  submittedAt: string | null;
  requiredAt: string | null;
  dueAt: string | null;
  currentStepOrder: number;
  rationale: string[];
  risks: string[];
  evidence: string[];
  materialLines: BoundedInventoryReviewMaterialLine[];
};

type TransferApprovalIntentSnapshot = {
  id: string;
  sourceVersionBefore: number;
  sourceVersionAfter: number;
  sourceCanonicalHash: string;
  configurationRevisionId: string;
  configurationRevisionNumber: number;
  configurationDigest: string;
  activationEventId: string;
  activationFamily: string;
  activationStatus: string;
  activationGeneration: number;
  requestHash: string;
};

type CountReviewIntentSnapshot = {
  id: string;
  attemptVersionBefore: number;
  attemptVersionAfter: number;
  sessionVersionBefore: number;
  sessionVersionAfter: number;
  evidenceCanonicalHash: string;
  configurationRevisionId: string;
  configurationRevisionNumber: number;
  configurationDigest: string;
  activationEventId: string;
  activationFamily: string;
  activationStatus: string;
  activationGeneration: number;
  requestHash: string;
};

export type InventoryTransferReviewSnapshot = {
  schemaVersion: 1;
  family: "InventoryTransfer";
  tenantId: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  documentId: string;
  publicReference: string;
  status: string;
  version: number;
  transferType: string;
  purpose: string;
  sourceLocation: { id: string; code: string; name: string; brandId: string | null; brandName: string | null };
  destinationLocation: { id: string; code: string; name: string; brandId: string | null; brandName: string | null };
  requestedByUserId: string;
  requestedByName: string;
  requiredByDate: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemCode: string;
    itemName: string;
    description: string;
    uomId: string;
    uomCode: string;
    requestedQty: string;
    approvedQty: string;
    preparedQty: string;
    dispatchedQty: string;
    receivedQty: string;
    rejectedQty: string;
    damagedQty: string;
    discrepancyQty: string;
    sourceInventoryLocationId: string;
    sourceInventoryLocationName: string;
    destinationInventoryLocationId: string;
    destinationInventoryLocationName: string;
    lotNumber: string | null;
    expiryDate: string | null;
    notes: string | null;
  }>;
  approvalIntent: TransferApprovalIntentSnapshot;
  approvalStep: ApprovalReviewStepSnapshot;
};

export type StockCountAttemptReviewSnapshot = {
  schemaVersion: 1;
  family: "StockCountAttemptReview";
  tenantId: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  documentId: string;
  stockCountSessionId: string;
  publicReference: string;
  status: string;
  attemptVersion: number;
  sessionVersion: number;
  attemptNumber: number;
  countType: string;
  scopeType: string;
  blindCount: boolean;
  freezeMovements: boolean;
  location: { id: string; code: string; name: string; brandId: string | null; brandName: string | null };
  createdByUserId: string;
  createdByName: string;
  assignedToUserId: string | null;
  assignedToName: string | null;
  reason: string | null;
  reviewNotes: string | null;
  evidenceReference: string | null;
  cutoffAt: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemCode: string;
    itemName: string;
    uomId: string;
    uomCode: string;
    lotKey: string;
    lotNumber: string | null;
    expiryDate: string | null;
    systemQuantityBaseUom: string;
    countedQuantityBaseUom: string | null;
    varianceQuantityBaseUom: string | null;
    notes: string | null;
    countedByUserId: string | null;
    countedByName: string | null;
    countedAt: string | null;
  }>;
  recountTransitions: Array<{
    id: string;
    successorAttemptId: string;
    linkedStockAdjustmentId: string | null;
    adjustmentDisposition: string;
    cutoffDisposition: string;
    reason: string;
    evidenceReference: string;
    occurredAt: string;
  }>;
  reviewIntent: CountReviewIntentSnapshot;
  approvalStep: ApprovalReviewStepSnapshot;
};

export type WastageReportReviewSnapshot = {
  schemaVersion: 1;
  family: "WastageReport";
  tenantId: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  documentId: string;
  publicReference: string;
  status: string;
  wastageType: string;
  reasonCode: string;
  evidenceReference: string | null;
  evidenceRequired: boolean;
  evidenceSatisfied: boolean;
  notes: string | null;
  currencyCode: string;
  totalEstimatedCost: string;
  policyFlags: CanonicalReviewValue;
  policySnapshot: CanonicalReviewValue;
  location: { id: string; code: string; name: string; brandId: string | null; brandName: string | null };
  reportedByUserId: string;
  reportedByName: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemCode: string;
    itemName: string;
    description: string;
    uomId: string;
    uomCode: string;
    quantity: string;
    quantityBaseUom: string;
    estimatedUnitCost: string;
    estimatedTotalCost: string;
    reasonCode: string;
    evidenceReference: string | null;
    photoRequired: boolean;
    lotNumber: string | null;
    expiryDate: string | null;
    notes: string | null;
  }>;
  approvalStep: ApprovalReviewStepSnapshot;
};

export type StockAdjustmentReviewSnapshot = {
  schemaVersion: 1;
  family: "StockAdjustment";
  tenantId: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  documentId: string;
  publicReference: string;
  status: string;
  adjustmentType: string;
  reasonCode: string;
  reasonDescription: string;
  evidenceReference: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: string | null;
  sourceStockCountSessionId: string | null;
  sourceStockCountAttemptId: string | null;
  currencyCode: string;
  totalEstimatedValueImpact: string;
  location: { id: string; code: string; name: string; brandId: string | null; brandName: string | null };
  requestedByUserId: string;
  requestedByName: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemId: string;
    itemCode: string;
    itemName: string;
    uomId: string;
    uomCode: string;
    lotKey: string;
    lotNumber: string | null;
    expiryDate: string | null;
    systemQuantityBaseUom: string;
    quantityDeltaBaseUom: string;
    unitCost: string;
    estimatedValueImpact: string;
    reasonCode: string;
    notes: string | null;
    evidenceReference: string | null;
    sourceStockCountLineId: string | null;
    sourceStockCountAttemptLineId: string | null;
  }>;
  approvalStep: ApprovalReviewStepSnapshot;
};

export type BoundedApprovalInventoryCanonicalSnapshot =
  | InventoryTransferReviewSnapshot
  | StockCountAttemptReviewSnapshot
  | WastageReportReviewSnapshot
  | StockAdjustmentReviewSnapshot;

export type BoundedApprovalInventoryReview = {
  [Family in BoundedInventoryReviewFamily]: {
    family: Family;
    sourceRevision: Family extends "InventoryTransfer"
      ? { version: number }
      : Family extends "StockCountAttemptReview"
        ? { attemptVersion: number; sessionVersion: number }
        : { updatedAt: string };
    canonicalSnapshot: Extract<BoundedApprovalInventoryCanonicalSnapshot, { family: Family }>;
    canonicalRawSnapshot: string;
    snapshotDigest: string;
    sourceHref: string;
    presentation: BoundedInventoryReviewPresentation;
  };
}[BoundedInventoryReviewFamily];

function canonicalize(value: unknown): CanonicalReviewValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("APPROVAL_REVIEW_SNAPSHOT_INVALID_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  throw new Error("APPROVAL_REVIEW_SNAPSHOT_VALUE_UNSUPPORTED");
}

export function canonicalApprovalInventoryReviewJson(
  snapshot: BoundedApprovalInventoryCanonicalSnapshot,
) {
  return JSON.stringify(canonicalize(snapshot));
}

export function digestApprovalInventoryReviewSnapshot(
  snapshot: BoundedApprovalInventoryCanonicalSnapshot,
) {
  return createHash("sha256")
    .update(canonicalApprovalInventoryReviewJson(snapshot), "utf8")
    .digest("hex");
}

export function isBoundedInventoryReviewFamily(
  value: string,
): value is BoundedInventoryReviewFamily {
  return BOUNDED_INVENTORY_REVIEW_FAMILIES.some((family) => family === value);
}

export function assertBoundedInventoryReviewSourceGuard(input: {
  expectedFamily: BoundedInventoryReviewFamily;
  eligible: EligibleApprovalStep;
  sessionTenantId: string;
  sessionCompanyId: string;
  sourceTenantId: string;
  sourceCompanyId: string;
  sourceStatus: string;
  expectedStatus: string;
  sourceId: string;
  prohibitedActorIds?: Array<string | null>;
  actorUserId: string;
}) {
  if (
    input.eligible.documentType !== input.expectedFamily ||
    input.eligible.documentId !== input.sourceId ||
    input.sourceTenantId !== input.sessionTenantId ||
    input.sourceCompanyId !== input.sessionCompanyId ||
    input.sourceStatus !== input.expectedStatus ||
    input.prohibitedActorIds?.some((actorId) => actorId === input.actorUserId)
  ) {
    throw new Error("APPROVAL_REVIEW_SOURCE_UNAVAILABLE");
  }
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function stepSnapshot(eligible: EligibleApprovalStep): ApprovalReviewStepSnapshot {
  return {
    approvalInstanceId: eligible.approvalInstanceId,
    approvalInstanceStepId: eligible.approvalInstanceStepId,
    stepOrder: eligible.stepOrder,
    activatedAt: eligible.activatedAt.toISOString(),
    dueAt: iso(eligible.dueAt),
  };
}

function locationSnapshot(location: {
  id: string;
  code: string;
  name: string;
  brandId: string | null;
  brand: { name: string } | null;
}) {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    brandId: location.brandId,
    brandName: location.brand?.name ?? null,
  };
}

function buildResult<Snapshot extends BoundedApprovalInventoryCanonicalSnapshot>(input: {
  snapshot: Snapshot;
  sourceRevision: Extract<BoundedApprovalInventoryReview, { family: Snapshot["family"] }>["sourceRevision"];
  sourceHref: string;
  presentation: BoundedInventoryReviewPresentation;
}): Extract<BoundedApprovalInventoryReview, { family: Snapshot["family"] }> {
  const canonicalRawSnapshot = canonicalApprovalInventoryReviewJson(input.snapshot);
  return {
    family: input.snapshot.family,
    sourceRevision: input.sourceRevision,
    canonicalSnapshot: input.snapshot,
    canonicalRawSnapshot,
    snapshotDigest: createHash("sha256").update(canonicalRawSnapshot, "utf8").digest("hex"),
    sourceHref: input.sourceHref,
    presentation: input.presentation,
  } as Extract<BoundedApprovalInventoryReview, { family: Snapshot["family"] }>;
}

export type InventoryTransferReviewInput = Omit<InventoryTransferReviewSnapshot, "schemaVersion" | "family" | "approvalStep"> & {
  currencyCode: string;
  approvalStep: ApprovalReviewStepSnapshot;
};

export function mapInventoryTransferReview(input: InventoryTransferReviewInput): Extract<BoundedApprovalInventoryReview, { family: "InventoryTransfer" }> {
  const { currencyCode: _currencyCode, ...canonical } = input;
  const snapshot: InventoryTransferReviewSnapshot = { schemaVersion: 1, family: "InventoryTransfer", ...canonical };
  return buildResult({
    snapshot,
    sourceRevision: { version: input.version },
    sourceHref: `/transfers/${input.documentId}`,
    presentation: {
      title: "Inventory Transfer Approval",
      publicReference: input.publicReference,
      status: input.status,
      scope: {
        companyId: input.companyId, companyCode: input.companyCode, companyName: input.companyName,
        brandId: null, brandName: null, locationId: null, locationName: null,
        sourceEndpoint: {
          locationId: input.sourceLocation.id,
          code: input.sourceLocation.code,
          name: input.sourceLocation.name,
          brandId: input.sourceLocation.brandId,
          brandName: input.sourceLocation.brandName,
        },
        destinationEndpoint: {
          locationId: input.destinationLocation.id,
          code: input.destinationLocation.code,
          name: input.destinationLocation.name,
          brandId: input.destinationLocation.brandId,
          brandName: input.destinationLocation.brandName,
        },
      },
      ownerName: input.requestedByName,
      createdAt: input.createdAt,
      submittedAt: input.submittedAt,
      requiredAt: input.requiredByDate,
      dueAt: input.approvalStep.dueAt,
      currentStepOrder: input.approvalStep.stepOrder,
      rationale: [input.purpose, `Transfer type: ${input.transferType}`],
      risks: input.lines.flatMap((line) => [
        ...(line.lotNumber ? [`Line ${line.lineNumber} lot ${line.lotNumber}`] : []),
        ...(line.expiryDate ? [`Line ${line.lineNumber} expires ${line.expiryDate}`] : []),
      ]),
      evidence: [
        `Source snapshot: ${input.approvalIntent.sourceCanonicalHash}`,
        `Pilot configuration v${input.approvalIntent.configurationRevisionNumber}: ${input.approvalIntent.configurationDigest}`,
        `Activation generation ${input.approvalIntent.activationGeneration}`,
      ],
      materialLines: input.lines.map((line) => ({
        lineNumber: line.lineNumber,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: line.description,
        uomCode: line.uomCode,
        quantities: [
          { label: "Requested", value: line.requestedQty, uomCode: line.uomCode },
          { label: "Approved", value: line.approvedQty, uomCode: line.uomCode },
          { label: "Prepared", value: line.preparedQty, uomCode: line.uomCode },
          { label: "Dispatched", value: line.dispatchedQty, uomCode: line.uomCode },
          { label: "Received", value: line.receivedQty, uomCode: line.uomCode },
          { label: "Rejected", value: line.rejectedQty, uomCode: line.uomCode },
          { label: "Damaged", value: line.damagedQty, uomCode: line.uomCode },
          { label: "Discrepancy", value: line.discrepancyQty, uomCode: line.uomCode },
        ],
        unitCost: null, totalCost: null, reasonCode: null, evidenceReference: null,
        lotNumber: line.lotNumber, expiryDate: line.expiryDate, notes: line.notes,
      })),
    },
  });
}

export type StockCountAttemptReviewInput = Omit<StockCountAttemptReviewSnapshot, "schemaVersion" | "family" | "approvalStep"> & {
  approvalStep: ApprovalReviewStepSnapshot;
};

export function mapStockCountAttemptReview(input: StockCountAttemptReviewInput): Extract<BoundedApprovalInventoryReview, { family: "StockCountAttemptReview" }> {
  const snapshot: StockCountAttemptReviewSnapshot = { schemaVersion: 1, family: "StockCountAttemptReview", ...input };
  return buildResult({
    snapshot,
    sourceRevision: { attemptVersion: input.attemptVersion, sessionVersion: input.sessionVersion },
    sourceHref: `/counts/${input.stockCountSessionId}`,
    presentation: {
      title: "Stock Count Review",
      publicReference: input.publicReference,
      status: input.status,
      scope: {
        companyId: input.companyId, companyCode: input.companyCode, companyName: input.companyName,
        brandId: input.location.brandId, brandName: input.location.brandName,
        locationId: input.location.id, locationName: input.location.name,
        sourceEndpoint: null, destinationEndpoint: null,
      },
      ownerName: input.createdByName,
      createdAt: input.createdAt,
      submittedAt: input.submittedAt,
      requiredAt: input.scheduledDate ?? input.cutoffAt,
      dueAt: input.approvalStep.dueAt,
      currentStepOrder: input.approvalStep.stepOrder,
      rationale: [input.reason ?? "Stock count submitted for review", ...(input.reviewNotes ? [input.reviewNotes] : [])],
      risks: [
        ...input.lines.filter((line) => line.varianceQuantityBaseUom !== null && line.varianceQuantityBaseUom !== "0").map((line) => `Line ${line.lineNumber} variance ${line.varianceQuantityBaseUom} ${line.uomCode}`),
        ...input.recountTransitions.map((transition) => `Recount successor ${transition.successorAttemptId}: ${transition.reason}`),
      ],
      evidence: [
        ...(input.evidenceReference ? [input.evidenceReference] : []),
        `Count evidence digest: ${input.reviewIntent.evidenceCanonicalHash}`,
        ...input.recountTransitions.map((transition) => transition.evidenceReference),
      ],
      materialLines: input.lines.map((line) => ({
        lineNumber: line.lineNumber,
        itemCode: line.itemCode,
        itemName: line.itemName,
        description: `${line.itemName}${line.lotNumber ? ` / lot ${line.lotNumber}` : ""}`,
        uomCode: line.uomCode,
        quantities: [
          { label: "System", value: line.systemQuantityBaseUom, uomCode: line.uomCode },
          { label: "Counted", value: line.countedQuantityBaseUom ?? "Not counted", uomCode: line.uomCode },
          { label: "Variance", value: line.varianceQuantityBaseUom ?? "Not calculated", uomCode: line.uomCode },
        ],
        unitCost: null, totalCost: null, reasonCode: null,
        evidenceReference: input.evidenceReference,
        lotNumber: line.lotNumber, expiryDate: line.expiryDate, notes: line.notes,
      })),
    },
  });
}

export type WastageReportReviewInput = Omit<WastageReportReviewSnapshot, "schemaVersion" | "family" | "approvalStep"> & {
  approvalStep: ApprovalReviewStepSnapshot;
};

export function mapWastageReportReview(input: WastageReportReviewInput): Extract<BoundedApprovalInventoryReview, { family: "WastageReport" }> {
  const snapshot: WastageReportReviewSnapshot = { schemaVersion: 1, family: "WastageReport", ...input };
  return buildResult({
    snapshot,
    sourceRevision: { updatedAt: input.updatedAt },
    sourceHref: `/wastage/${input.documentId}`,
    presentation: {
      title: "Wastage Report Approval", publicReference: input.publicReference, status: input.status,
      scope: {
        companyId: input.companyId, companyCode: input.companyCode, companyName: input.companyName,
        brandId: input.location.brandId, brandName: input.location.brandName,
        locationId: input.location.id, locationName: input.location.name,
        sourceEndpoint: null, destinationEndpoint: null,
      },
      ownerName: input.reportedByName, createdAt: input.createdAt, submittedAt: input.submittedAt,
      requiredAt: null, dueAt: input.approvalStep.dueAt, currentStepOrder: input.approvalStep.stepOrder,
      rationale: [`${input.wastageType}: ${input.reasonCode}`, ...(input.notes ? [input.notes] : [])],
      risks: [
        ...(input.evidenceRequired && !input.evidenceSatisfied ? ["Required evidence is not satisfied"] : []),
        `Estimated cost impact: ${input.currencyCode} ${input.totalEstimatedCost}`,
      ],
      evidence: [
        ...(input.evidenceReference ? [input.evidenceReference] : []),
        ...input.lines.flatMap((line) => line.evidenceReference ? [`Line ${line.lineNumber}: ${line.evidenceReference}`] : []),
      ],
      materialLines: input.lines.map((line) => ({
        lineNumber: line.lineNumber, itemCode: line.itemCode, itemName: line.itemName,
        description: line.description, uomCode: line.uomCode,
        quantities: [
          { label: "Entered", value: line.quantity, uomCode: line.uomCode },
          { label: "Base", value: line.quantityBaseUom, uomCode: line.uomCode },
        ],
        unitCost: line.estimatedUnitCost, totalCost: line.estimatedTotalCost,
        reasonCode: line.reasonCode, evidenceReference: line.evidenceReference,
        lotNumber: line.lotNumber, expiryDate: line.expiryDate, notes: line.notes,
      })),
    },
  });
}

export type StockAdjustmentReviewInput = Omit<StockAdjustmentReviewSnapshot, "schemaVersion" | "family" | "approvalStep"> & {
  approvalStep: ApprovalReviewStepSnapshot;
};

export function mapStockAdjustmentReview(input: StockAdjustmentReviewInput): Extract<BoundedApprovalInventoryReview, { family: "StockAdjustment" }> {
  const snapshot: StockAdjustmentReviewSnapshot = { schemaVersion: 1, family: "StockAdjustment", ...input };
  return buildResult({
    snapshot,
    sourceRevision: { updatedAt: input.updatedAt },
    sourceHref: `/adjustments/${input.documentId}`,
    presentation: {
      title: "Stock Adjustment Approval", publicReference: input.publicReference, status: input.status,
      scope: {
        companyId: input.companyId, companyCode: input.companyCode, companyName: input.companyName,
        brandId: input.location.brandId, brandName: input.location.brandName,
        locationId: input.location.id, locationName: input.location.name,
        sourceEndpoint: null, destinationEndpoint: null,
      },
      ownerName: input.requestedByName, createdAt: input.createdAt, submittedAt: input.submittedAt,
      requiredAt: null, dueAt: input.approvalStep.dueAt, currentStepOrder: input.approvalStep.stepOrder,
      rationale: [`${input.adjustmentType}: ${input.reasonCode}`, input.reasonDescription],
      risks: [`Estimated value impact: ${input.currencyCode} ${input.totalEstimatedValueImpact}`],
      evidence: [
        ...(input.evidenceReference ? [input.evidenceReference] : []),
        ...input.lines.flatMap((line) => line.evidenceReference ? [`Line ${line.lineNumber}: ${line.evidenceReference}`] : []),
      ],
      materialLines: input.lines.map((line) => ({
        lineNumber: line.lineNumber, itemCode: line.itemCode, itemName: line.itemName,
        description: line.itemName, uomCode: line.uomCode,
        quantities: [
          { label: "System", value: line.systemQuantityBaseUom, uomCode: line.uomCode },
          { label: "Delta", value: line.quantityDeltaBaseUom, uomCode: line.uomCode },
        ],
        unitCost: line.unitCost, totalCost: line.estimatedValueImpact,
        reasonCode: line.reasonCode, evidenceReference: line.evidenceReference,
        lotNumber: line.lotNumber, expiryDate: line.expiryDate, notes: line.notes,
      })),
    },
  });
}

function assertSingleLineage<T>(rows: T[], unavailableCode: string): T {
  if (rows.length !== 1) throw new Error(unavailableCode);
  return rows[0] as T;
}

export async function loadBoundedApprovalInventoryReview(
  session: SessionContext,
  eligible: EligibleApprovalStep,
  client: BoundedApprovalInventoryReviewClient = prisma,
): Promise<BoundedApprovalInventoryReview | null> {
  if (!isBoundedInventoryReviewFamily(eligible.documentType)) return null;

  const tenantId = session.context.tenantId;
  const companyId = session.context.companyId;
  const approvalStep = stepSnapshot(eligible);

  if (eligible.documentType === "InventoryTransfer") {
    const source = await client.inventoryTransfer.findFirst({
      where: { id: eligible.documentId, tenantId, companyId, status: "PENDING_APPROVAL" },
      include: {
        company: true, requestedBy: true,
        sourceLocation: { include: { brand: true } },
        destinationLocation: { include: { brand: true } },
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { item: true, uom: true, sourceInventoryLocation: true, destinationInventoryLocation: true },
        },
        approvalSubmissionIntents: {
          where: { approvalInstanceId: eligible.approvalInstanceId, approvalDocumentType: "InventoryTransfer" },
          select: {
            id: true, sourceVersionBefore: true, sourceVersionAfter: true, sourceCanonicalHash: true,
            configurationRevisionId: true, configurationRevisionNumber: true, configurationDigest: true,
            activationEventId: true, activationFamily: true, activationStatus: true, activationGeneration: true,
            requestHash: true,
          },
        },
      },
    });
    if (!source) return null;
    if (source.lines.length === 0) throw new Error("APPROVAL_REVIEW_TRANSFER_LINES_UNAVAILABLE");
    const intent = assertSingleLineage(source.approvalSubmissionIntents, "APPROVAL_REVIEW_TRANSFER_LINEAGE_UNAVAILABLE");
    assertBoundedInventoryReviewSourceGuard({
      expectedFamily: "InventoryTransfer", eligible, sessionTenantId: tenantId, sessionCompanyId: companyId,
      sourceTenantId: source.tenantId, sourceCompanyId: source.companyId, sourceStatus: source.status,
      expectedStatus: "PENDING_APPROVAL", sourceId: source.id,
      prohibitedActorIds: [source.requestedByUserId], actorUserId: session.user.id,
    });
    if (
      intent.sourceVersionAfter !== source.version ||
      intent.activationFamily !== "InventoryTransfer" ||
      intent.activationStatus !== "ACTIVE"
    ) throw new Error("APPROVAL_REVIEW_TRANSFER_LINEAGE_STALE");

    return mapInventoryTransferReview({
      tenantId, companyId, companyCode: source.company.code, companyName: source.company.legalName,
      currencyCode: source.company.currencyCode, documentId: source.id, publicReference: source.publicReference,
      status: source.status, version: source.version, transferType: source.transferType, purpose: source.purpose,
      sourceLocation: locationSnapshot(source.sourceLocation),
      destinationLocation: locationSnapshot(source.destinationLocation),
      requestedByUserId: source.requestedByUserId, requestedByName: source.requestedBy.displayName,
      requiredByDate: iso(source.requiredByDate), submittedAt: iso(source.submittedAt),
      createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString(),
      lines: source.lines.map((line) => ({
        id: line.id, lineNumber: line.lineNumber, itemId: line.itemId, itemCode: line.item.itemCode,
        itemName: line.item.itemName, description: line.description, uomId: line.uomId,
        uomCode: line.uom.uomCode, requestedQty: line.requestedQty.toString(),
        approvedQty: line.approvedQty.toString(), sourceInventoryLocationId: line.sourceInventoryLocationId,
        preparedQty: line.preparedQty.toString(), dispatchedQty: line.dispatchedQty.toString(),
        receivedQty: line.receivedQty.toString(), rejectedQty: line.rejectedQty.toString(),
        damagedQty: line.damagedQty.toString(), discrepancyQty: line.discrepancyQty.toString(),
        sourceInventoryLocationName: line.sourceInventoryLocation.name,
        destinationInventoryLocationId: line.destinationInventoryLocationId,
        destinationInventoryLocationName: line.destinationInventoryLocation.name,
        lotNumber: line.lotNumber, expiryDate: iso(line.expiryDate), notes: line.notes,
      })),
      approvalIntent: { ...intent, activationFamily: String(intent.activationFamily), activationStatus: String(intent.activationStatus) },
      approvalStep,
    });
  }

  if (eligible.documentType === "StockCountAttemptReview") {
    const source = await client.stockCountAttempt.findFirst({
      where: { id: eligible.documentId, tenantId, companyId, status: "SUBMITTED" },
      include: {
        company: true, createdBy: true, assignedTo: true,
        inventoryLocation: { include: { location: { include: { brand: true } } } },
        stockCountSession: true,
        lines: { orderBy: { lineNumber: "asc" }, include: { item: true, uom: true, countedBy: true } },
        sourceRecountTransitions: { orderBy: { occurredAt: "asc" } },
        reviewSubmissionIntents: {
          where: { approvalInstanceId: eligible.approvalInstanceId, approvalDocumentType: "StockCountAttemptReview" },
          select: {
            id: true, attemptVersionBefore: true, attemptVersionAfter: true,
            sessionVersionBefore: true, sessionVersionAfter: true, evidenceCanonicalHash: true,
            configurationRevisionId: true, configurationRevisionNumber: true, configurationDigest: true,
            activationEventId: true, activationFamily: true, activationStatus: true, activationGeneration: true,
            requestHash: true,
          },
        },
      },
    });
    if (!source) return null;
    if (source.lines.length === 0) throw new Error("APPROVAL_REVIEW_COUNT_LINES_UNAVAILABLE");
    const intent = assertSingleLineage(source.reviewSubmissionIntents, "APPROVAL_REVIEW_COUNT_LINEAGE_UNAVAILABLE");
    assertBoundedInventoryReviewSourceGuard({
      expectedFamily: "StockCountAttemptReview", eligible, sessionTenantId: tenantId, sessionCompanyId: companyId,
      sourceTenantId: source.tenantId, sourceCompanyId: source.companyId, sourceStatus: source.status,
      expectedStatus: "SUBMITTED", sourceId: source.id,
      prohibitedActorIds: [
        source.createdByUserId, source.assignedToUserId, source.stockCountSession.createdByUserId,
        source.stockCountSession.assignedToUserId, ...source.lines.map((line) => line.countedByUserId),
      ],
      actorUserId: session.user.id,
    });
    if (
      intent.attemptVersionAfter !== source.version ||
      intent.sessionVersionAfter !== source.stockCountSession.version ||
      intent.activationFamily !== "StockCountAttemptReview" ||
      intent.activationStatus !== "ACTIVE"
    ) throw new Error("APPROVAL_REVIEW_COUNT_LINEAGE_STALE");
    const location = source.inventoryLocation.location;

    return mapStockCountAttemptReview({
      tenantId, companyId, companyCode: source.company.code, companyName: source.company.legalName,
      documentId: source.id, stockCountSessionId: source.stockCountSessionId,
      publicReference: source.stockCountSession.publicReference, status: source.status,
      attemptVersion: source.version, sessionVersion: source.stockCountSession.version,
      attemptNumber: source.attemptNumber, countType: source.stockCountSession.countType,
      scopeType: source.stockCountSession.scopeType, blindCount: source.blindCount,
      freezeMovements: source.freezeMovements, location: locationSnapshot(location),
      createdByUserId: source.createdByUserId, createdByName: source.createdBy.displayName,
      assignedToUserId: source.assignedToUserId, assignedToName: source.assignedTo?.displayName ?? null,
      reason: source.reason, reviewNotes: source.reviewNotes, evidenceReference: source.evidenceReference,
      cutoffAt: iso(source.cutoffAt), scheduledDate: iso(source.stockCountSession.scheduledDate),
      startedAt: iso(source.startedAt), submittedAt: iso(source.submittedAt),
      createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString(),
      lines: source.lines.map((line) => ({
        id: line.id, lineNumber: line.lineNumber, itemId: line.itemId, itemCode: line.item.itemCode,
        itemName: line.item.itemName, uomId: line.uomId, uomCode: line.uom.uomCode,
        lotKey: line.lotKey, lotNumber: line.lotNumber, expiryDate: iso(line.expiryDate),
        systemQuantityBaseUom: line.systemQuantityBaseUom.toString(),
        countedQuantityBaseUom: line.countedQuantityBaseUom?.toString() ?? null,
        varianceQuantityBaseUom: line.varianceQuantityBaseUom?.toString() ?? null,
        notes: line.notes, countedByUserId: line.countedByUserId,
        countedByName: line.countedBy?.displayName ?? null, countedAt: iso(line.countedAt),
      })),
      recountTransitions: source.sourceRecountTransitions.map((transition) => ({
        id: transition.id, successorAttemptId: transition.successorAttemptId,
        linkedStockAdjustmentId: transition.linkedStockAdjustmentId,
        adjustmentDisposition: transition.adjustmentDisposition, cutoffDisposition: transition.cutoffDisposition,
        reason: transition.reason, evidenceReference: transition.evidenceReference,
        occurredAt: transition.occurredAt.toISOString(),
      })),
      reviewIntent: { ...intent, activationFamily: String(intent.activationFamily), activationStatus: String(intent.activationStatus) },
      approvalStep,
    });
  }

  if (eligible.documentType === "WastageReport") {
    const source = await client.wastageReport.findFirst({
      where: { id: eligible.documentId, tenantId, companyId, status: "PENDING_APPROVAL" },
      include: {
        company: true, reportedBy: true,
        inventoryLocation: { include: { location: { include: { brand: true } } } },
        lines: { orderBy: { lineNumber: "asc" }, include: { item: true, uom: true } },
      },
    });
    if (!source) return null;
    if (source.lines.length === 0) throw new Error("APPROVAL_REVIEW_WASTAGE_LINES_UNAVAILABLE");
    assertBoundedInventoryReviewSourceGuard({
      expectedFamily: "WastageReport", eligible, sessionTenantId: tenantId, sessionCompanyId: companyId,
      sourceTenantId: source.tenantId, sourceCompanyId: source.companyId, sourceStatus: source.status,
      expectedStatus: "PENDING_APPROVAL", sourceId: source.id,
      prohibitedActorIds: [source.reportedByUserId], actorUserId: session.user.id,
    });
    return mapWastageReportReview({
      tenantId, companyId, companyCode: source.company.code, companyName: source.company.legalName,
      currencyCode: source.company.currencyCode, documentId: source.id, publicReference: source.publicReference,
      status: source.status, wastageType: source.wastageType, reasonCode: source.reasonCode,
      evidenceReference: source.evidenceReference, evidenceRequired: source.evidenceRequired,
      evidenceSatisfied: source.evidenceSatisfied, notes: source.notes,
      totalEstimatedCost: source.totalEstimatedCost.toString(),
      policyFlags: canonicalize(source.policyFlags), policySnapshot: canonicalize(source.policySnapshot),
      location: locationSnapshot(source.inventoryLocation.location), reportedByUserId: source.reportedByUserId,
      reportedByName: source.reportedBy.displayName, submittedAt: iso(source.submittedAt),
      createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString(),
      lines: source.lines.map((line) => ({
        id: line.id, lineNumber: line.lineNumber, itemId: line.itemId, itemCode: line.item.itemCode,
        itemName: line.item.itemName, description: line.description, uomId: line.uomId,
        uomCode: line.uom.uomCode, quantity: line.quantity.toString(),
        quantityBaseUom: line.quantityBaseUom.toString(), estimatedUnitCost: line.estimatedUnitCost.toString(),
        estimatedTotalCost: line.estimatedTotalCost.toString(), reasonCode: line.reasonCode,
        evidenceReference: line.evidenceReference, photoRequired: line.photoRequired,
        lotNumber: line.lotNumber, expiryDate: iso(line.expiryDate), notes: line.notes,
      })),
      approvalStep,
    });
  }

  const source = await client.stockAdjustment.findFirst({
    where: { id: eligible.documentId, tenantId, companyId, status: "PENDING_APPROVAL" },
    include: {
      company: true, requestedBy: true,
      inventoryLocation: { include: { location: { include: { brand: true } } } },
      lines: { orderBy: { lineNumber: "asc" }, include: { item: true, uom: true } },
    },
  });
  if (!source) return null;
  if (source.lines.length === 0) throw new Error("APPROVAL_REVIEW_ADJUSTMENT_LINES_UNAVAILABLE");
  assertBoundedInventoryReviewSourceGuard({
    expectedFamily: "StockAdjustment", eligible, sessionTenantId: tenantId, sessionCompanyId: companyId,
    sourceTenantId: source.tenantId, sourceCompanyId: source.companyId, sourceStatus: source.status,
    expectedStatus: "PENDING_APPROVAL", sourceId: source.id,
    prohibitedActorIds: [source.requestedByUserId], actorUserId: session.user.id,
  });
  return mapStockAdjustmentReview({
    tenantId, companyId, companyCode: source.company.code, companyName: source.company.legalName,
    currencyCode: source.company.currencyCode, documentId: source.id, publicReference: source.publicReference,
    status: source.status, adjustmentType: source.adjustmentType, reasonCode: source.reasonCode,
    reasonDescription: source.reasonDescription, evidenceReference: source.evidenceReference,
    sourceDocumentType: source.sourceDocumentType, sourceDocumentId: source.sourceDocumentId,
    sourceStockCountSessionId: source.sourceStockCountSessionId,
    sourceStockCountAttemptId: source.sourceStockCountAttemptId,
    totalEstimatedValueImpact: source.totalEstimatedValueImpact.toString(),
    location: locationSnapshot(source.inventoryLocation.location), requestedByUserId: source.requestedByUserId,
    requestedByName: source.requestedBy.displayName, submittedAt: iso(source.submittedAt),
    createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString(),
    lines: source.lines.map((line) => ({
      id: line.id, lineNumber: line.lineNumber, itemId: line.itemId, itemCode: line.item.itemCode,
      itemName: line.item.itemName, uomId: line.uomId, uomCode: line.uom.uomCode,
      lotKey: line.lotKey, lotNumber: line.lotNumber, expiryDate: iso(line.expiryDate),
      systemQuantityBaseUom: line.systemQuantityBaseUom.toString(),
      quantityDeltaBaseUom: line.quantityDeltaBaseUom.toString(), unitCost: line.unitCost.toString(),
      estimatedValueImpact: line.estimatedValueImpact.toString(), reasonCode: line.reasonCode,
      notes: line.notes, evidenceReference: line.evidenceReference,
      sourceStockCountLineId: line.sourceStockCountLineId,
      sourceStockCountAttemptLineId: line.sourceStockCountAttemptLineId,
    })),
    approvalStep,
  });
}
