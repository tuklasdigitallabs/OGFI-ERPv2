import { createHash } from "node:crypto";
import { Prisma, prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import {
  getBoundedApprovalProcurementReview,
  type BoundedApprovalProcurementReview,
} from "./boundedApprovalProcurementReview";
import {
  isBoundedInventoryReviewFamily,
  loadBoundedApprovalInventoryReview,
  type BoundedApprovalInventoryReview,
} from "./boundedApprovalInventoryReview";
import {
  assertBoundedInventoryUatApprovalCommand,
  boundedInventoryUatApprovalFamilies,
  isBoundedInventoryUatApprovalFamily,
  type BoundedInventoryUatApprovalFamily,
} from "./boundedApprovalWorklist";
import type { SessionContext } from "./context";
import {
  APPROVAL_ROUTING_SCHEMA_VERSION,
  listEligibleApprovalStepPage,
  type EligibleApprovalStep,
} from "./approvalRouting";
import {
  issueApprovalReviewToken,
  verifyApprovalReviewToken,
  type ApprovalReviewTokenPayload,
} from "./approvalReviewToken";

type BoundedApprovalReviewClient = TransactionClient;

export type BoundedApprovalReviewSource =
  | BoundedApprovalProcurementReview
  | BoundedApprovalInventoryReview;

export type BoundedApprovalReview = BoundedApprovalReviewSource & {
  reviewToken: string;
  routing: BoundedApprovalRoutingSnapshot;
};

export type BoundedApprovalRoutingSnapshot = {
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedRoleId: string | null;
  assignedRoleName: string | null;
  requiredPermissionCode: string;
  fingerprint: string;
};

function unavailable(): never {
  throw new Error("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
}

function stale(): never {
  throw new Error("APPROVAL_REVIEW_STALE");
}

function inventorySourceRevision(review: BoundedApprovalInventoryReview) {
  if (review.family === "InventoryTransfer") {
    return `version:${review.sourceRevision.version}`;
  }
  if (review.family === "StockCountAttemptReview") {
    return `attempt:${review.sourceRevision.attemptVersion};session:${review.sourceRevision.sessionVersion}`;
  }
  return `updatedAt:${review.sourceRevision.updatedAt}`;
}

export function boundedApprovalReviewSourceRevision(
  review: BoundedApprovalReviewSource,
) {
  return "reviewDigest" in review
    ? review.sourceRevision
    : inventorySourceRevision(review);
}

export function boundedApprovalReviewDigest(review: BoundedApprovalReviewSource) {
  return "reviewDigest" in review ? review.reviewDigest : review.snapshotDigest;
}

async function loadReview(
  session: SessionContext,
  eligible: EligibleApprovalStep,
  client: BoundedApprovalReviewClient = prisma,
): Promise<BoundedApprovalReviewSource> {
  if (
    eligible.documentType === "PurchaseRequest" ||
    eligible.documentType === "QuotationRecommendation" ||
    eligible.documentType === "PurchaseOrder"
  ) {
    return getBoundedApprovalProcurementReview(session, eligible, client);
  }
  if (isBoundedInventoryReviewFamily(eligible.documentType)) {
    const review = await loadBoundedApprovalInventoryReview(
      session,
      eligible,
      client,
    );
    if (review) return review;
  }
  return unavailable();
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

function sameEligibility(left: EligibleApprovalStep, right: EligibleApprovalStep) {
  return (
    left.approvalInstanceId === right.approvalInstanceId &&
    left.approvalInstanceStepId === right.approvalInstanceStepId &&
    left.documentType === right.documentType &&
    left.documentId === right.documentId &&
    left.stepOrder === right.stepOrder &&
    left.requiredPermissionCode === right.requiredPermissionCode &&
    left.assignedUserId === right.assignedUserId &&
    left.assignedRoleId === right.assignedRoleId &&
    sameDate(left.activatedAt, right.activatedAt) &&
    sameDate(left.dueAt, right.dueAt)
  );
}

async function getBoundedApprovalRoutingSnapshot(
  client: BoundedApprovalReviewClient,
  session: SessionContext,
  eligible: EligibleApprovalStep,
): Promise<BoundedApprovalRoutingSnapshot> {
  const stepRows = await client.$queryRaw<Array<{
    assignedUserId: string | null;
    assignedUserName: string | null;
    assignedRoleId: string | null;
    assignedRoleName: string | null;
    requiredPermissionCode: string;
    scopeGroupMatchMode: string;
  }>>(Prisma.sql`
    SELECT step."assignedUserId", assigned_user."displayName" AS "assignedUserName",
           step."assignedRoleId", assigned_role.name AS "assignedRoleName",
           permission.code AS "requiredPermissionCode",
           step."scopeGroupMatchMode"::text AS "scopeGroupMatchMode"
      FROM "ApprovalInstanceStep" step
      JOIN "ApprovalInstance" approval ON approval.id = step."approvalInstanceId"
      JOIN "Permission" permission ON permission.id = step."requiredPermissionId"
      LEFT JOIN "User" assigned_user ON assigned_user.id = step."assignedUserId"
      LEFT JOIN "Role" assigned_role ON assigned_role.id = step."assignedRoleId"
     WHERE approval.id = ${eligible.approvalInstanceId}::uuid
       AND step.id = ${eligible.approvalInstanceStepId}::uuid
       AND approval."tenantId" = ${session.context.tenantId}::uuid
       AND approval."companyId" = ${session.context.companyId}::uuid
       AND step.status = 'PENDING'::"ApprovalStepStatus"
  `);
  const step = stepRows[0];
  if (!step || stepRows.length !== 1) return stale();

  const groups = await client.$queryRaw<Array<{
    id: string;
    groupOrder: number;
    targetMatchMode: string;
  }>>(Prisma.sql`
    SELECT scope_group.id, scope_group."groupOrder",
           scope_group."targetMatchMode"::text AS "targetMatchMode"
      FROM "ApprovalInstanceStepScopeGroup" scope_group
     WHERE scope_group."approvalInstanceStepId" = ${eligible.approvalInstanceStepId}::uuid
     ORDER BY scope_group."groupOrder" ASC, scope_group.id ASC
  `);
  const targets = await client.$queryRaw<Array<{
    id: string;
    scopeGroupId: string;
    companyId: string;
    brandId: string | null;
    locationId: string | null;
  }>>(Prisma.sql`
    SELECT target.id, target."scopeGroupId", target."companyId",
           target."brandId", target."locationId"
      FROM "ApprovalInstanceStepScopeTarget" target
      JOIN "ApprovalInstanceStepScopeGroup" scope_group
        ON scope_group.id = target."scopeGroupId"
     WHERE scope_group."approvalInstanceStepId" = ${eligible.approvalInstanceStepId}::uuid
     ORDER BY scope_group."groupOrder" ASC, target.id ASC
  `);
  const prohibitedActors = await client.$queryRaw<Array<{
    userId: string;
    reasonCode: string;
  }>>(Prisma.sql`
    SELECT prohibited."userId", prohibited."reasonCode"
      FROM "ApprovalInstanceStepProhibitedActor" prohibited
     WHERE prohibited."approvalInstanceStepId" = ${eligible.approvalInstanceStepId}::uuid
     ORDER BY prohibited."userId" ASC, prohibited."reasonCode" ASC
  `);
  const canonical = JSON.stringify({
    activatedAt: eligible.activatedAt.toISOString(),
    approvalInstanceId: eligible.approvalInstanceId,
    approvalInstanceStepId: eligible.approvalInstanceStepId,
    assignedRoleId: step.assignedRoleId,
    assignedUserId: step.assignedUserId,
    dueAt: eligible.dueAt?.toISOString() ?? null,
    groups,
    prohibitedActors,
    requiredPermissionCode: step.requiredPermissionCode,
    routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION,
    scopeGroupMatchMode: step.scopeGroupMatchMode,
    stepOrder: eligible.stepOrder,
    targets,
  });
  return {
    assignedUserId: step.assignedUserId,
    assignedUserName: step.assignedUserName,
    assignedRoleId: step.assignedRoleId,
    assignedRoleName: step.assignedRoleName,
    requiredPermissionCode: step.requiredPermissionCode,
    fingerprint: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

async function exactEligibleStep(
  session: SessionContext,
  input: {
    approvalInstanceId: string;
    approvalInstanceStepId?: string;
    family?: BoundedInventoryUatApprovalFamily;
  },
  client: BoundedApprovalReviewClient = prisma,
) {
  const page = await listEligibleApprovalStepPage(
    session,
    {
      page: 1,
      pageSize: 1,
      approvalInstanceId: input.approvalInstanceId,
      ...(input.approvalInstanceStepId
        ? { approvalInstanceStepId: input.approvalInstanceStepId }
        : {}),
      documentTypes: input.family
        ? [input.family]
        : boundedInventoryUatApprovalFamilies,
    },
    client,
  );
  const eligible = page.items[0];
  if (
    page.totalItems !== 1 ||
    !eligible ||
    eligible.approvalInstanceId !== input.approvalInstanceId ||
    !isBoundedInventoryUatApprovalFamily(eligible.documentType)
  ) return unavailable();
  return eligible;
}

/**
 * Loads one decision-sufficient review, then repeats exact eligibility after
 * source hydration so a revoked role/scope/current step cannot receive a stale
 * detail merely because it passed the first query.
 */
export async function getBoundedInventoryUatApprovalReview(
  session: SessionContext,
  approvalInstanceId: string,
): Promise<BoundedApprovalReview> {
  assertBoundedInventoryUatApprovalCommand(session, "PurchaseRequest");
  if (!z.string().uuid().safeParse(approvalInstanceId).success) {
    return unavailable();
  }
  const eligible = await exactEligibleStep(session, { approvalInstanceId });
  const review = await loadReview(session, eligible);
  const finalEligible = await exactEligibleStep(session, {
    approvalInstanceId,
    approvalInstanceStepId: eligible.approvalInstanceStepId,
    family: eligible.documentType as BoundedInventoryUatApprovalFamily,
  });
  if (!sameEligibility(eligible, finalEligible)) return unavailable();
  const routing = await getBoundedApprovalRoutingSnapshot(
    prisma,
    session,
    finalEligible,
  );

  return {
    ...review,
    routing,
    reviewToken: issueApprovalReviewToken(session, {
      approvalId: eligible.approvalInstanceId,
      family: eligible.documentType as BoundedInventoryUatApprovalFamily,
      stepId: eligible.approvalInstanceStepId,
      stepOrder: eligible.stepOrder,
      routingSchemaVersion: APPROVAL_ROUTING_SCHEMA_VERSION,
      activatedAt: eligible.activatedAt.toISOString(),
      documentId: eligible.documentId,
      assignedUserId: routing.assignedUserId,
      assignedRoleId: routing.assignedRoleId,
      requiredPermissionCode: routing.requiredPermissionCode,
      routingFingerprint: routing.fingerprint,
      sourceRevision: boundedApprovalReviewSourceRevision(review),
      reviewDigest: boundedApprovalReviewDigest(review),
    }),
  };
}

/**
 * Must run inside the existing typed family transaction after its canonical
 * source/lineage locks and before any decision, audit, notification, or source
 * mutation. The adapter reads through that same transaction snapshot.
 */
export async function assertBoundedApprovalReviewMatchesLockedState(
  tx: TransactionClient,
  session: SessionContext,
  token: string,
  expected: {
    approvalInstanceId: string;
    family: BoundedInventoryUatApprovalFamily;
  },
): Promise<ApprovalReviewTokenPayload> {
  const claims = verifyApprovalReviewToken(session, token, {
    approvalId: expected.approvalInstanceId,
    family: expected.family,
  });
  const eligible = await exactEligibleStep(
    session,
    {
      approvalInstanceId: expected.approvalInstanceId,
      approvalInstanceStepId: claims.stepId,
      family: expected.family,
    },
    tx,
  ).catch(() => stale());
  if (
    eligible.approvalInstanceStepId !== claims.stepId ||
    eligible.stepOrder !== claims.stepOrder ||
    eligible.documentId !== claims.documentId ||
    claims.routingSchemaVersion !== APPROVAL_ROUTING_SCHEMA_VERSION ||
    eligible.activatedAt.toISOString() !== claims.activatedAt ||
    eligible.assignedUserId !== claims.assignedUserId ||
    eligible.assignedRoleId !== claims.assignedRoleId ||
    eligible.requiredPermissionCode !== claims.requiredPermissionCode
  ) return stale();
  const routing = await getBoundedApprovalRoutingSnapshot(
    tx,
    session,
    eligible,
  ).catch(() => stale());
  if (routing.fingerprint !== claims.routingFingerprint) return stale();
  const review = await loadReview(session, eligible, tx).catch(() => stale());
  if (
    boundedApprovalReviewSourceRevision(review) !== claims.sourceRevision ||
    boundedApprovalReviewDigest(review) !== claims.reviewDigest
  ) return stale();
  return claims;
}
