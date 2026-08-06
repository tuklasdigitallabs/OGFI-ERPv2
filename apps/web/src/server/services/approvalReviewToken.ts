import { z } from "zod";
import {
  signInternalServerValue,
  verifyInternalServerValue,
} from "./authentication";
import {
  boundedInventoryUatApprovalFamilies,
  type BoundedInventoryUatApprovalFamily,
} from "./boundedApprovalWorklist";
import type { SessionContext } from "./context";

const approvalReviewTokenDomain = "approval-review:v1";
const approvalReviewTokenTtlMs = 15 * 60_000;
const approvalReviewTokenClockSkewMs = 60_000;
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const approvalFamilyTuple = boundedInventoryUatApprovalFamilies as readonly [
  BoundedInventoryUatApprovalFamily,
  ...BoundedInventoryUatApprovalFamily[],
];

export const approvalReviewTokenPayloadSchema = z
  .object({
    version: z.literal(1),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    tenantId: z.string().uuid(),
    companyId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    sessionId: z.string().uuid(),
    approvalId: z.string().uuid(),
    family: z.enum(approvalFamilyTuple),
    stepId: z.string().uuid(),
    stepOrder: z.number().int().positive(),
    assignedUserId: z.string().uuid().nullable(),
    assignedRoleId: z.string().uuid().nullable(),
    requiredPermissionCode: z.string().trim().min(1).max(160),
    routingFingerprint: sha256HexSchema,
    routingSchemaVersion: z.number().int().positive(),
    activatedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    documentId: z.string().uuid(),
    sourceRevision: z.string().trim().min(1).max(512),
    reviewDigest: sha256HexSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    const validityMs = payload.expiresAt - payload.issuedAt;
    if (validityMs <= 0 || validityMs > approvalReviewTokenTtlMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "Invalid approval review token validity window",
      });
    }
  });

export type ApprovalReviewTokenPayload = z.infer<
  typeof approvalReviewTokenPayloadSchema
>;

export type ApprovalReviewTokenInput = Omit<
  ApprovalReviewTokenPayload,
  | "version"
  | "issuedAt"
  | "expiresAt"
  | "tenantId"
  | "companyId"
  | "actorUserId"
  | "sessionId"
>;

export type ApprovalReviewTokenExpectation = {
  approvalId: string;
  family?: BoundedInventoryUatApprovalFamily;
};

function staleApprovalReview(): never {
  throw new Error("APPROVAL_REVIEW_STALE");
}

function canonicalApprovalReviewPayload(
  payload: ApprovalReviewTokenPayload,
): string {
  return JSON.stringify({
    version: payload.version,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    tenantId: payload.tenantId,
    companyId: payload.companyId,
    actorUserId: payload.actorUserId,
    sessionId: payload.sessionId,
    approvalId: payload.approvalId,
    family: payload.family,
    stepId: payload.stepId,
    stepOrder: payload.stepOrder,
    assignedUserId: payload.assignedUserId,
    assignedRoleId: payload.assignedRoleId,
    requiredPermissionCode: payload.requiredPermissionCode,
    routingFingerprint: payload.routingFingerprint,
    routingSchemaVersion: payload.routingSchemaVersion,
    activatedAt: payload.activatedAt,
    documentId: payload.documentId,
    sourceRevision: payload.sourceRevision,
    reviewDigest: payload.reviewDigest,
  });
}

function encodeApprovalReviewPayload(payload: ApprovalReviewTokenPayload) {
  return Buffer.from(canonicalApprovalReviewPayload(payload), "utf8").toString(
    "base64url",
  );
}

export function issueApprovalReviewToken(
  session: SessionContext,
  input: ApprovalReviewTokenInput,
  now = Date.now(),
) {
  if (!session.authentication?.sessionId) return staleApprovalReview();
  const payload = approvalReviewTokenPayloadSchema.parse({
    approvalId: input.approvalId,
    family: input.family,
    stepId: input.stepId,
    stepOrder: input.stepOrder,
    assignedUserId: input.assignedUserId,
    assignedRoleId: input.assignedRoleId,
    requiredPermissionCode: input.requiredPermissionCode,
    routingFingerprint: input.routingFingerprint,
    routingSchemaVersion: input.routingSchemaVersion,
    activatedAt: input.activatedAt,
    documentId: input.documentId,
    sourceRevision: input.sourceRevision,
    reviewDigest: input.reviewDigest,
    version: 1,
    issuedAt: now,
    expiresAt: now + approvalReviewTokenTtlMs,
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    actorUserId: session.user.id,
    sessionId: session.authentication.sessionId,
  });
  const encoded = encodeApprovalReviewPayload(payload);
  return `${encoded}.${signInternalServerValue(approvalReviewTokenDomain, encoded)}`;
}

export function verifyApprovalReviewToken(
  session: SessionContext,
  token: string,
  expected: ApprovalReviewTokenExpectation,
  now = Date.now(),
): ApprovalReviewTokenPayload {
  try {
    const [encoded, signature, ...extra] = token.split(".");
    if (!encoded || !signature || extra.length > 0) return staleApprovalReview();
    if (
      !verifyInternalServerValue(
        approvalReviewTokenDomain,
        encoded,
        signature,
      )
    ) {
      return staleApprovalReview();
    }

    const payload = approvalReviewTokenPayloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (encodeApprovalReviewPayload(payload) !== encoded) {
      return staleApprovalReview();
    }
    if (
      !session.authentication?.sessionId ||
      payload.tenantId !== session.context.tenantId ||
      payload.companyId !== session.context.companyId ||
      payload.actorUserId !== session.user.id ||
      payload.sessionId !== session.authentication.sessionId ||
      payload.approvalId !== expected.approvalId ||
      (expected.family !== undefined && payload.family !== expected.family) ||
      payload.issuedAt > now + approvalReviewTokenClockSkewMs ||
      payload.expiresAt <= now
    ) {
      return staleApprovalReview();
    }
    return payload;
  } catch {
    return staleApprovalReview();
  }
}
