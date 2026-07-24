import { prisma, Prisma, type TransactionClient } from "@ogfi/database";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canUseReceiving, permissions, requirePermission } from "./authorization";
import { assertAuthorizedLocation, requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import {
  lockInventoryLocationsForPosting,
  postInventoryMovementInTransaction
} from "./inventory";
import { classifyPurchaseOrderDeliveryAging } from "./purchaseOrders";
import {
  dashboardTaskAfterWhere,
  type DashboardTaskCursor,
  type DashboardTaskFilter
} from "./dashboardTasks";
import { assertPrivilegedMfaForAction } from "./privilegedMfaGuard";
import {
  getAuthMode,
  getMfaStepUpMinutes,
  isMfaAssuranceFresh
} from "./authentication";

const createReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/, "invalid idempotency key"),
  supplierDeliveryReceiptNumber: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional()
});

const postReceiptSchema = z.object({
  id: z.string().uuid()
});

const reverseReceiptSchema = z.object({
  id: z.string().uuid(),
  reversalReason: z.string().trim().min(5).max(500)
});

export function assertPurchaseOrderCanBeReceived(status: string) {
  if (status !== "ISSUED" && status !== "PARTIALLY_RECEIVED") {
    throw new Error("PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING");
  }
}

export function assertGoodsReceiptCanBePosted(status: string) {
  if (status !== "DRAFT") {
    throw new Error("GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING");
  }
}

export function assertGoodsReceiptCanBeReversed(status: string, reversedAt?: unknown) {
  if (reversedAt) {
    throw new Error("GOODS_RECEIPT_ALREADY_REVERSED");
  }
  if (status !== "POSTED" && status !== "POSTED_WITH_DISCREPANCY") {
    throw new Error("GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL");
  }
}

export function calculatePurchaseOrderReceivingStatus(
  lines: Array<{ orderedQty: unknown; receivedQty: unknown; cancelledQty: unknown }>
) {
  const totalReceived = lines.reduce(
    (sum, line) => sum + Number(line.receivedQty),
    0
  );
  if (totalReceived <= 0) {
    return "ISSUED";
  }
  const fullyReceived = lines.every(
    (line) =>
      Number(line.receivedQty) + Number(line.cancelledQty) >=
      Number(line.orderedQty)
  );
  return fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
}

async function requireReceivingRead(session: SessionContext) {
  if (!canUseReceiving(session.permissionCodes)) {
    await requirePermission(session, permissions.receivingView);
  }
}

export const receivingDashboardProfiles = ["receiving-follow-up-v1"] as const;
export type ReceivingDashboardProfile =
  (typeof receivingDashboardProfiles)[number];

const receivingFollowUpCleanStatuses = ["DRAFT", "POSTING"] as const;
const receivingFollowUpFlaggedStatuses = [
  "DRAFT",
  "POSTING",
  "POSTED",
  "POSTED_WITH_DISCREPANCY",
  "REVERSING"
] as const;
const receivingDashboardProfilePageSize = 25;
const receivingDashboardProfileSearchMaxLength = 120;

export function isReceivingFollowUp(receipt: {
  status: string;
  discrepancyFlag: boolean;
}) {
  return (
    (!receipt.discrepancyFlag &&
      receivingFollowUpCleanStatuses.includes(
        receipt.status as (typeof receivingFollowUpCleanStatuses)[number]
      )) ||
    receipt.status === "POSTED_WITH_DISCREPANCY" ||
    (receipt.discrepancyFlag &&
      receivingFollowUpFlaggedStatuses.includes(
        receipt.status as (typeof receivingFollowUpFlaggedStatuses)[number]
      ))
  );
}

export function resolveReceivingDashboardProfile(
  value: string | undefined
): ReceivingDashboardProfile | null {
  return value === "receiving-follow-up-v1" ? value : null;
}

export function receivingDashboardProfileHref(
  profile: ReceivingDashboardProfile,
  input: { page?: number; query?: string } = {}
) {
  const params = new URLSearchParams({ dashboard: profile });
  const query = input.query?.trim();
  if (query) params.set("q", query);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/receiving?${params.toString()}`;
}

/** The one closed, server-owned Receiving Follow-up population. */
export function receivingDashboardProfileWhere(
  session: SessionContext,
  profile: ReceivingDashboardProfile
) {
  if (profile !== "receiving-follow-up-v1") {
    throw new Error("RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED");
  }
  return {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    receivingLocationId: session.context.locationId,
    OR: [
      {
        discrepancyFlag: false,
        status: { in: [...receivingFollowUpCleanStatuses] }
      },
      { status: "POSTED_WITH_DISCREPANCY" },
      {
        discrepancyFlag: true,
        status: { in: [...receivingFollowUpFlaggedStatuses] }
      }
    ]
  } satisfies Prisma.GoodsReceiptWhereInput;
}

function normalizeReceivingDashboardProfileSearch(query?: string) {
  const normalized = query?.trim() || null;
  if (
    normalized &&
    normalized.length > receivingDashboardProfileSearchMaxLength
  ) {
    throw new Error("RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG");
  }
  return normalized;
}

function receivingDashboardProfileSearchWhere(query: string) {
  return {
    OR: [
      { publicReference: { contains: query, mode: "insensitive" as const } },
      {
        purchaseOrder: {
          publicReference: { contains: query, mode: "insensitive" as const }
        }
      },
      {
        supplier: {
          OR: [
            { tradingName: { contains: query, mode: "insensitive" as const } },
            { legalName: { contains: query, mode: "insensitive" as const } }
          ]
        }
      }
    ]
  } satisfies Prisma.GoodsReceiptWhereInput;
}

function receivingDashboardProfileFilteredWhere(
  session: SessionContext,
  profile: ReceivingDashboardProfile,
  query?: string
) {
  const profileWhere = receivingDashboardProfileWhere(session, profile);
  const normalizedQuery = normalizeReceivingDashboardProfileSearch(query);
  return {
    where: normalizedQuery
      ? {
          ...profileWhere,
          AND: [receivingDashboardProfileSearchWhere(normalizedQuery)]
        }
      : profileWhere,
    normalizedQuery
  };
}

export type ReceivingFollowUpInclusionReason =
  | "Reversal in progress"
  | "Discrepancy recorded"
  | "Unposted draft"
  | "Posting in progress";

export function receivingFollowUpInclusionReason(receipt: {
  status: string;
  discrepancyFlag: boolean;
}): ReceivingFollowUpInclusionReason {
  if (receipt.status === "REVERSING") return "Reversal in progress";
  if (
    receipt.status === "POSTED_WITH_DISCREPANCY" ||
    receipt.discrepancyFlag
  ) {
    return "Discrepancy recorded";
  }
  if (receipt.status === "POSTING") return "Posting in progress";
  if (receipt.status === "DRAFT") return "Unposted draft";
  throw new Error("RECEIVING_FOLLOW_UP_REASON_UNAVAILABLE");
}

const receivingDashboardTaskCandidateLimit = 8;
const receivingMyTaskPageSize = 25;

export type ReceivingDashboardRead = {
  followUpCount: number;
  taskCandidates: Array<{
    id: string;
    publicReference: string;
    status: string;
    supplierName: string;
    purchaseOrderReference: string;
    receivedAt: string;
    discrepancyFlag: boolean;
    inclusionReason: ReceivingFollowUpInclusionReason;
  }>;
};

export type ReceivingMyTaskPage = {
  totalCount: number;
  items: Array<{
    taskId: string;
    recordId: string;
    publicReference: string;
    status: "DRAFT";
    actionLabel: "Post receipt";
    supplierName: string;
    purchaseOrderReference: string;
    receivingLocationName: string;
    createdAt: string;
  }>;
  nextCursor: DashboardTaskCursor | null;
};

/**
 * Returns only draft receipts that this user can already post from the
 * authoritative Receiving Report detail. Discrepancy resolution is not
 * enrolled: it remains display-only until a controlled resolution action is
 * available in that workspace.
 */
export async function listReceivingMyTaskPage(
  session: SessionContext,
  input: { after?: DashboardTaskCursor; take?: number; filter?: DashboardTaskFilter } = {}
): Promise<ReceivingMyTaskPage> {
  await requireReceivingRead(session);

  if (!session.permissionCodes.includes(permissions.receivingPost)) {
    return { totalCount: 0, items: [], nextCursor: null };
  }
  if (input.filter?.priority && input.filter.priority !== "HIGH") return { totalCount: 0, items: [], nextCursor: null };
  if (input.filter?.status && input.filter.status !== "DRAFT") return { totalCount: 0, items: [], nextCursor: null };

  const take = Math.min(Math.max(input.take ?? receivingMyTaskPageSize, 1), 50);
  const afterWhere = dashboardTaskAfterWhere("RECEIVING", input.after);
  const scope = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    receivingLocationId: session.context.locationId,
    status: "DRAFT" as const
  };
  const [totalCount, rows] = await Promise.all([
    prisma.goodsReceipt.count({ where: scope }),
    prisma.goodsReceipt.findMany({
      where: {
        ...scope,
        ...(afterWhere ? { AND: [afterWhere] } : {})
      },
      select: {
        id: true,
        publicReference: true,
        createdAt: true,
        supplier: { select: { tradingName: true, legalName: true } },
        purchaseOrder: { select: { publicReference: true } },
        receivingLocation: { select: { name: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1
    })
  ]);
  const pageRows = rows.slice(0, take);
  const lastRow = pageRows.at(-1);

  return {
    totalCount,
    items: pageRows.map((receipt) => ({
      taskId: `receiving-${receipt.id}`,
      recordId: receipt.id,
      publicReference: receipt.publicReference,
      status: "DRAFT",
      actionLabel: "Post receipt",
      supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
      purchaseOrderReference: receipt.purchaseOrder.publicReference,
      receivingLocationName: receipt.receivingLocation.name,
      createdAt: receipt.createdAt.toISOString()
    })),
    nextCursor:
      rows.length > take && lastRow
        ? {
            createdAt: lastRow.createdAt.toISOString(),
            sourceType: "RECEIVING",
            recordId: lastRow.id
          }
        : null
  };
}

export type ReceivingFollowUpProfilePage = {
  items: Array<{
    id: string;
    publicReference: string;
    status: string;
    discrepancyFlag: boolean;
    inclusionReason: ReceivingFollowUpInclusionReason;
    supplierName: string;
    purchaseOrderReference: string;
    receivingLocationName: string;
    receivedAt: string;
    createdAt: string;
  }>;
  totalItems: number;
  page: number;
  pageSize: number;
  query: string | null;
};

export async function listReceivingDashboardProfilePage(
  session: SessionContext,
  profile: ReceivingDashboardProfile,
  input: { page?: number; query?: string } = {}
): Promise<ReceivingFollowUpProfilePage> {
  await requireReceivingRead(session);
  const requestedPage =
    input.page && Number.isFinite(input.page) && input.page > 0
      ? Math.floor(input.page)
      : 1;
  const { where, normalizedQuery } = receivingDashboardProfileFilteredWhere(
    session,
    profile,
    input.query
  );
  const totalItems = await prisma.goodsReceipt.count({ where });
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(totalItems / receivingDashboardProfilePageSize))
  );
  const receipts = await prisma.goodsReceipt.findMany({
    where,
    select: {
      id: true,
      publicReference: true,
      status: true,
      discrepancyFlag: true,
      receivedAt: true,
      createdAt: true,
      supplier: { select: { tradingName: true, legalName: true } },
      purchaseOrder: { select: { publicReference: true } },
      receivingLocation: { select: { name: true } }
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * receivingDashboardProfilePageSize,
    take: receivingDashboardProfilePageSize
  });

  return {
    items: receipts.map((receipt) => ({
      id: receipt.id,
      publicReference: receipt.publicReference,
      status: receipt.status,
      discrepancyFlag: receipt.discrepancyFlag,
      inclusionReason: receivingFollowUpInclusionReason(receipt),
      supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
      purchaseOrderReference: receipt.purchaseOrder.publicReference,
      receivingLocationName: receipt.receivingLocation.name,
      receivedAt: receipt.receivedAt.toISOString(),
      createdAt: receipt.createdAt.toISOString()
    })),
    totalItems,
    page,
    pageSize: receivingDashboardProfilePageSize,
    query: normalizedQuery
  };
}

/**
 * Deliberately narrow dashboard read. The receiving workspace remains the
 * authoritative place for receipt detail and line-level discrepancy review.
 */
export async function getReceivingDashboardRead(
  session: SessionContext
): Promise<ReceivingDashboardRead> {
  await requireReceivingRead(session);
  const where = receivingDashboardProfileWhere(
    session,
    "receiving-follow-up-v1"
  );

  const [followUpCount, candidates] = await Promise.all([
    prisma.goodsReceipt.count({ where }),
    prisma.goodsReceipt.findMany({
      where,
      select: {
        id: true,
        publicReference: true,
        status: true,
        discrepancyFlag: true,
        receivedAt: true,
        supplier: { select: { tradingName: true, legalName: true } },
        purchaseOrder: { select: { publicReference: true } }
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: receivingDashboardTaskCandidateLimit
    })
  ]);

  return {
    followUpCount,
    taskCandidates: candidates.map((receipt) => ({
      id: receipt.id,
      publicReference: receipt.publicReference,
      status: receipt.status,
      supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
      purchaseOrderReference: receipt.purchaseOrder.publicReference,
      receivedAt: receipt.receivedAt.toISOString(),
      discrepancyFlag: receipt.discrepancyFlag,
      inclusionReason: receivingFollowUpInclusionReason(receipt)
    }))
  };
}

export function validateReceivingQuantities(values: {
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  damagedQty: number;
  shortQty: number;
  outstandingQty?: number;
  discrepancyReason?: string | null;
  evidenceReference?: string | null;
}) {
  const quantities = [
    values.deliveredQty,
    values.acceptedQty,
    values.rejectedQty,
    values.damagedQty,
    values.shortQty
  ];
  if (quantities.some((quantity) => !Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("RECEIVING_QUANTITY_INVALID");
  }
  if (
    values.acceptedQty + values.rejectedQty + values.damagedQty >
    values.deliveredQty
  ) {
    throw new Error("RECEIVING_LINE_OUTCOME_EXCEEDS_DELIVERED");
  }
  if (
    values.outstandingQty != null &&
    (values.deliveredQty > values.outstandingQty ||
      values.acceptedQty > values.outstandingQty)
  ) {
    throw new Error("RECEIVING_LINE_EXCEEDS_OUTSTANDING");
  }
  if (
    (values.rejectedQty > 0 || values.damagedQty > 0 || values.shortQty > 0) &&
    !values.discrepancyReason?.trim()
  ) {
    throw new Error("RECEIVING_DISCREPANCY_REASON_REQUIRED");
  }
  if (
    (values.rejectedQty > 0 || values.damagedQty > 0 || values.shortQty > 0) &&
    !values.evidenceReference?.trim()
  ) {
    throw new Error("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");
  }
}

function getLineValue(formData: FormData, lineId: string, field: string) {
  return formData.get(`line.${lineId}.${field}`);
}

const receiptQuantityFields = new Set([
  "deliveredQty",
  "acceptedQty",
  "rejectedQty",
  "damagedQty"
]);
const receiptLineFields = [
  "deliveredQty",
  "acceptedQty",
  "rejectedQty",
  "damagedQty",
  "lotNumber",
  "expiryDate",
  "discrepancyReason",
  "evidenceReference",
  "notes"
] as const;

function normalizeReceiptHashValue(field: string, value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (receiptQuantityFields.has(field)) {
    const numeric = Number(trimmed || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(6) : trimmed;
  }
  return trimmed || null;
}

export function goodsReceiptCreateRequestHash(input: {
  formData: FormData;
  tenantId: string;
  companyId: string;
  receivingLocationId: string;
  actorUserId: string;
}) {
  const lineIds = new Set<string>();
  for (const key of input.formData.keys()) {
    const match = /^line\.([^\.]+)\.(.+)$/.exec(key);
    const lineId = match?.[1];
    const field = match?.[2];
    if (
      lineId &&
      field &&
      receiptLineFields.includes(field as (typeof receiptLineFields)[number])
    ) {
      lineIds.add(lineId);
    }
  }
  const lines = Array.from(lineIds)
    .sort()
    .map((lineId) => ({
      lineId,
      values: Object.fromEntries(
        receiptLineFields.map((field) => [
          field,
          normalizeReceiptHashValue(
            field,
            input.formData.get(`line.${lineId}.${field}`)?.toString() ?? null
          )
        ])
      )
    }));
  const canonical = {
    version: "goods-receipt-create-v1",
    tenantId: input.tenantId,
    companyId: input.companyId,
    receivingLocationId: input.receivingLocationId,
    actorUserId: input.actorUserId,
    purchaseOrderId: String(input.formData.get("purchaseOrderId") ?? "").trim(),
    supplierDeliveryReceiptNumber:
      String(input.formData.get("supplierDeliveryReceiptNumber") ?? "").trim() || null,
    notes: String(input.formData.get("notes") ?? "").trim() || null,
    lines
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function nextGoodsReceiptReference(
  client: typeof prisma | TransactionClient,
  tenantId: string,
  companyId: string
) {
  const year = new Date().getUTCFullYear();
  const rows = await client.$queryRaw<Array<{ nextValue: number }>>`
    INSERT INTO "DocumentNumberSequence" ("tenantId", "companyId", "documentType", "year", "nextValue")
    VALUES (${tenantId}::uuid, ${companyId}::uuid, 'GOODS_RECEIPT', ${year}, 2)
    ON CONFLICT ("companyId", "documentType", "year")
    DO UPDATE SET "nextValue" = "DocumentNumberSequence"."nextValue" + 1,
                  "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "nextValue" - 1 AS "nextValue"
  `;
  const nextValue = Number(rows[0]?.nextValue);
  if (!Number.isInteger(nextValue) || nextValue < 1) {
    throw new Error("GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED");
  }
  return `RR-${year}-${String(nextValue).padStart(5, "0")}`;
}

async function lockScopedPurchaseOrder(
  tx: TransactionClient,
  session: SessionContext,
  purchaseOrderId: string
) {
  const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT po.id
      FROM "PurchaseOrder" po
     WHERE po.id = ${purchaseOrderId}::uuid
       AND po."tenantId" = ${session.context.tenantId}::uuid
       AND po."companyId" = ${session.context.companyId}::uuid
       AND po."deliveryLocationId" = ${session.context.locationId}::uuid
     FOR UPDATE OF po
  `;
  if (!lockedOrders[0]) {
    throw new Error("PURCHASE_ORDER_NOT_FOUND");
  }
}

async function lockScopedPurchaseOrderLines(
  tx: TransactionClient,
  session: SessionContext,
  purchaseOrderId: string
) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT pol.id
      FROM "PurchaseOrderLine" pol
     WHERE pol."purchaseOrderId" = ${purchaseOrderId}::uuid
       AND pol."tenantId" = ${session.context.tenantId}::uuid
       AND pol."companyId" = ${session.context.companyId}::uuid
     ORDER BY pol."lineNumber" ASC, pol.id ASC
     FOR UPDATE OF pol
  `;
}

type LockedReceivingPrincipal = {
  status: string;
  privilegeEpoch: number;
};

type LockedReceivingSession = {
  status: string;
  assuranceLevel: string;
  mfaAuthenticatedAt: Date | null;
  privilegeEpochAtIssue: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

const privilegedMfaModes = [
  "warn_and_audit",
  "enforce_admin_security",
  "enforce_all_sensitive"
] as const;

async function assertFreshReceivingAuthority(
  tx: TransactionClient,
  session: SessionContext,
  permissionCode: string,
  requiresPrivilegedMfa: boolean
) {
  const users = await tx.$queryRaw<LockedReceivingPrincipal[]>`
    SELECT status, "privilegeEpoch"
      FROM "User"
     WHERE id = ${session.user.id}::uuid
       AND "tenantId" = ${session.context.tenantId}::uuid
     FOR SHARE
  `;
  const user = users[0];
  if (!user || user.status !== "ACTIVE") {
    throw new Error("AUTH_REQUIRED");
  }

  let liveSession: LockedReceivingSession | null = null;
  if (session.authentication?.sessionId) {
    const sessions = await tx.$queryRaw<LockedReceivingSession[]>`
      SELECT status, "assuranceLevel", "mfaAuthenticatedAt",
             "privilegeEpochAtIssue", "idleExpiresAt", "absoluteExpiresAt"
        FROM "AuthSession"
       WHERE id = ${session.authentication.sessionId}::uuid
         AND "tenantId" = ${session.context.tenantId}::uuid
         AND "userId" = ${session.user.id}::uuid
       FOR SHARE
    `;
    liveSession = sessions[0] ?? null;
  }

  const now = new Date();
  if (
    session.authentication?.sessionId &&
    (!liveSession ||
      liveSession.status !== "ACTIVE" ||
      liveSession.privilegeEpochAtIssue !== user.privilegeEpoch ||
      liveSession.idleExpiresAt <= now ||
      liveSession.absoluteExpiresAt <= now)
  ) {
    throw new Error("AUTH_REQUIRED");
  }
  if (getAuthMode() === "local" && !liveSession) {
    throw new Error("AUTH_REQUIRED");
  }

  const roleAssignments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT ura.id
      FROM "UserRoleAssignment" ura
      JOIN "Role" r ON r.id = ura."roleId"
      JOIN "RolePermission" rp ON rp."roleId" = r.id
      JOIN "Permission" p ON p.id = rp."permissionId"
     WHERE ura."userId" = ${session.user.id}::uuid
       AND ura.status = 'ACTIVE'::"RecordStatus"
       AND ura."startsAt" <= ${now}
       AND (ura."endsAt" IS NULL OR ura."endsAt" > ${now})
       AND r.status = 'ACTIVE'::"RecordStatus"
       AND (r."tenantId" IS NULL OR r."tenantId" = ${session.context.tenantId}::uuid)
       AND p.code = ${permissionCode}
       AND (p."tenantId" IS NULL OR p."tenantId" = ${session.context.tenantId}::uuid)
     ORDER BY ura.id ASC
     LIMIT 1
  `;
  if (!roleAssignments[0]) {
    throw new Error("PERMISSION_DENIED");
  }

  const locationScopes = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT usa.id
      FROM "UserScopeAssignment" usa
      JOIN "Location" l ON l.id = usa."scopeId"
     WHERE usa."userId" = ${session.user.id}::uuid
       AND usa."scopeType" = 'LOCATION'::"ScopeType"
       AND usa."scopeId" = ${session.context.locationId}::uuid
       AND usa.status = 'ACTIVE'::"RecordStatus"
       AND usa."startsAt" <= ${now}
       AND (usa."endsAt" IS NULL OR usa."endsAt" > ${now})
       AND l."tenantId" = ${session.context.tenantId}::uuid
       AND l."companyId" = ${session.context.companyId}::uuid
       AND l.status = 'ACTIVE'::"RecordStatus"
     ORDER BY usa.id ASC
     LIMIT 1
  `;
  if (!locationScopes[0]) {
    throw new Error("SCOPE_DENIED");
  }

  if (!requiresPrivilegedMfa) {
    return;
  }
  if (getAuthMode() === "local") {
    if (
      !liveSession ||
      !isMfaAssuranceFresh({
        assuranceLevel: liveSession.assuranceLevel,
        mfaAuthenticatedAt: liveSession.mfaAuthenticatedAt,
        freshnessMinutes: getMfaStepUpMinutes(),
        now
      })
    ) {
      throw new Error("PRIVILEGED_MFA_STEP_UP_REQUIRED");
    }
    return;
  }

  const policyRows = await tx.$queryRaw<
    Array<{ value: unknown; status: string }>
  >`
    SELECT value, status
      FROM "CompanyPolicySetting"
     WHERE "companyId" = ${session.context.companyId}::uuid
       AND key = 'security.privileged_mfa.enforcement_mode'
     FOR SHARE
  `;
  const configuredMode = policyRows[0]?.value;
  const mode =
    policyRows[0]?.status === "ACTIVE" &&
    typeof configuredMode === "string" &&
    privilegedMfaModes.includes(
      configuredMode as (typeof privilegedMfaModes)[number]
    )
      ? configuredMode
      : "warn_and_audit";
  if (mode !== "enforce_all_sensitive") {
    return;
  }

  const verifiedEnrollments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
      FROM "PrivilegedMfaEnrollment"
     WHERE "tenantId" = ${session.context.tenantId}::uuid
       AND "companyId" = ${session.context.companyId}::uuid
       AND "targetUserId" = ${session.user.id}::uuid
       AND status = 'VERIFIED'
     ORDER BY "verifiedAt" DESC, "updatedAt" DESC, id ASC
     LIMIT 1
     FOR SHARE
  `;
  if (!verifiedEnrollments[0]) {
    throw new Error("PRIVILEGED_MFA_REQUIRED");
  }
}

function isGoodsReceiptReferenceUniqueConstraintError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") {
    return false;
  }
  const meta = "meta" in error && typeof error.meta === "object" && error.meta !== null ? error.meta : null;
  const target = meta && "target" in meta ? meta.target : null;
  return Array.isArray(target)
    ? target.includes("companyId") && target.includes("publicReference")
    : typeof target === "string" && target.includes("publicReference");
}

function isGoodsReceiptIdempotencyUniqueConstraintError(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error)
  ) {
    return false;
  }
  if (error.code === "P2010") {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    return message.includes("23505") && message.includes("GoodsReceipt_tenantId_companyId_idempotencyKey");
  }
  if (error.code !== "P2002") return false;
  const meta =
    "meta" in error && typeof error.meta === "object" && error.meta !== null
      ? error.meta
      : null;
  const target = meta && "target" in meta ? meta.target : null;
  return Array.isArray(target)
    ? target.includes("tenantId") &&
        target.includes("companyId") &&
        target.includes("idempotencyKey")
    : typeof target === "string" && target.includes("idempotencyKey");
}

type GoodsReceiptIdempotencyRow = {
  id: string;
  purchaseOrderId: string;
  receivingLocationId: string;
  receivedByUserId: string;
  idempotencyRequestHash: string | null;
};

async function findGoodsReceiptByIdempotencyKey(
  client: typeof prisma | TransactionClient,
  session: SessionContext,
  idempotencyKey: string
) {
  const rows = await client.$queryRaw<GoodsReceiptIdempotencyRow[]>`
    SELECT id,
           "purchaseOrderId",
           "receivingLocationId",
           "receivedByUserId",
           "idempotencyRequestHash"
      FROM "GoodsReceipt"
     WHERE "tenantId" = ${session.context.tenantId}::uuid
       AND "companyId" = ${session.context.companyId}::uuid
       AND "idempotencyKey" = ${idempotencyKey}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getBaseQuantity(
  client: typeof prisma | TransactionClient,
  line: {
    itemId: string;
    uomId: string;
    acceptedQty: unknown;
    item: {
      baseUomId: string;
    };
  }
) {
  const acceptedQty = Number(line.acceptedQty);
  if (line.uomId === line.item.baseUomId) {
    return acceptedQty;
  }

  const conversion = await client.itemUomConversion.findFirst({
    where: {
      itemId: line.itemId,
      fromUomId: line.uomId,
      toUomId: line.item.baseUomId
    }
  });

  if (!conversion) {
    throw new Error("INVENTORY_UOM_CONVERSION_REQUIRED");
  }

  return acceptedQty * Number(conversion.conversionFactor);
}

type ReceivingRegisterTab = "all" | "draft" | "posted" | "discrepancies";
const receivingRegisterStatuses = [
  "DRAFT", "POSTING", "POSTED", "POSTED_WITH_DISCREPANCY", "REVERSING", "REVERSED"
] as const;
type ReceivingRegisterStatus = (typeof receivingRegisterStatuses)[number];

export type ReceivingRegisterFilters = {
  tab?: ReceivingRegisterTab;
  query?: string;
  status?: string;
  receivedFrom?: string;
  receivedTo?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  receivedByUserId?: string;
};

function parseReceivingFilterId(value: string | undefined, errorCode: string) {
  if (!value) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(errorCode);
  }
  return value;
}

function buildReceivingRegisterSharedWhere(
  session: SessionContext,
  input: {
    query?: string | undefined;
    receivedFrom?: Date | null | undefined;
    receivedTo?: Date | null | undefined;
    supplierId?: string | undefined;
    purchaseOrderId?: string | undefined;
    receivedByUserId?: string | undefined;
  }
): Prisma.GoodsReceiptWhereInput {
  return {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    receivingLocationId: session.context.locationId,
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : {}),
    ...(input.receivedByUserId ? { receivedByUserId: input.receivedByUserId } : {}),
    ...(input.receivedFrom || input.receivedTo
      ? {
          receivedAt: {
            ...(input.receivedFrom ? { gte: input.receivedFrom } : {}),
            ...(input.receivedTo ? { lt: input.receivedTo } : {})
          }
        }
      : {}),
    ...(input.query
      ? {
          OR: [
            { publicReference: { contains: input.query, mode: "insensitive" } },
            { purchaseOrder: { publicReference: { contains: input.query, mode: "insensitive" } } },
            { supplier: { legalName: { contains: input.query, mode: "insensitive" } } },
            { supplier: { tradingName: { contains: input.query, mode: "insensitive" } } }
          ]
        }
      : {})
  };
}

function parseReceivingDate(value: string | undefined, endExclusive = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const date = new Date(utc + (endExclusive ? 24 * 60 * 60 * 1000 : 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapGoodsReceipt(receipt: {
  id: string;
  publicReference: string;
  purchaseOrder: { publicReference: string; status: string; expectedDeliveryDate: Date };
  supplier: { tradingName: string | null; legalName: string };
  receivedBy: { displayName: string };
  reversedBy: { displayName: string } | null;
  receivedAt: Date;
  reversedAt: Date | null;
  status: string;
  lines?: { id: string }[];
  _count?: { lines: number };
  discrepancyFlag: boolean;
}) {
  return {
    id: receipt.id,
    publicReference: receipt.publicReference,
    purchaseOrderReference: receipt.purchaseOrder.publicReference,
    purchaseOrderStatus: receipt.purchaseOrder.status,
    purchaseOrderExpectedDeliveryDate: receipt.purchaseOrder.expectedDeliveryDate.toISOString().slice(0, 10),
    supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
    receivedByName: receipt.receivedBy.displayName,
    reversedByName: receipt.reversedBy?.displayName ?? null,
    receivedAt: receipt.receivedAt.toISOString(),
    reversedAt: receipt.reversedAt?.toISOString() ?? null,
    status: receipt.status,
    lineCount: receipt._count?.lines ?? receipt.lines?.length ?? 0,
    discrepancyFlag: receipt.discrepancyFlag
  };
}

export async function listGoodsReceipts(session: SessionContext) {
  await requireReceivingRead(session);

  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      _count: { select: { lines: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return receipts.map(mapGoodsReceipt);
}

export async function listReceivingRegisterFilterOptions(
  session: SessionContext,
  input: Pick<ReceivingRegisterFilters, "supplierId" | "purchaseOrderId" | "receivedByUserId" | "query"> = {}
) {
  await requireReceivingRead(session);
  const supplierId = parseReceivingFilterId(input.supplierId, "RECEIVING_SUPPLIER_FILTER_INVALID");
  const purchaseOrderId = parseReceivingFilterId(input.purchaseOrderId, "RECEIVING_PURCHASE_ORDER_FILTER_INVALID");
  const receivedByUserId = parseReceivingFilterId(input.receivedByUserId, "RECEIVING_RECEIVER_FILTER_INVALID");
  const scope = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    receivingLocationId: session.context.locationId
  };
  const query = input.query?.trim() || undefined;
  const optionWhere: Prisma.GoodsReceiptWhereInput = {
    ...scope,
    ...(query
      ? {
          OR: [
            { publicReference: { contains: query, mode: "insensitive" } },
            { purchaseOrder: { publicReference: { contains: query, mode: "insensitive" } } },
            { supplier: { legalName: { contains: query, mode: "insensitive" } } },
            { supplier: { tradingName: { contains: query, mode: "insensitive" } } }
          ]
        }
      : {})
  };
  const [recent, selected] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: optionWhere,
      select: {
        supplier: { select: { id: true, legalName: true, tradingName: true } },
        purchaseOrder: { select: { id: true, publicReference: true } },
        receivedBy: { select: { id: true, displayName: true, status: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100
    }),
    supplierId || purchaseOrderId || receivedByUserId
      ? prisma.goodsReceipt.findMany({
          where: {
            ...scope,
            OR: [
              ...(supplierId ? [{ supplierId }] : []),
              ...(purchaseOrderId ? [{ purchaseOrderId }] : []),
              ...(receivedByUserId ? [{ receivedByUserId }] : [])
            ]
          },
          select: {
            supplier: { select: { id: true, legalName: true, tradingName: true } },
            purchaseOrder: { select: { id: true, publicReference: true } },
            receivedBy: { select: { id: true, displayName: true, status: true } }
          },
          take: 10
        })
      : Promise.resolve([])
  ]);
  const suppliers = new Map<string, { id: string; label: string }>();
  const purchaseOrders = new Map<string, { id: string; label: string }>();
  const receivers = new Map<string, { id: string; label: string }>();
  for (const row of [...recent, ...selected]) {
    suppliers.set(row.supplier.id, {
      id: row.supplier.id,
      label: row.supplier.tradingName ?? row.supplier.legalName
    });
    purchaseOrders.set(row.purchaseOrder.id, {
      id: row.purchaseOrder.id,
      label: row.purchaseOrder.publicReference
    });
    if (row.receivedBy) {
      receivers.set(row.receivedBy.id, {
        id: row.receivedBy.id,
        label: `${row.receivedBy.displayName}${row.receivedBy.status !== "ACTIVE" ? " (inactive)" : ""}`
      });
    }
  }
  return {
    suppliers: [...suppliers.values()],
    purchaseOrders: [...purchaseOrders.values()],
    receivers: [...receivers.values()],
    hasMore: recent.length >= 100
  };
}

export async function listGoodsReceiptPage(
  session: SessionContext,
  input: ReceivingRegisterFilters & { page?: number; pageSize?: number } = {}
) {
  await requireReceivingRead(session);
  const tab = input.tab ?? "all";
  const rawPageSize = Number(input.pageSize ?? 10);
  const rawPage = Number(input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 10));
  const requestedPage = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);
  const query = input.query?.trim() || undefined;
  if (query && query.length > 120) {
    throw new Error("RECEIVING_SEARCH_QUERY_TOO_LONG");
  }
  const status = input.status ? (receivingRegisterStatuses.includes(input.status as ReceivingRegisterStatus) ? input.status : null) : null;
  if (input.status && !status) throw new Error("RECEIVING_STATUS_FILTER_INVALID");
  const receivedFrom = input.receivedFrom ? parseReceivingDate(input.receivedFrom) : null;
  const receivedTo = input.receivedTo ? parseReceivingDate(input.receivedTo, true) : null;
  if ((input.receivedFrom && !receivedFrom) || (input.receivedTo && !receivedTo)) throw new Error("RECEIVING_DATE_FILTER_INVALID");
  if (receivedFrom && receivedTo && receivedFrom >= receivedTo) throw new Error("RECEIVING_DATE_FILTER_RANGE_INVALID");
  const supplierId = parseReceivingFilterId(input.supplierId, "RECEIVING_SUPPLIER_FILTER_INVALID");
  const purchaseOrderId = parseReceivingFilterId(input.purchaseOrderId, "RECEIVING_PURCHASE_ORDER_FILTER_INVALID");
  const receivedByUserId = parseReceivingFilterId(input.receivedByUserId, "RECEIVING_RECEIVER_FILTER_INVALID");
  const sharedFilters = buildReceivingRegisterSharedWhere(session, {
    query,
    receivedFrom,
    receivedTo,
    supplierId,
    purchaseOrderId,
    receivedByUserId
  });
  const where: Prisma.GoodsReceiptWhereInput = {
    ...sharedFilters,
    ...(tab === "discrepancies" ? { discrepancyFlag: true } : {}),
    ...((tab === "draft" || tab === "posted" || status)
      ? { AND: [
          ...(tab === "draft" ? [{ status: "DRAFT" }] : []),
          ...(tab === "posted" ? [{ status: { not: "DRAFT" } }] : []),
          ...(status ? [{ status }] : [])
        ] }
      : {}),
  };
  const totalItems = await prisma.goodsReceipt.count({ where });
  const baseWhere: Prisma.GoodsReceiptWhereInput = {
    ...sharedFilters,
    ...(status ? { status } : {}),
  };
  const [allItems, draftItems, postedItems, discrepancyItems] = await Promise.all([
    prisma.goodsReceipt.count({ where: baseWhere }),
    prisma.goodsReceipt.count({ where: { ...baseWhere, status: "DRAFT" } }),
    prisma.goodsReceipt.count({ where: { ...baseWhere, status: { not: "DRAFT" } } }),
    prisma.goodsReceipt.count({ where: { ...baseWhere, discrepancyFlag: true } })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const receipts = await prisma.goodsReceipt.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      _count: { select: { lines: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });
  return {
    items: receipts.map(mapGoodsReceipt),
    totalItems,
    page,
    pageSize,
    totalPages,
    tabCounts: { all: allItems, draft: draftItems, posted: postedItems, discrepancies: discrepancyItems }
  };
}

export async function buildReceivingReportExportRows(
  session: SessionContext,
  profile?: ReceivingDashboardProfile,
  query?: string,
  tab: ReceivingRegisterTab = "all",
  filters: { status?: string; receivedFrom?: string; receivedTo?: string; supplierId?: string; purchaseOrderId?: string; receivedByUserId?: string } = {}
) {
  await requireReceivingRead(session);

  if (filters.status && !receivingRegisterStatuses.includes(filters.status as ReceivingRegisterStatus)) throw new Error("RECEIVING_STATUS_FILTER_INVALID");
  const supplierId = parseReceivingFilterId(filters.supplierId, "RECEIVING_SUPPLIER_FILTER_INVALID");
  const purchaseOrderId = parseReceivingFilterId(filters.purchaseOrderId, "RECEIVING_PURCHASE_ORDER_FILTER_INVALID");
  const receivedByUserId = parseReceivingFilterId(filters.receivedByUserId, "RECEIVING_RECEIVER_FILTER_INVALID");
  const exportFrom = filters.receivedFrom ? parseReceivingDate(filters.receivedFrom) : null;
  const exportTo = filters.receivedTo ? parseReceivingDate(filters.receivedTo, true) : null;
  if ((filters.receivedFrom && !exportFrom) || (filters.receivedTo && !exportTo)) throw new Error("RECEIVING_DATE_FILTER_INVALID");
  if (exportFrom && exportTo && exportFrom >= exportTo) throw new Error("RECEIVING_DATE_FILTER_RANGE_INVALID");

  if (profile) {
    const receipts = await prisma.goodsReceipt.findMany({
      where: receivingDashboardProfileFilteredWhere(session, profile, query).where,
      select: {
        id: true,
        publicReference: true,
        status: true,
        discrepancyFlag: true,
        receivedAt: true,
        createdAt: true,
        purchaseOrder: { select: { publicReference: true } },
        supplier: { select: { legalName: true, tradingName: true } },
        receivingLocation: { select: { name: true } }
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }]
    });

    return [
      [
        "Reference",
        "Status",
        "Follow-up Reason",
        "Supplier",
        "Purchase Order",
        "Receiving Location",
        "Received At",
        "Created At"
      ],
      ...receipts.map((receipt) => [
        receipt.publicReference,
        receipt.status,
        receivingFollowUpInclusionReason(receipt),
        receipt.supplier.tradingName ?? receipt.supplier.legalName,
        receipt.purchaseOrder.publicReference,
        receipt.receivingLocation.name,
        receipt.receivedAt.toISOString(),
        receipt.createdAt.toISOString()
      ])
    ] satisfies CsvRow[];
  }

  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      ...buildReceivingRegisterSharedWhere(session, {
        query: query?.trim() || undefined,
        receivedFrom: exportFrom,
        receivedTo: exportTo,
        supplierId,
        purchaseOrderId,
        receivedByUserId
      }),
      ...((tab === "draft" || tab === "posted" || filters.status) ? { AND: [
        ...(tab === "draft" ? [{ status: "DRAFT" }] : []),
        ...(tab === "posted" ? [{ status: { not: "DRAFT" } }] : []),
        ...(filters.status ? [{ status: filters.status }] : [])
      ] } : {}),
      ...(tab === "discrepancies" ? { discrepancyFlag: true } : {}),
    } as Prisma.GoodsReceiptWhereInput,
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryDestinationLocation: true,
          item: true,
          uom: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const rows: CsvRow[] = [
    [
      "Reference",
      "Status",
      "Purchase Order",
      "PO Status",
      "PO Expected Delivery",
      "Supplier",
      "Receiving Location",
      "Received By",
      "Received At",
      "Posted At",
      "Reversed By",
      "Reversed At",
      "Line",
      "Item Code",
      "Item Name",
      "Destination",
      "UOM",
      "Ordered Qty",
      "Delivered Qty",
      "Accepted Qty",
      "Rejected Qty",
      "Damaged Qty",
      "Short Qty",
      "Condition",
      "Discrepancy Type",
      "Discrepancy Reason",
      "Evidence Reference",
      "Lot",
      "Expiry",
      "Posted Movement"
    ]
  ];

  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      rows.push([
        receipt.publicReference,
        receipt.status,
        receipt.purchaseOrder.publicReference,
        receipt.purchaseOrder.status,
        receipt.purchaseOrder.expectedDeliveryDate.toISOString().slice(0, 10),
        receipt.supplier.tradingName ?? receipt.supplier.legalName,
        receipt.receivingLocation.name,
        receipt.receivedBy.displayName,
        receipt.receivedAt.toISOString(),
        receipt.postedAt?.toISOString() ?? "",
        receipt.reversedBy?.displayName ?? "",
        receipt.reversedAt?.toISOString() ?? "",
        line.lineNumber,
        line.item.itemCode,
        line.item.itemName,
        line.inventoryDestinationLocation.name,
        line.uom.uomCode,
        Number(line.orderedQty),
        Number(line.deliveredQty),
        Number(line.acceptedQty),
        Number(line.rejectedQty),
        Number(line.damagedQty),
        Number(line.shortQty),
        line.conditionStatus,
        line.discrepancyType ?? "",
        line.discrepancyReason ?? "",
        line.evidenceReference ?? "",
        line.lotNumber ?? "",
        line.expiryDate?.toISOString().slice(0, 10) ?? "",
        line.postedMovementId ?? ""
      ]);
    }
  }

  return rows;
}

export async function listReceivablePurchaseOrders(session: SessionContext) {
  await requirePermission(session, permissions.receivingCreate);

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      deliveryLocationId: session.context.locationId,
      status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }
    },
    include: {
      supplier: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    },
    orderBy: { expectedDeliveryDate: "asc" }
  });

  const today = new Date().toISOString().slice(0, 10);

  return orders.map((order) => {
    const expectedDeliveryDate = order.expectedDeliveryDate.toISOString().slice(0, 10);
    const deliveryAging = classifyPurchaseOrderDeliveryAging({
      status: order.status,
      expectedDeliveryDate,
      today
    });

    return {
      id: order.id,
      publicReference: order.publicReference,
      supplierName: order.supplier.tradingName ?? order.supplier.legalName,
      expectedDeliveryDate,
      deliveryAgingStatus: deliveryAging.deliveryAgingStatus,
      daysOverdue: deliveryAging.daysOverdue,
      status: order.status,
      lines: order.lines
        .filter(
          (line) =>
            line.itemId &&
            line.item &&
            Number(line.orderedQty) -
              Number(line.receivedQty) -
              Number(line.cancelledQty) >
              0
        )
        .map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          description: line.description,
          outstandingQty:
            Number(line.orderedQty) -
            Number(line.receivedQty) -
            Number(line.cancelledQty),
          uomCode: line.uom.uomCode,
          requiresLot: line.item?.trackLot ?? false,
          requiresExpiry: line.item?.trackExpiry ?? false
        })),
      openLineCount: order.lines.filter(
        (line) =>
          Number(line.orderedQty) -
            Number(line.receivedQty) -
            Number(line.cancelledQty) >
          0
      ).length
    };
  });
}

export async function getGoodsReceipt(session: SessionContext, id: string) {
  await requireReceivingRead(session);

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: true,
      supplier: true,
      receivingLocation: true,
      receivedBy: true,
      reversedBy: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          inventoryDestinationLocation: true,
          item: true,
          uom: true,
          postedMovement: {
            include: {
              reversalMovements: true
            }
          }
        }
      }
    }
  });

  if (!receipt) {
    return null;
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      entityType: "GoodsReceipt",
      entityId: receipt.id
    },
    orderBy: { occurredAt: "asc" }
  });
  const auditActorUserIds = auditEvents
    .map((event) => event.actorUserId)
    .filter((id): id is string => Boolean(id));
  const auditActors =
    auditActorUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(new Set(auditActorUserIds)) } },
          select: { id: true, displayName: true }
        })
      : [];
  const auditActorNames = new Map(
    auditActors.map((actor) => [actor.id, actor.displayName])
  );

  const purchaseOrderExpectedDeliveryDate = receipt.purchaseOrder.expectedDeliveryDate
    .toISOString()
    .slice(0, 10);
  const deliveryAging = classifyPurchaseOrderDeliveryAging({
    status: receipt.purchaseOrder.status,
    expectedDeliveryDate: purchaseOrderExpectedDeliveryDate,
    today: new Date().toISOString().slice(0, 10)
  });

  return {
    id: receipt.id,
    publicReference: receipt.publicReference,
    status: receipt.status,
    purchaseOrderId: receipt.purchaseOrderId,
    purchaseOrderReference: receipt.purchaseOrder.publicReference,
    purchaseOrderStatus: receipt.purchaseOrder.status,
    purchaseOrderExpectedDeliveryDate,
    purchaseOrderDeliveryAgingStatus: deliveryAging.deliveryAgingStatus,
    purchaseOrderDaysOverdue: deliveryAging.daysOverdue,
    supplierName: receipt.supplier.tradingName ?? receipt.supplier.legalName,
    receivingLocationName: receipt.receivingLocation.name,
    receivedByName: receipt.receivedBy.displayName,
    receivedAt: receipt.receivedAt.toISOString(),
    postedAt: receipt.postedAt?.toISOString() ?? null,
    reversedAt: receipt.reversedAt?.toISOString() ?? null,
    reversedByName: receipt.reversedBy?.displayName ?? null,
    reversalReason: receipt.reversalReason ?? null,
    supplierDeliveryReceiptNumber:
      receipt.supplierDeliveryReceiptNumber ?? null,
    discrepancyFlag: receipt.discrepancyFlag,
    discrepancySummary: receipt.discrepancySummary ?? null,
    notes: receipt.notes ?? null,
    lines: receipt.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      itemCode: line.item.itemCode,
      itemName: line.item.itemName,
      destinationName: line.inventoryDestinationLocation.name,
      orderedQty: Number(line.orderedQty),
      deliveredQty: Number(line.deliveredQty),
      acceptedQty: Number(line.acceptedQty),
      rejectedQty: Number(line.rejectedQty),
      damagedQty: Number(line.damagedQty),
      shortQty: Number(line.shortQty),
      uomCode: line.uom.uomCode,
      unitCost: line.unitCost ? Number(line.unitCost) : null,
      conditionStatus: line.conditionStatus,
      discrepancyType: line.discrepancyType ?? null,
      discrepancyReason: line.discrepancyReason ?? null,
      evidenceReference: line.evidenceReference ?? null,
      lotNumber: line.lotNumber ?? null,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      postedMovementId: line.postedMovementId ?? null,
      reversalMovementCount: line.postedMovement?.reversalMovements.length ?? 0,
      notes: line.notes ?? null
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorName: event.actorUserId
        ? auditActorNames.get(event.actorUserId) ?? "Recorded user"
        : null,
      occurredAt: event.occurredAt.toISOString(),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : undefined
    }))
  };
}

export async function createGoodsReceiptFromPurchaseOrder(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingCreate);
  const values = createReceiptSchema.parse(Object.fromEntries(formData));
  const requestHash = goodsReceiptCreateRequestHash({
    formData,
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    receivingLocationId: session.context.locationId,
    actorUserId: session.user.id
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockScopedPurchaseOrder(tx, session, values.purchaseOrderId);
        await lockScopedPurchaseOrderLines(tx, session, values.purchaseOrderId);
        await assertFreshReceivingAuthority(
          tx,
          session,
          permissions.receivingCreate,
          false
        );

        const order = await tx.purchaseOrder.findFirst({
          where: {
            id: values.purchaseOrderId,
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            deliveryLocationId: session.context.locationId
          },
          include: {
            supplier: true,
            deliveryLocation: true,
            lines: {
              orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
              include: {
                item: true,
                uom: true
              }
            }
          }
        });
        if (!order) {
          throw new Error("PURCHASE_ORDER_NOT_FOUND");
        }
        assertAuthorizedLocation(session, order.deliveryLocationId);

        const existing = await findGoodsReceiptByIdempotencyKey(
          tx,
          session,
          values.idempotencyKey
        );
        if (existing) {
          if (
            existing.idempotencyRequestHash !== requestHash ||
            existing.purchaseOrderId !== order.id ||
            existing.receivingLocationId !== order.deliveryLocationId ||
            existing.receivedByUserId !== session.user.id
          ) {
            throw new Error("GOODS_RECEIPT_IDEMPOTENCY_CONFLICT");
          }
          return existing.id;
        }

        assertPurchaseOrderCanBeReceived(order.status);

        const inventoryLocation = await tx.inventoryLocation.findFirst({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            locationId: session.context.locationId,
            status: "ACTIVE"
          },
          orderBy: { createdAt: "asc" }
        });
        if (!inventoryLocation) {
          throw new Error("INVENTORY_LOCATION_NOT_FOUND");
        }

        const lines = order.lines.flatMap((line) => {
          if (!line.itemId || !line.item || !line.item.trackInventory) {
            return [];
          }
          const outstandingQty =
            Number(line.orderedQty) -
            Number(line.receivedQty) -
            Number(line.cancelledQty);
          if (outstandingQty <= 0) {
            return [];
          }

          const deliveredQty = Number(
            getLineValue(formData, line.id, "deliveredQty") ?? 0
          );
          const acceptedQty = Number(
            getLineValue(formData, line.id, "acceptedQty") ?? 0
          );
          const rejectedQty = Number(
            getLineValue(formData, line.id, "rejectedQty") ?? 0
          );
          const damagedQty = Number(
            getLineValue(formData, line.id, "damagedQty") ?? 0
          );
          const shortQty = Math.max(outstandingQty - deliveredQty, 0);
          const discrepancyReason = String(
            getLineValue(formData, line.id, "discrepancyReason") ?? ""
          ).trim();
          const evidenceReference = String(
            getLineValue(formData, line.id, "evidenceReference") ?? ""
          ).trim();
          validateReceivingQuantities({
            deliveredQty,
            acceptedQty,
            rejectedQty,
            damagedQty,
            shortQty,
            outstandingQty,
            discrepancyReason,
            evidenceReference
          });

          if (
            deliveredQty === 0 &&
            acceptedQty === 0 &&
            rejectedQty === 0 &&
            damagedQty === 0
          ) {
            return [];
          }

          return [
            {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              purchaseOrderLineId: line.id,
              inventoryDestinationLocationId: inventoryLocation.id,
              itemId: line.itemId,
              uomId: line.uomId,
              lineNumber: line.lineNumber,
              description: line.description,
              orderedQty: Number(line.orderedQty),
              deliveredQty,
              acceptedQty,
              rejectedQty,
              damagedQty,
              shortQty,
              unitCost: Number(line.unitPrice),
              conditionStatus:
                rejectedQty > 0 || damagedQty > 0 || shortQty > 0
                  ? "WITH_DISCREPANCY"
                  : "ACCEPTED",
              discrepancyType:
                rejectedQty > 0 || damagedQty > 0 || shortQty > 0
                  ? "QUANTITY_OR_CONDITION"
                  : null,
              discrepancyReason: discrepancyReason || null,
              evidenceReference: evidenceReference || null,
              lotNumber:
                String(getLineValue(formData, line.id, "lotNumber") ?? "").trim() ||
                null,
              expiryDate: getLineValue(formData, line.id, "expiryDate")
                ? new Date(String(getLineValue(formData, line.id, "expiryDate")))
                : null,
              notes:
                String(getLineValue(formData, line.id, "notes") ?? "").trim() ||
                null
            }
          ];
        });
        if (lines.length === 0) {
          throw new Error("GOODS_RECEIPT_LINE_REQUIRED");
        }

        const discrepancyFlag = lines.some(
          (line) =>
            line.rejectedQty > 0 || line.damagedQty > 0 || line.shortQty > 0
        );
        const receipt = await tx.goodsReceipt.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            publicReference: await nextGoodsReceiptReference(
              tx,
              session.context.tenantId,
              session.context.companyId
            ),
            purchaseOrderId: order.id,
            supplierId: order.supplierId,
            receivingLocationId: order.deliveryLocationId,
            receivedByUserId: session.user.id,
            receivedAt: new Date(),
            supplierDeliveryReceiptNumber:
              values.supplierDeliveryReceiptNumber || null,
            discrepancyFlag,
            discrepancySummary: discrepancyFlag
              ? "One or more lines include rejected, damaged, or short quantities."
              : null,
            notes: values.notes || null,
            lines: {
              create: lines
            }
          }
        });

        await tx.$executeRaw`
          UPDATE "GoodsReceipt"
             SET "idempotencyKey" = ${values.idempotencyKey},
                 "idempotencyRequestHash" = ${requestHash}
           WHERE id = ${receipt.id}::uuid
        `;

        await tx.auditEvent.create({
          data: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            actorUserId: session.user.id,
            eventType: "goods_receipt.created",
            entityType: "GoodsReceipt",
            entityId: receipt.id,
            afterData: { status: "DRAFT" },
            metadata: {
              purchaseOrderId: order.id,
              lineCount: lines.length,
              discrepancyFlag
            }
          }
        });

        return receipt.id;
      });
    } catch (error) {
      if (!isGoodsReceiptReferenceUniqueConstraintError(error)) {
        if (!isGoodsReceiptIdempotencyUniqueConstraintError(error)) {
          throw error;
        }
        const existing = await findGoodsReceiptByIdempotencyKey(
          prisma,
          session,
          values.idempotencyKey
        );
        if (
          existing &&
          existing.idempotencyRequestHash === requestHash &&
          existing.purchaseOrderId === values.purchaseOrderId &&
          existing.receivingLocationId === session.context.locationId &&
          existing.receivedByUserId === session.user.id
        ) {
          return existing.id;
        }
        throw new Error("GOODS_RECEIPT_IDEMPOTENCY_CONFLICT");
      }
      if (attempt === 5) {
        throw new Error("GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED");
      }
    }
  }
  throw new Error("GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED");
}

export async function postGoodsReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingPost);
  const values = postReceiptSchema.parse(Object.fromEntries(formData));

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      purchaseOrder: {
        include: {
          lines: true
        }
      },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      }
    }
  });

  if (!receipt) {
    throw new Error("GOODS_RECEIPT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);
  assertGoodsReceiptCanBePosted(receipt.status);
  await assertPrivilegedMfaForAction(session, {
    action: "goods_receipt.post",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.receivingPost,
    entityType: "GoodsReceipt",
    entityId: receipt.id,
    reason:
      "Posting receiving creates inventory ledger movements and requires privileged MFA evidence.",
    metadata: {
      purchaseOrderId: receipt.purchaseOrderId,
      receivingLocationId: receipt.receivingLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const postingInventoryLocationIds = receipt.lines
      .filter((line) => Number(line.acceptedQty) > 0)
      .map((line) => line.inventoryDestinationLocationId);
    const inventoryLocationLock =
      postingInventoryLocationIds.length > 0
        ? await lockInventoryLocationsForPosting(
            tx,
            session,
            postingInventoryLocationIds
          )
        : null;
    await lockScopedPurchaseOrder(tx, session, receipt.purchaseOrderId);
    await lockScopedPurchaseOrderLines(tx, session, receipt.purchaseOrderId);

    const lockedReceipts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT gr.id
        FROM "GoodsReceipt" gr
       WHERE gr.id = ${receipt.id}::uuid
         AND gr."tenantId" = ${session.context.tenantId}::uuid
         AND gr."companyId" = ${session.context.companyId}::uuid
         AND gr."purchaseOrderId" = ${receipt.purchaseOrderId}::uuid
         AND gr."receivingLocationId" = ${session.context.locationId}::uuid
       FOR UPDATE OF gr
    `;
    if (!lockedReceipts[0]) {
      throw new Error("GOODS_RECEIPT_NOT_FOUND");
    }
    await assertFreshReceivingAuthority(
      tx,
      session,
      permissions.receivingPost,
      true
    );

    const currentReceipt = await tx.goodsReceipt.findFirst({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: receipt.purchaseOrderId,
        receivingLocationId: session.context.locationId
      },
      include: {
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
          include: {
            item: true,
            uom: true
          }
        }
      }
    });
    if (!currentReceipt) {
      throw new Error("GOODS_RECEIPT_NOT_FOUND");
    }
    assertGoodsReceiptCanBePosted(currentReceipt.status);

    const receivablePurchaseOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: receipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId
      },
      include: {
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }]
        }
      }
    });
    if (
      !receivablePurchaseOrder ||
      !["ISSUED", "PARTIALLY_RECEIVED"].includes(
        receivablePurchaseOrder.status
      )
    ) {
      throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
    }

    const purchaseOrderLines = new Map(
      receivablePurchaseOrder.lines.map((line) => [line.id, line])
    );
    for (const line of currentReceipt.lines) {
      const purchaseOrderLine = purchaseOrderLines.get(
        line.purchaseOrderLineId
      );
      if (!purchaseOrderLine) {
        throw new Error("GOODS_RECEIPT_PURCHASE_ORDER_LINE_MISMATCH");
      }
      const outstandingQty =
        Number(purchaseOrderLine.orderedQty) -
        Number(purchaseOrderLine.receivedQty) -
        Number(purchaseOrderLine.cancelledQty);
      const shortQty = Math.max(outstandingQty - Number(line.deliveredQty), 0);
      const hasDiscrepancy =
        Number(line.rejectedQty) > 0 ||
        Number(line.damagedQty) > 0 ||
        shortQty > 0;
      if (
        Number(line.orderedQty) !== Number(purchaseOrderLine.orderedQty) ||
        Number(line.shortQty) !== shortQty ||
        line.conditionStatus !==
          (hasDiscrepancy ? "WITH_DISCREPANCY" : "ACCEPTED") ||
        line.discrepancyType !==
          (hasDiscrepancy ? "QUANTITY_OR_CONDITION" : null)
      ) {
        throw new Error("GOODS_RECEIPT_DISCREPANCY_CONFLICT");
      }
      validateReceivingQuantities({
        deliveredQty: Number(line.deliveredQty),
        acceptedQty: Number(line.acceptedQty),
        rejectedQty: Number(line.rejectedQty),
        damagedQty: Number(line.damagedQty),
        shortQty,
        outstandingQty,
        discrepancyReason: line.discrepancyReason,
        evidenceReference: line.evidenceReference
      });
    }
    const liveDiscrepancyFlag = currentReceipt.lines.some(
      (line) =>
        Number(line.rejectedQty) > 0 ||
        Number(line.damagedQty) > 0 ||
        Number(line.shortQty) > 0
    );
    if (
      currentReceipt.discrepancyFlag !== liveDiscrepancyFlag ||
      Boolean(currentReceipt.discrepancySummary) !== liveDiscrepancyFlag
    ) {
      throw new Error("GOODS_RECEIPT_DISCREPANCY_CONFLICT");
    }

    const claimedReceipt = await tx.goodsReceipt.updateMany({
      where: {
        id: currentReceipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: receivablePurchaseOrder.id,
        receivingLocationId: session.context.locationId,
        status: "DRAFT"
      },
      data: {
        status: "POSTING"
      }
    });
    if (claimedReceipt.count !== 1) {
      throw new Error("GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING");
    }

    for (const line of currentReceipt.lines) {
      if (Number(line.acceptedQty) <= 0) {
        continue;
      }
      const quantityDeltaBaseUom = await getBaseQuantity(tx, {
        itemId: line.itemId,
        uomId: line.uomId,
        acceptedQty: line.acceptedQty,
        item: line.item
      });
      const { movement, duplicate } = await postInventoryMovementInTransaction(
        tx,
        session,
        inventoryLocationLock!,
        {
          inventoryLocationId: line.inventoryDestinationLocationId,
          itemId: line.itemId,
          movementType: "RECEIPT_IN",
          occurredAt: currentReceipt.receivedAt,
          enteredQuantity: Number(line.acceptedQty),
          enteredUomId: line.uomId,
          quantityDeltaBaseUom,
          sourceDocumentType: "GoodsReceipt",
          sourceDocumentId: currentReceipt.id,
          sourceDocumentLineId: line.id,
          sourceEventKey: `posted:${line.id}`,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          unitCost: line.unitCost ? Number(line.unitCost) : null,
          totalCost: line.unitCost
            ? Number(line.unitCost) * Number(line.acceptedQty)
            : null,
          reasonCode: "SUPPLIER_RECEIPT",
          notes: line.notes
        }
      );

      await tx.goodsReceiptLine.update({
        where: { id: line.id },
        data: {
          postedMovementId: movement.id
        }
      });
      if (duplicate) {
        continue;
      }
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: {
          receivedQty: {
            increment: line.acceptedQty
          }
        }
      });
    }

    const refreshedPoLines = await tx.purchaseOrderLine.findMany({
      where: {
        purchaseOrderId: receivablePurchaseOrder.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      orderBy: [{ lineNumber: "asc" }, { id: "asc" }]
    });
    const fullyReceived = refreshedPoLines.every(
      (line) =>
        Number(line.receivedQty) + Number(line.cancelledQty) >= Number(line.orderedQty)
    );

    await tx.goodsReceipt.update({
      where: { id: currentReceipt.id },
      data: {
        status: currentReceipt.discrepancyFlag
          ? "POSTED_WITH_DISCREPANCY"
          : "POSTED",
        postedAt: new Date()
      }
    });
    const updatedPurchaseOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: receivablePurchaseOrder.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] }
      },
      data: {
        status: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"
      }
    });
    if (updatedPurchaseOrder.count !== 1) {
      throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
    }
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "goods_receipt.posted",
        entityType: "GoodsReceipt",
        entityId: currentReceipt.id,
        beforeData: { status: "DRAFT" },
        afterData: {
          status: currentReceipt.discrepancyFlag
            ? "POSTED_WITH_DISCREPANCY"
            : "POSTED",
          purchaseOrderStatus: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"
        },
        metadata: {
          purchaseOrderId: receivablePurchaseOrder.id,
          lineCount: currentReceipt.lines.length,
          discrepancyFlag: currentReceipt.discrepancyFlag
        }
      }
    });
  });

  return receipt.purchaseOrderId;
}

export async function reverseGoodsReceipt(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.receivingReverse);
  const values = reverseReceiptSchema.parse(Object.fromEntries(formData));

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id: values.id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      receivingLocationId: session.context.locationId
    },
    include: {
      lines: {
        select: {
          acceptedQty: true,
          inventoryDestinationLocationId: true
        }
      }
    }
  });

  if (!receipt) {
    throw new Error("GOODS_RECEIPT_NOT_FOUND");
  }
  assertAuthorizedLocation(session, receipt.receivingLocationId);
  assertGoodsReceiptCanBeReversed(receipt.status, receipt.reversedAt);
  if (receipt.receivedByUserId === session.user.id) {
    throw new Error("GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
  }
  await assertPrivilegedMfaForAction(session, {
    action: "goods_receipt.reverse",
    enforcementScope: "all_sensitive",
    permissionCode: permissions.receivingReverse,
    entityType: "GoodsReceipt",
    entityId: receipt.id,
    reason:
      "Receiving reversal creates counter-movements and requires privileged MFA evidence.",
    metadata: {
      purchaseOrderId: receipt.purchaseOrderId,
      receivingLocationId: receipt.receivingLocationId
    }
  });

  await prisma.$transaction(async (tx) => {
    const reversalInventoryLocationIds = receipt.lines
      .filter((line) => Number(line.acceptedQty) > 0)
      .map((line) => line.inventoryDestinationLocationId);
    const inventoryLocationLock =
      reversalInventoryLocationIds.length > 0
        ? await lockInventoryLocationsForPosting(
            tx,
            session,
            reversalInventoryLocationIds
          )
        : null;
    await lockScopedPurchaseOrder(tx, session, receipt.purchaseOrderId);
    await lockScopedPurchaseOrderLines(tx, session, receipt.purchaseOrderId);
    const lockedReceipts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT gr.id
        FROM "GoodsReceipt" gr
       WHERE gr.id = ${receipt.id}::uuid
         AND gr."tenantId" = ${session.context.tenantId}::uuid
         AND gr."companyId" = ${session.context.companyId}::uuid
         AND gr."purchaseOrderId" = ${receipt.purchaseOrderId}::uuid
         AND gr."receivingLocationId" = ${session.context.locationId}::uuid
       FOR UPDATE OF gr
    `;
    if (!lockedReceipts[0]) {
      throw new Error("GOODS_RECEIPT_NOT_FOUND");
    }
    await assertFreshReceivingAuthority(
      tx,
      session,
      permissions.receivingReverse,
      true
    );

    const currentReceipt = await tx.goodsReceipt.findFirst({
      where: {
        id: receipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: receipt.purchaseOrderId,
        receivingLocationId: session.context.locationId
      },
      include: {
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
          include: {
            item: true,
            uom: true,
            postedMovement: {
              include: {
                reversalMovements: true
              }
            }
          }
        }
      }
    });
    if (!currentReceipt) {
      throw new Error("GOODS_RECEIPT_NOT_FOUND");
    }
    assertGoodsReceiptCanBeReversed(
      currentReceipt.status,
      currentReceipt.reversedAt
    );
    if (currentReceipt.receivedByUserId === session.user.id) {
      throw new Error("GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
    }

    const currentPurchaseOrder = await tx.purchaseOrder.findFirst({
      where: {
        id: currentReceipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId
      },
      include: {
        balanceClosures: {
          where: { status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
          select: { id: true, status: true }
        }
      }
    });
    if (
      !currentPurchaseOrder ||
      ["CLOSED", "CANCELLED"].includes(currentPurchaseOrder.status)
    ) {
      throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSED");
    }
    if (currentPurchaseOrder.balanceClosures.length > 0) {
      throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSURE_ACTIVE");
    }

    const claimedReceipt = await tx.goodsReceipt.updateMany({
      where: {
        id: currentReceipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        purchaseOrderId: currentPurchaseOrder.id,
        receivingLocationId: session.context.locationId,
        status: { in: ["POSTED", "POSTED_WITH_DISCREPANCY"] },
        reversedAt: null
      },
      data: {
        status: "REVERSING"
      }
    });
    if (claimedReceipt.count !== 1) {
      throw new Error("GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL");
    }

    const otherOpenReceiptCount = await tx.goodsReceipt.count({
      where: {
        purchaseOrderId: currentReceipt.purchaseOrderId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        receivingLocationId: session.context.locationId,
        id: { not: currentReceipt.id },
        status: { in: ["DRAFT", "POSTING", "REVERSING"] }
      }
    });
    if (otherOpenReceiptCount > 0) {
      throw new Error("GOODS_RECEIPT_REVERSAL_OPEN_RECEIPT_EXISTS");
    }

    const originalMovementIds: string[] = [];
    const reversalMovementIds: string[] = [];

    for (const line of currentReceipt.lines) {
      if (Number(line.acceptedQty) <= 0) {
        continue;
      }
      const original = line.postedMovement;
      if (!original) {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED");
      }
      if (original.movementType !== "RECEIPT_IN") {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID");
      }
      if (
        original.tenantId !== session.context.tenantId ||
        original.companyId !== session.context.companyId ||
        original.inventoryLocationId !== line.inventoryDestinationLocationId ||
        original.itemId !== line.itemId ||
        original.sourceDocumentType !== "GoodsReceipt" ||
        original.sourceDocumentId !== currentReceipt.id ||
        original.sourceDocumentLineId !== line.id
      ) {
        throw new Error("GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH");
      }
      if (original.reversalMovements.length > 0) {
        throw new Error("GOODS_RECEIPT_ALREADY_REVERSED");
      }

      const quantityDeltaBaseUom = -Math.abs(Number(original.quantityDeltaBaseUom));
      const { movement } = await postInventoryMovementInTransaction(
        tx,
        session,
        inventoryLocationLock!,
        {
          inventoryLocationId: line.inventoryDestinationLocationId,
          itemId: line.itemId,
          movementType: "REVERSAL",
          occurredAt: new Date(),
          enteredQuantity: Number(line.acceptedQty),
          enteredUomId: line.uomId,
          quantityDeltaBaseUom,
          sourceDocumentType: "GoodsReceipt",
          sourceDocumentId: currentReceipt.id,
          sourceDocumentLineId: line.id,
          sourceEventKey: `reversed:${line.id}`,
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          unitCost: line.unitCost ? Number(line.unitCost) : null,
          totalCost: line.unitCost
            ? -Math.abs(Number(line.unitCost) * Number(line.acceptedQty))
            : null,
          reasonCode: "GOODS_RECEIPT_REVERSAL",
          notes: values.reversalReason,
          reversalOfMovementId: original.id
        }
      );

      const restoredPoLine = await tx.purchaseOrderLine.updateMany({
        where: {
          id: line.purchaseOrderLineId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          receivedQty: {
            gte: line.acceptedQty
          }
        },
        data: {
          receivedQty: {
            decrement: line.acceptedQty
          }
        }
      });
      if (restoredPoLine.count !== 1) {
        throw new Error("GOODS_RECEIPT_REVERSAL_PO_RECEIVED_QTY_INVALID");
      }

      originalMovementIds.push(original.id);
      reversalMovementIds.push(movement.id);
    }

    const refreshedPoLines = await tx.purchaseOrderLine.findMany({
      where: {
        purchaseOrderId: currentPurchaseOrder.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      orderBy: [{ lineNumber: "asc" }, { id: "asc" }]
    });
    const nextPurchaseOrderStatus =
      calculatePurchaseOrderReceivingStatus(refreshedPoLines);

    const updatedPurchaseOrder = await tx.purchaseOrder.updateMany({
      where: {
        id: currentPurchaseOrder.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        deliveryLocationId: session.context.locationId,
        status: currentPurchaseOrder.status
      },
      data: {
        status: nextPurchaseOrderStatus
      }
    });
    if (updatedPurchaseOrder.count !== 1) {
      throw new Error("GOODS_RECEIPT_REVERSAL_PO_CLOSED");
    }

    const reversed = await tx.goodsReceipt.updateMany({
      where: {
        id: currentReceipt.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "REVERSING"
      },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedByUserId: session.user.id,
        reversalReason: values.reversalReason
      }
    });
    if (reversed.count !== 1) {
      throw new Error("GOODS_RECEIPT_REVERSAL_STATE_CONFLICT");
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "goods_receipt.reversed",
        entityType: "GoodsReceipt",
        entityId: currentReceipt.id,
        beforeData: {
          status: currentReceipt.status,
          purchaseOrderStatus: currentPurchaseOrder.status
        },
        afterData: {
          status: "REVERSED",
          purchaseOrderStatus: nextPurchaseOrderStatus
        },
        metadata: {
          purchaseOrderId: currentPurchaseOrder.id,
          reversalReason: values.reversalReason,
          originalMovementIds,
          reversalMovementIds,
          lineCount: currentReceipt.lines.length,
          discrepancyFlag: currentReceipt.discrepancyFlag
        }
      }
    });
  });

  return receipt.purchaseOrderId;
}
