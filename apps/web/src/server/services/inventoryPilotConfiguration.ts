import { createHash } from "node:crypto";
import { prisma, Prisma, type TransactionClient } from "@ogfi/database";
import { z } from "zod";
import { permissions, getGrantedPermissionCodes, requirePermission } from "./authorization";
import { getAuthMode, getMfaStepUpMinutes, isMfaAssuranceFresh } from "./authentication";
import type { SessionContext } from "./context";
import { assertPrivilegedMfaForAction, hasVerifiedPrivilegedMfaEvidence } from "./privilegedMfaGuard";
import { resolvePurchaseRequestApprovalRule } from "./purchaseRequests";

export const inventoryPilotConfigurationCapabilities = [
  "TRANSFER_SOURCE",
  "TRANSFER_DESTINATION",
  "COUNT_LOCATION",
  "OPENING_STOCK_LOCATION",
] as const;

export const inventoryPilotConfigurationResponsibilities = [
  "PREPARER",
  "SUBMITTER",
  "OPERATIONS_REVIEWER",
  "ACCOUNTING_REVIEWER",
  "COMMAND_REQUESTER",
] as const;

export const inventoryPilotConfigurationReadinessFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "InventoryTransfer",
  "StockCountAttemptReview",
  "WastageReport",
  "StockAdjustment",
  "OpeningInventoryCutover",
] as const;

export const inventoryPilotConfigurationStableErrors = {
  notFound: "INVENTORY_PILOT_CONFIGURATION_NOT_FOUND",
  permissionDenied: "INVENTORY_PILOT_CONFIGURATION_PERMISSION_DENIED",
  companyManageRequired: "INVENTORY_PILOT_CONFIGURATION_COMPANY_MANAGE_REQUIRED",
  authorityStale: "INVENTORY_PILOT_CONFIGURATION_AUTHORITY_STALE",
  stateConflict: "INVENTORY_PILOT_CONFIGURATION_STATE_CONFLICT",
  idempotencyConflict: "INVENTORY_PILOT_CONFIGURATION_IDEMPOTENCY_CONFLICT",
  selectionInvalid: "INVENTORY_PILOT_CONFIGURATION_SELECTION_INVALID",
  readinessBlocked: "INVENTORY_PILOT_CONFIGURATION_READINESS_BLOCKED",
  editorCannotSeal: "INVENTORY_PILOT_CONFIGURATION_EDITOR_CANNOT_SEAL",
  mfaRequired: "INVENTORY_PILOT_CONFIGURATION_MFA_REQUIRED",
} as const;

type Capability = (typeof inventoryPilotConfigurationCapabilities)[number];
type Responsibility = (typeof inventoryPilotConfigurationResponsibilities)[number];
type ReadinessFamily = (typeof inventoryPilotConfigurationReadinessFamilies)[number];

export type InventoryPilotConfigurationReadinessBlocker = {
  code: string;
  message: string;
  capability?: Capability;
  responsibility?: Responsibility;
  family?: ReadinessFamily;
};

const uuid = z.string().uuid();
const reason = z.string().trim().min(10).max(1_000);
const idempotencyKey = z.string().trim().min(12).max(160);
const expectedVersion = z.coerce.number().int().positive();
const capabilitySchema = z.enum(inventoryPilotConfigurationCapabilities);
const responsibilitySchema = z.enum(inventoryPilotConfigurationResponsibilities);
const readinessFamilySchema = z.enum(inventoryPilotConfigurationReadinessFamilies);

const updateDraftSchema = z.object({
  draftId: uuid,
  expectedVersion,
  endpoints: z.array(z.object({ capability: capabilitySchema, inventoryLocationId: uuid })).max(400),
  itemIds: z.array(uuid).max(2_000),
  participants: z.array(z.object({ responsibility: responsibilitySchema, userId: uuid, roleAssignmentId: uuid })).max(5),
  routeBindings: z.array(z.object({ family: readinessFamilySchema, approvalRuleId: uuid })).max(8),
  reason,
});
const draftActionSchema = z.object({ draftId: uuid, expectedVersion, reason });
const createDraftSchema = z.object({ reason });
const createSuccessorSchema = z.object({ predecessorRevisionId: uuid, reason });
const evaluateSchema = z.object({ draftId: uuid });
const sealSchema = z.object({ draftId: uuid, expectedVersion, idempotencyKey, reason });
const workspaceSchema = z.object({
  draftId: uuid.optional(),
  revisionId: uuid.optional(),
  queuePage: z.coerce.number().int().positive().default(1),
  queuePageSize: z.coerce.number().int().min(10).max(50).default(20),
  itemPage: z.coerce.number().int().positive().default(1),
  itemPageSize: z.coerce.number().int().min(10).max(50).default(20),
  itemQuery: z.string().trim().max(120).optional(),
  itemStatus: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  itemCategoryId: uuid.optional(),
  endpointPage: z.coerce.number().int().positive().default(1),
  endpointPageSize: z.coerce.number().int().min(10).max(50).default(20),
  endpointQuery: z.string().trim().max(120).optional(),
  userPage: z.coerce.number().int().positive().default(1),
  userPageSize: z.coerce.number().int().min(10).max(50).default(20),
  userQuery: z.string().trim().max(120).optional(),
  userResponsibility: responsibilitySchema.optional(),
  rulePage: z.coerce.number().int().positive().default(1),
  rulePageSize: z.coerce.number().int().min(8).max(50).default(20),
  ruleQuery: z.string().trim().max(120).optional(),
  ruleFamily: readinessFamilySchema.optional(),
  activityPage: z.coerce.number().int().positive().default(1),
  activityPageSize: z.coerce.number().int().min(10).max(50).default(20),
}).default({});

const familyTransactionTypes: Record<ReadinessFamily, string> = {
  PurchaseRequest: "PURCHASE_REQUEST",
  QuotationRecommendation: "QuotationRecommendation",
  PurchaseOrder: "PurchaseOrder",
  InventoryTransfer: "InventoryTransfer",
  StockCountAttemptReview: "StockCountAttemptReview",
  WastageReport: "WastageReport",
  StockAdjustment: "StockAdjustment",
  OpeningInventoryCutover: "OpeningInventoryCutover",
};

const familyRequiredPermissions: Record<ReadinessFamily, readonly string[]> = {
  PurchaseRequest: [permissions.purchaseRequestApprove],
  QuotationRecommendation: [permissions.quoteApprove],
  PurchaseOrder: [permissions.purchaseOrderApprove],
  InventoryTransfer: [permissions.transferApprove],
  StockCountAttemptReview: [permissions.stockCountReview],
  WastageReport: [permissions.wastageApprove],
  StockAdjustment: [permissions.stockAdjustmentApprove],
  OpeningInventoryCutover: [
    permissions.openingInventoryOperationsReview,
    permissions.openingInventoryAccountingReview,
  ],
};

const responsibilityRequiredPermissions: Record<Responsibility, readonly string[]> = {
  PREPARER: [permissions.openingInventoryPrepare],
  SUBMITTER: [permissions.openingInventorySubmit],
  OPERATIONS_REVIEWER: [permissions.openingInventoryOperationsReview],
  ACCOUNTING_REVIEWER: [permissions.openingInventoryAccountingReview],
  COMMAND_REQUESTER: [
    permissions.openingInventoryRequestExecute,
    permissions.openingInventoryRequestActivate,
    permissions.openingInventoryRequestReverse,
  ],
};

function asciiCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

type StableValue = null | boolean | number | string | StableValue[] | { [key: string]: StableValue };

export function canonicalInventoryPilotConfigurationJson(value: StableValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalInventoryPilotConfigurationJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort(asciiCompare).map((key) => `${JSON.stringify(key)}:${canonicalInventoryPilotConfigurationJson(value[key]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inventoryPilotConfigurationDigest(value: StableValue) {
  return createHash("sha256").update(canonicalInventoryPilotConfigurationJson(value)).digest("hex");
}

function hashCanonicalJson(canonicalJson: string) {
  return createHash("sha256").update(canonicalJson).digest("hex");
}

function normalizeReason(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function translateBoundaryError(error: unknown): Error {
  const code = error instanceof Error ? error.message : "";
  if (code === "PERMISSION_DENIED") return new Error(inventoryPilotConfigurationStableErrors.permissionDenied);
  if (code === "PRIVILEGED_MFA_STEP_UP_REQUIRED" || code === "PRIVILEGED_MFA_REQUIRED") {
    return new Error(inventoryPilotConfigurationStableErrors.mfaRequired);
  }
  if (code.startsWith("INVENTORY_PILOT_CONFIGURATION_")) return error as Error;
  console.error("INVENTORY_PILOT_CONFIGURATION_BOUNDARY_FAILED", {
    error: code || "UNKNOWN_ERROR",
  });
  return new Error(inventoryPilotConfigurationStableErrors.stateConflict);
}

async function requireConfigurationPermission(session: SessionContext, permissionCode: string) {
  try {
    await requirePermission(session, permissionCode);
  } catch (error) {
    throw translateBoundaryError(error);
  }
}

async function assertLiveCompanyAuthority(
  tx: TransactionClient,
  session: SessionContext,
  permissionCode: string,
) {
  const now = new Date();
  const actor = await tx.user.findFirst({
    where: { id: session.user.id, tenantId: session.context.tenantId, status: "ACTIVE" },
    select: { id: true, privilegeEpoch: true },
  });
  if (!actor || !session.authentication?.sessionId) {
    throw new Error(inventoryPilotConfigurationStableErrors.authorityStale);
  }
  const authSession = await tx.authSession.findFirst({
    where: {
      id: session.authentication.sessionId,
      tenantId: session.context.tenantId,
      userId: session.user.id,
      status: "ACTIVE",
      privilegeEpochAtIssue: actor.privilegeEpoch,
      idleExpiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    select: { id: true, assuranceLevel: true, mfaAuthenticatedAt: true, absoluteExpiresAt: true },
  });
  if (!authSession) throw new Error(inventoryPilotConfigurationStableErrors.authorityStale);
  const liveRole = await tx.userRoleAssignment.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      role: {
        status: "ACTIVE",
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
        permissions: {
          some: {
            permission: {
              code: permissionCode,
              OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
            },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!liveRole) throw new Error(inventoryPilotConfigurationStableErrors.permissionDenied);
  const companyManage = await tx.userScopeAssignment.findFirst({
    where: {
      userId: session.user.id,
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
      accessLevel: "MANAGE",
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (!companyManage) throw new Error(inventoryPilotConfigurationStableErrors.companyManageRequired);
  return authSession;
}

function exactUnique<T>(rows: readonly T[], keyOf: (row: T) => string, same: (left: T, right: T) => boolean): T[] {
  const normalized = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = normalized.get(key);
    if (existing && !same(existing, row)) throw new Error(inventoryPilotConfigurationStableErrors.selectionInvalid);
    normalized.set(key, row);
  }
  return [...normalized.entries()].sort(([left], [right]) => asciiCompare(left, right)).map(([, row]) => row);
}

function normalizeDraftSelections(input: z.infer<typeof updateDraftSchema>) {
  return {
    endpoints: exactUnique(input.endpoints, (row) => `${row.capability}:${row.inventoryLocationId}`, (a, b) => a.capability === b.capability && a.inventoryLocationId === b.inventoryLocationId),
    itemIds: [...new Set(input.itemIds)].sort(asciiCompare),
    participants: exactUnique(input.participants, (row) => row.responsibility, (a, b) => a.userId === b.userId && a.roleAssignmentId === b.roleAssignmentId),
    routeBindings: exactUnique(input.routeBindings, (row) => row.family, (a, b) => a.approvalRuleId === b.approvalRuleId),
  };
}

function canonicalRuleDefinition(rule: {
  id: string;
  tenantId: string;
  companyId: string | null;
  transactionType: string;
  routeKey: string;
  scopeFilters: Prisma.JsonValue | null;
  priority: number;
  isActive: boolean;
  lineageId: string;
  version: number;
  lifecycleVersion: number;
  definitionSealed: boolean;
  steps: Array<{ id: string; stepOrder: number; approverType: string; roleId: string | null; userId: string | null; required: boolean; escalationHours: number | null }>;
}) {
  return canonicalInventoryPilotConfigurationJson({
    id: rule.id,
    tenantId: rule.tenantId,
    companyId: rule.companyId,
    transactionType: rule.transactionType,
    routeKey: rule.routeKey,
    scopeFilters: (rule.scopeFilters ?? null) as StableValue,
    priority: rule.priority,
    isActive: rule.isActive,
    lineageId: rule.lineageId,
    version: rule.version,
    lifecycleVersion: rule.lifecycleVersion,
    definitionSealed: rule.definitionSealed,
    steps: [...rule.steps].sort((left, right) => left.stepOrder - right.stepOrder || asciiCompare(left.id, right.id)).map((step) => ({
      stepOrder: step.stepOrder,
      approverType: step.approverType,
      roleId: step.roleId,
      userId: step.userId,
      required: step.required,
      escalationHours: step.escalationHours,
    })),
  });
}

type PilotApprovalRuleDefinition = Parameters<typeof canonicalRuleDefinition>[0];

function standardPurchaseRequestRouteEvidence(
  selectedRule: PilotApprovalRuleDefinition,
  activeSealedRules: PilotApprovalRuleDefinition[],
) {
  const classifiedRules = activeSealedRules.map((rule) => ({
    rule,
    routeClass: resolvePurchaseRequestApprovalRule({ rules: [rule], isEmergency: true }).routeType === "emergency"
      ? "emergency" as const
      : "normal" as const,
  }));
  const resolution = resolvePurchaseRequestApprovalRule({
    rules: activeSealedRules,
    isEmergency: false,
  });
  const canonicalJson = canonicalInventoryPilotConfigurationJson({
    ruleDefinition: JSON.parse(canonicalRuleDefinition(selectedRule)) as StableValue,
    resolverInput: {
      resolverId: "purchase_request_approval_rule_v1",
      scenario: "STANDARD_NON_EMERGENCY",
      isEmergency: false,
      candidates: classifiedRules.map(({ rule, routeClass }) => ({
        routeClass,
        ruleDefinition: JSON.parse(canonicalRuleDefinition(rule)) as StableValue,
      })),
    },
    resolverOutcome: {
      selectedApprovalRuleId: resolution.approvalRule?.id ?? null,
      routeType: resolution.routeType,
      fallbackUsed: resolution.fallbackUsed,
      requiredRouteKey: "DEFAULT",
    },
  });
  return { resolution, classifiedRules, canonicalJson };
}

async function loadApprovalRules(tx: TransactionClient, session: SessionContext, bindings: Array<{ family: ReadinessFamily; approvalRuleId: string }>) {
  const ruleIds = bindings.map((binding) => binding.approvalRuleId);
  const rules = ruleIds.length === 0 ? [] : await tx.approvalRule.findMany({
    where: { id: { in: ruleIds }, tenantId: session.context.tenantId, companyId: session.context.companyId },
    include: { steps: { orderBy: [{ stepOrder: "asc" }, { id: "asc" }] } },
  });
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const purchaseRequestRules = bindings.some((binding) => binding.family === "PurchaseRequest")
    ? await tx.approvalRule.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: familyTransactionTypes.PurchaseRequest,
        isActive: true,
        definitionSealed: true,
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      include: { steps: { orderBy: [{ stepOrder: "asc" }, { id: "asc" }] } },
    })
    : [];
  const checkedAt = new Date();
  return bindings.map((binding) => {
    const rule = byId.get(binding.approvalRuleId);
    if (!rule || rule.transactionType !== familyTransactionTypes[binding.family]) {
      throw new Error(inventoryPilotConfigurationStableErrors.selectionInvalid);
    }
    const ruleDefinitionCanonicalJson = canonicalRuleDefinition(rule);
    const resolverEvidenceCanonicalJson = binding.family === "PurchaseRequest"
      ? standardPurchaseRequestRouteEvidence(rule, purchaseRequestRules).canonicalJson
      : null;
    return {
      ...binding,
      approvalRuleLineageId: rule.lineageId,
      approvalRuleVersion: rule.version,
      ruleDefinitionCanonicalJson,
      ruleDefinitionDigest: hashCanonicalJson(ruleDefinitionCanonicalJson),
      resolverEvidenceCanonicalJson,
      resolverEvidenceDigest: resolverEvidenceCanonicalJson
        ? hashCanonicalJson(resolverEvidenceCanonicalJson)
        : null,
      readinessCheckedAt: checkedAt,
    };
  });
}

const draftInclude = Prisma.validator<Prisma.InventoryPilotConfigurationDraftInclude>()({
  endpointMemberships: { where: { isIncluded: true }, orderBy: [{ capability: "asc" }, { inventoryLocationId: "asc" }] },
  itemMemberships: { where: { isIncluded: true }, orderBy: { itemId: "asc" } },
  participants: { where: { isIncluded: true }, orderBy: { responsibility: "asc" } },
  routeReadiness: { where: { isIncluded: true }, orderBy: { family: "asc" } },
});

const workspaceDraftInclude = Prisma.validator<Prisma.InventoryPilotConfigurationDraftInclude>()({
  ...draftInclude,
  createdBy: { select: { displayName: true, email: true } },
  lastEditedBy: { select: { displayName: true, email: true } },
  abandonedBy: { select: { displayName: true } },
});

type IncludedDraft = Prisma.InventoryPilotConfigurationDraftGetPayload<{ include: typeof draftInclude }>;
type WorkspaceDraft = Prisma.InventoryPilotConfigurationDraftGetPayload<{
  include: typeof workspaceDraftInclude;
}>;
export type InventoryPilotConfigurationDraftSnapshot = IncludedDraft;
type InventoryPilotReadinessSelection = {
  endpointMemberships: ReadonlyArray<{
    capability: (typeof inventoryPilotConfigurationCapabilities)[number];
    inventoryLocationId: string;
    locationId: string;
  }>;
  itemMemberships: ReadonlyArray<{ itemId: string }>;
  participants: ReadonlyArray<{
    responsibility: Responsibility;
    userId: string;
    roleAssignmentId: string;
    roleId: string;
  }>;
  routeReadiness: ReadonlyArray<{
    family: ReadinessFamily;
    approvalRuleId: string;
    approvalRuleLineageId: string;
    approvalRuleVersion: number;
    ruleDefinitionCanonicalJson: string;
    ruleDefinitionDigest: string;
    resolverEvidenceCanonicalJson: string | null;
    resolverEvidenceDigest: string | null;
  }>;
};

function configurationSelectionAuditSnapshot(selection: InventoryPilotReadinessSelection) {
  return {
    endpointMemberships: selection.endpointMemberships.map((row) => ({ capability: row.capability, inventoryLocationId: row.inventoryLocationId, locationId: row.locationId })),
    itemIds: selection.itemMemberships.map((row) => row.itemId),
    participants: selection.participants.map((row) => ({ responsibility: row.responsibility, userId: row.userId, roleAssignmentId: row.roleAssignmentId, roleId: row.roleId })),
    routeReadiness: selection.routeReadiness.map((row) => ({ family: row.family, approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceDigest: row.resolverEvidenceDigest })),
  };
}

async function getIncludedDraft(tx: TransactionClient, session: SessionContext, draftId: string) {
  return tx.inventoryPilotConfigurationDraft.findFirst({
    where: { id: draftId, tenantId: session.context.tenantId, companyId: session.context.companyId },
    include: draftInclude,
  });
}

export async function getInventoryPilotConfigurationDraftSnapshot(
  session: SessionContext,
  rawDraftId: unknown,
): Promise<InventoryPilotConfigurationDraftSnapshot> {
  await requireConfigurationPermission(
    session,
    permissions.inventoryPilotConfigurationView,
  );
  const draftId = uuid.parse(rawDraftId);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(
        tx,
        session,
        permissions.inventoryPilotConfigurationView,
      );
      const draft = await getIncludedDraft(tx, session, draftId);
      if (!draft) {
        throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      }
      return draft;
    });
  } catch (error) {
    throw translateBoundaryError(error);
  }
}

async function deriveReadiness(tx: TransactionClient, session: SessionContext, draft: InventoryPilotReadinessSelection) {
  const blockers: InventoryPilotConfigurationReadinessBlocker[] = [];
  for (const capability of inventoryPilotConfigurationCapabilities) {
    if (!draft.endpointMemberships.some((row) => row.capability === capability)) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ENDPOINT_CAPABILITY_REQUIRED", message: `Select at least one ${capability.toLowerCase().replaceAll("_", " ")} endpoint.`, capability });
  }
  if (draft.itemMemberships.length === 0) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ITEM_REQUIRED", message: "Select at least one active inventory item." });

  const inventoryLocationIds = draft.endpointMemberships.map((row) => row.inventoryLocationId);
  const itemIds = draft.itemMemberships.map((row) => row.itemId);
  const [locations, items] = await Promise.all([
    inventoryLocationIds.length ? tx.inventoryLocation.findMany({ where: { id: { in: inventoryLocationIds }, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE", location: { status: "ACTIVE" } }, select: { id: true, locationId: true, location: { select: { brandId: true } } } }) : [],
    itemIds.length ? tx.item.findMany({ where: { id: { in: itemIds }, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE", trackInventory: true }, select: { id: true } }) : [],
  ]);
  const locationMap = new Map(locations.map((row) => [row.id, row.locationId]));
  const pilotEndpointScopes = locations.map((location) => ({ locationId: location.locationId, brandId: location.location.brandId }));
  for (const endpoint of draft.endpointMemberships) {
    if (locationMap.get(endpoint.inventoryLocationId) !== endpoint.locationId) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ENDPOINT_INACTIVE", message: "A selected endpoint is inactive or outside the selected company.", capability: endpoint.capability });
  }
  if (items.length !== new Set(itemIds).size) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ITEM_INACTIVE", message: "A selected item is inactive, non-inventory, or outside the selected company." });

  const participantByResponsibility = new Map(draft.participants.map((row) => [row.responsibility, row]));
  for (const responsibility of inventoryPilotConfigurationResponsibilities) {
    if (!participantByResponsibility.has(responsibility)) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_REQUIRED", message: `Select the ${responsibility.toLowerCase().replaceAll("_", " ")} actor.`, responsibility });
  }
  if (new Set(draft.participants.map((row) => row.userId)).size !== draft.participants.length) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_PARTICIPANTS_MUST_BE_DISTINCT", message: "All five opening-control actors must be different users." });
  const now = new Date();
  const openingEndpointScopes = locations
    .filter((location) => draft.endpointMemberships.some((row) => row.capability === "OPENING_STOCK_LOCATION" && row.inventoryLocationId === location.id))
    .map((location) => ({ locationId: location.locationId, brandId: location.location.brandId }));
  for (const participant of draft.participants) {
    const requiredCodes = responsibilityRequiredPermissions[participant.responsibility];
    const assignment = await tx.userRoleAssignment.findFirst({
      where: {
        id: participant.roleAssignmentId,
        userId: participant.userId,
        roleId: participant.roleId,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        user: { tenantId: session.context.tenantId, status: "ACTIVE" },
        role: {
          status: "ACTIVE",
          OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
        },
      },
      select: { role: { select: { permissions: { select: { permission: { select: { code: true, tenantId: true } } } } } } },
    });
    const codes = new Set((assignment?.role.permissions ?? []).filter((row) => row.permission.tenantId === null || row.permission.tenantId === session.context.tenantId).map((row) => row.permission.code));
    if (!assignment || requiredCodes.some((code) => !codes.has(code))) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_ROLE_STALE", message: `The selected ${participant.responsibility.toLowerCase().replaceAll("_", " ")} role evidence is no longer active or complete.`, responsibility: participant.responsibility });
    const allowedAccessLevels = participant.responsibility === "PREPARER" || participant.responsibility === "SUBMITTER"
      ? ["OPERATE", "APPROVE", "MANAGE"] as const
      : ["APPROVE", "MANAGE"] as const;
    const scopes = await tx.userScopeAssignment.findMany({
      where: {
        userId: participant.userId,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        accessLevel: { in: [...allowedAccessLevels] },
      },
      select: { scopeType: true, scopeId: true },
    });
    const companyWide = scopes.some((scope) => scope.scopeType === "COMPANY" && scope.scopeId === session.context.companyId);
    const coversEveryOpeningEndpoint = openingEndpointScopes.length > 0 && openingEndpointScopes.every((endpoint) =>
      companyWide || scopes.some((scope) =>
        (scope.scopeType === "LOCATION" && scope.scopeId === endpoint.locationId) ||
        (endpoint.brandId && scope.scopeType === "BRAND" && scope.scopeId === endpoint.brandId)
      )
    );
    if (!coversEveryOpeningEndpoint) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_PARTICIPANT_SCOPE_STALE", message: `The selected ${participant.responsibility.toLowerCase().replaceAll("_", " ")} actor does not currently cover every opening-stock endpoint.`, responsibility: participant.responsibility });
  }

  const routeByFamily = new Map(draft.routeReadiness.map((row) => [row.family, row]));
  for (const family of inventoryPilotConfigurationReadinessFamilies) {
    const snapshot = routeByFamily.get(family);
    if (!snapshot) {
      blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_REQUIRED", message: `Select the ${family} approval route.`, family });
      continue;
    }
    const rule = await tx.approvalRule.findFirst({
      where: { id: snapshot.approvalRuleId, tenantId: session.context.tenantId, companyId: session.context.companyId, lineageId: snapshot.approvalRuleLineageId, version: snapshot.approvalRuleVersion },
      include: {
        steps: {
          orderBy: [{ stepOrder: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!rule || !rule.isActive || !rule.definitionSealed || rule.transactionType !== familyTransactionTypes[family]) {
      blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_STALE", message: `The selected ${family} route is no longer active and sealed.`, family });
      continue;
    }
    const resolutionCandidates = await tx.approvalRule.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        transactionType: familyTransactionTypes[family],
        isActive: true,
        definitionSealed: true,
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      include: { steps: { orderBy: [{ stepOrder: "asc" }, { id: "asc" }] } },
    });
    const standardPurchaseRequestEvidence = family === "PurchaseRequest"
      ? standardPurchaseRequestRouteEvidence(rule, resolutionCandidates)
      : null;
    const purchaseRequestNormalRules = standardPurchaseRequestEvidence?.classifiedRules.filter(({ routeClass }) => routeClass === "normal") ?? [];
    const purchaseRequestRouteKeysValid = standardPurchaseRequestEvidence?.classifiedRules.every(({ rule: candidate, routeClass }) =>
      (routeClass === "normal" && candidate.routeKey === "DEFAULT") ||
      (routeClass === "emergency" && candidate.routeKey === "PR_EMERGENCY")
    ) ?? true;
    const authoritative = standardPurchaseRequestEvidence
      ? standardPurchaseRequestEvidence.resolution.approvalRule?.id === rule.id &&
        standardPurchaseRequestEvidence.resolution.routeType === "normal" &&
        !standardPurchaseRequestEvidence.resolution.fallbackUsed &&
        purchaseRequestNormalRules.length === 1 &&
        purchaseRequestNormalRules[0]!.rule.id === rule.id &&
        purchaseRequestRouteKeysValid
      : resolutionCandidates[0]?.id === rule.id;
    if (!authoritative) {
      blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_NOT_AUTHORITATIVE", message: `The selected ${family} route is not the route the submission service currently resolves.`, family });
      continue;
    }
    const ruleCanonicalJson = canonicalRuleDefinition(rule);
    const resolverEvidenceCanonicalJson = standardPurchaseRequestEvidence?.canonicalJson ?? null;
    if (
      ruleCanonicalJson !== snapshot.ruleDefinitionCanonicalJson ||
      hashCanonicalJson(ruleCanonicalJson) !== snapshot.ruleDefinitionDigest ||
      resolverEvidenceCanonicalJson !== snapshot.resolverEvidenceCanonicalJson ||
      (resolverEvidenceCanonicalJson
        ? hashCanonicalJson(resolverEvidenceCanonicalJson) !== snapshot.resolverEvidenceDigest
        : snapshot.resolverEvidenceDigest !== null)
    ) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_CHANGED", message: `The selected ${family} route changed after it was captured. Refresh the draft selection.`, family });
    const requiredSteps = rule.steps.filter((step) => step.required);
    const normalizedRoleSteps = requiredSteps.length > 0 && requiredSteps.every((step) => step.approverType === "ROLE" && Boolean(step.roleId) && !step.userId);
    const requiredRoleIds = [...new Set(requiredSteps.flatMap((step) => step.roleId ? [step.roleId] : []))];
    const requiredRoles = requiredRoleIds.length ? await tx.role.findMany({
      where: {
        id: { in: requiredRoleIds },
        status: "ACTIVE",
        OR: [{ tenantId: session.context.tenantId }, { tenantId: null }],
      },
      include: { permissions: { include: { permission: true } } },
    }) : [];
    const roleCodes = new Map(requiredRoles.map((role) => [role.id, new Set(role.permissions.filter((row) => row.permission.tenantId === null || row.permission.tenantId === session.context.tenantId).map((row) => row.permission.code))]));
    const openingTwoStepContract = family !== "OpeningInventoryCutover" || (
      rule.steps.length === 2 &&
      requiredSteps.length === 2 &&
      requiredSteps[0]!.stepOrder < requiredSteps[1]!.stepOrder &&
      requiredSteps[0]!.roleId !== requiredSteps[1]!.roleId &&
      Boolean(requiredSteps[0]!.roleId && roleCodes.get(requiredSteps[0]!.roleId!)?.has(permissions.openingInventoryOperationsReview)) &&
      Boolean(requiredSteps[1]!.roleId && roleCodes.get(requiredSteps[1]!.roleId!)?.has(permissions.openingInventoryAccountingReview))
    );
    const everyStepHasPermissionEvidence = requiredSteps.every((step, index) => {
      if (!step.roleId) return false;
      const requiredCodes = family === "OpeningInventoryCutover"
        ? [index === 0 ? permissions.openingInventoryOperationsReview : permissions.openingInventoryAccountingReview]
        : familyRequiredPermissions[family];
      const codes = roleCodes.get(step.roleId);
      return Boolean(codes && requiredCodes.every((code) => codes.has(code)));
    });
    if (!normalizedRoleSteps || requiredRoles.length !== requiredRoleIds.length || !openingTwoStepContract || !everyStepHasPermissionEvidence) {
      blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_ROLE_EVIDENCE_MISSING", message: `The selected ${family} route lacks normalized required role-permission evidence.`, family });
      continue;
    }
    const eligibleActorIdsByStep: string[][] = [];
    for (const step of requiredSteps) {
      const assignments = await tx.userRoleAssignment.findMany({
        where: {
          roleId: step.roleId!,
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          user: { tenantId: session.context.tenantId, status: "ACTIVE" },
        },
        select: {
          userId: true,
          user: {
            select: {
              scopeAssignments: {
                where: { status: "ACTIVE", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                select: { scopeType: true, scopeId: true, accessLevel: true },
              },
            },
          },
        },
      });
      eligibleActorIdsByStep.push(assignments.filter((assignment) => inventoryPilotActorCoversOpeningEndpoints(assignment.user.scopeAssignments, pilotEndpointScopes, "OPERATIONS_REVIEWER", session.context.companyId)).map((assignment) => assignment.userId));
    }
    const everyStepHasLiveActor = eligibleActorIdsByStep.every((actorIds) => actorIds.length > 0);
    const openingHasDistinctActors = family !== "OpeningInventoryCutover" || (
      eligibleActorIdsByStep.length === 2 &&
      eligibleActorIdsByStep[0]!.some((operationsActorId) => eligibleActorIdsByStep[1]!.some((accountingActorId) => accountingActorId !== operationsActorId))
    );
    if (!everyStepHasLiveActor || !openingHasDistinctActors) blockers.push({ code: "INVENTORY_PILOT_CONFIGURATION_ROUTE_LIVE_ACTOR_MISSING", message: `The selected ${family} route has no live, independently scoped actor for a required role step.`, family });
  }
  return { blocking: blockers.length > 0, blockers };
}

/** Internal transaction-bound evidence used by the Opening cohort admission service. */
export async function getInventoryPilotRevisionOpeningReadiness(
  tx: TransactionClient,
  session: SessionContext,
  revisionId: string,
) {
  const revision = await tx.inventoryPilotConfigurationRevision.findFirst({
    where: {
      id: revisionId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "SEALED",
      schemaVersion: 2,
      successorRevision: { is: null },
    },
    include: {
      endpointMemberships: { orderBy: [{ capability: "asc" }, { inventoryLocationId: "asc" }] },
      itemMemberships: { orderBy: { itemId: "asc" } },
      participantMemberships: { orderBy: { responsibility: "asc" } },
      routeReadinessMemberships: { orderBy: { family: "asc" } },
    },
  });
  if (!revision) return { eligible: false, blockers: [{ code: "INVENTORY_PILOT_CONFIGURATION_REVISION_NOT_CURRENT", message: "The revision is not the current sealed schema-v2 leaf." }] as InventoryPilotConfigurationReadinessBlocker[] };
  const readiness = await deriveReadiness(tx, session, {
    endpointMemberships: revision.endpointMemberships,
    itemMemberships: revision.itemMemberships,
    participants: revision.participantMemberships,
    routeReadiness: revision.routeReadinessMemberships.map((row) => ({ ...row, readinessCheckedAt: row.evidenceCutoffAt, isIncluded: true, draftId: revision.id, updatedAt: row.createdAt })),
  });
  return { eligible: !readiness.blocking, blockers: readiness.blockers };
}

async function createDraftRow(tx: TransactionClient, session: SessionContext, predecessor: { id: string; revisionNumber: number; configurationDigest: string } | null, auditReason: string) {
  const draft = await tx.inventoryPilotConfigurationDraft.create({
    data: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      schemaVersion: 2,
      status: "DRAFT",
      version: 1,
      predecessorRevisionId: predecessor?.id ?? null,
      predecessorRevisionNumber: predecessor?.revisionNumber ?? null,
      predecessorDigest: predecessor?.configurationDigest ?? null,
      sourceDecisionId: "DEC-0273",
      createdByUserId: session.user.id,
      lastEditedByUserId: session.user.id,
    },
  });
  await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.draft_created", entityType: "InventoryPilotConfigurationDraft", entityId: draft.id, afterData: { status: draft.status, version: draft.version, predecessorRevisionId: predecessor?.id ?? null }, metadata: { reason: auditReason, sourceDecisionId: "DEC-0273", nonOperational: true } } });
  return draft;
}

export async function createInventoryPilotConfigurationDraft(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationDraft);
  const input = createDraftSchema.parse(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationDraft);
      const predecessor = await tx.inventoryPilotConfigurationRevision.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED" }, orderBy: { revisionNumber: "desc" }, select: { id: true, revisionNumber: true, configurationDigest: true } });
      return createDraftRow(tx, session, predecessor, normalizeReason(input.reason));
    });
  } catch (error) { throw translateBoundaryError(error); }
}

export async function createInventoryPilotConfigurationSuccessorDraft(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationDraft);
  const input = createSuccessorSchema.parse(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationDraft);
      const predecessor = await tx.inventoryPilotConfigurationRevision.findFirst({ where: { id: input.predecessorRevisionId, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED", successorRevision: { is: null } }, include: { endpointMemberships: true, itemMemberships: true, participantMemberships: true, routeReadinessMemberships: true } });
      const latest = await tx.inventoryPilotConfigurationRevision.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED" }, orderBy: { revisionNumber: "desc" }, select: { id: true } });
      if (!predecessor || latest?.id !== predecessor.id) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      const draft = await createDraftRow(tx, session, predecessor, normalizeReason(input.reason));
      if (predecessor.endpointMemberships.length) await tx.inventoryPilotDraftEndpointMembership.createMany({ data: predecessor.endpointMemberships.map((row) => ({ draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, inventoryLocationId: row.inventoryLocationId, locationId: row.locationId, capability: row.capability })) });
      if (predecessor.itemMemberships.length) await tx.inventoryPilotDraftItemMembership.createMany({ data: predecessor.itemMemberships.map((row) => ({ draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, itemId: row.itemId })) });
      if (predecessor.participantMemberships.length) await tx.inventoryPilotDraftParticipant.createMany({ data: predecessor.participantMemberships.map((row) => ({ draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, responsibility: row.responsibility, userId: row.userId, roleAssignmentId: row.roleAssignmentId, roleId: row.roleId })) });
      if (predecessor.routeReadinessMemberships.length) await tx.inventoryPilotDraftRouteReadiness.createMany({ data: predecessor.routeReadinessMemberships.map((row) => ({ draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, family: row.family, approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionCanonicalJson: row.ruleDefinitionCanonicalJson, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceCanonicalJson: row.resolverEvidenceCanonicalJson, resolverEvidenceDigest: row.resolverEvidenceDigest, readinessCheckedAt: row.evidenceCutoffAt })) });
      const successor = await getIncludedDraft(tx, session, draft.id);
      if (!successor) {
        throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      }
      return successor;
    });
  } catch (error) { throw translateBoundaryError(error); }
}

export async function updateInventoryPilotConfigurationDraft(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationDraft);
  const input = updateDraftSchema.parse(rawInput);
  const normalized = normalizeDraftSelections(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationDraft);
      await tx.$queryRaw`SELECT "id" FROM "InventoryPilotConfigurationDraft" WHERE "id" = ${input.draftId}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid FOR UPDATE`;
      const draft = await getIncludedDraft(tx, session, input.draftId);
      if (!draft) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      if (draft.status !== "DRAFT" || draft.version !== input.expectedVersion) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      const inventoryLocations = normalized.endpoints.length ? await tx.inventoryLocation.findMany({ where: { id: { in: normalized.endpoints.map((row) => row.inventoryLocationId) }, tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true, locationId: true } }) : [];
      const locationById = new Map(inventoryLocations.map((row) => [row.id, row.locationId]));
      if (inventoryLocations.length !== new Set(normalized.endpoints.map((row) => row.inventoryLocationId)).size) throw new Error(inventoryPilotConfigurationStableErrors.selectionInvalid);
      const items = normalized.itemIds.length ? await tx.item.findMany({ where: { id: { in: normalized.itemIds }, tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true } }) : [];
      if (items.length !== normalized.itemIds.length) throw new Error(inventoryPilotConfigurationStableErrors.selectionInvalid);
      const participantAssignments = normalized.participants.length ? await tx.userRoleAssignment.findMany({ where: { id: { in: normalized.participants.map((row) => row.roleAssignmentId) } }, select: { id: true, userId: true, roleId: true, user: { select: { tenantId: true } } } }) : [];
      const assignmentById = new Map(participantAssignments.map((row) => [row.id, row]));
      const participants = normalized.participants.map((row) => {
        const assignment = assignmentById.get(row.roleAssignmentId);
        if (!assignment || assignment.userId !== row.userId || assignment.user.tenantId !== session.context.tenantId) throw new Error(inventoryPilotConfigurationStableErrors.selectionInvalid);
        return { ...row, roleId: assignment.roleId };
      });
      const routeSnapshots = await loadApprovalRules(tx, session, normalized.routeBindings);
      const beforeSelections = configurationSelectionAuditSnapshot(draft);
      const afterSelections = {
        endpointMemberships: normalized.endpoints.map((row) => ({ ...row, locationId: locationById.get(row.inventoryLocationId)! })),
        itemIds: normalized.itemIds,
        participants: participants.map((row) => ({ responsibility: row.responsibility, userId: row.userId, roleAssignmentId: row.roleAssignmentId, roleId: row.roleId })),
        routeReadiness: routeSnapshots.map((row) => ({ family: row.family, approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceDigest: row.resolverEvidenceDigest })),
      };
      await Promise.all([
        tx.inventoryPilotDraftEndpointMembership.updateMany({ where: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, isIncluded: true }, data: { isIncluded: false } }),
        tx.inventoryPilotDraftItemMembership.updateMany({ where: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, isIncluded: true }, data: { isIncluded: false } }),
        tx.inventoryPilotDraftParticipant.updateMany({ where: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, isIncluded: true }, data: { isIncluded: false } }),
        tx.inventoryPilotDraftRouteReadiness.updateMany({ where: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, isIncluded: true }, data: { isIncluded: false } }),
      ]);
      for (const row of normalized.endpoints) await tx.inventoryPilotDraftEndpointMembership.upsert({ where: { draftId_capability_inventoryLocationId: { draftId: draft.id, capability: row.capability, inventoryLocationId: row.inventoryLocationId } }, create: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, capability: row.capability, inventoryLocationId: row.inventoryLocationId, locationId: locationById.get(row.inventoryLocationId)! }, update: { isIncluded: true } });
      for (const itemId of normalized.itemIds) await tx.inventoryPilotDraftItemMembership.upsert({ where: { draftId_itemId: { draftId: draft.id, itemId } }, create: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, itemId }, update: { isIncluded: true } });
      for (const row of participants) await tx.inventoryPilotDraftParticipant.upsert({ where: { draftId_responsibility: { draftId: draft.id, responsibility: row.responsibility } }, create: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, ...row }, update: { userId: row.userId, roleAssignmentId: row.roleAssignmentId, roleId: row.roleId, isIncluded: true } });
      for (const row of routeSnapshots) await tx.inventoryPilotDraftRouteReadiness.upsert({ where: { draftId_family: { draftId: draft.id, family: row.family } }, create: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, ...row }, update: { approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionCanonicalJson: row.ruleDefinitionCanonicalJson, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceCanonicalJson: row.resolverEvidenceCanonicalJson, resolverEvidenceDigest: row.resolverEvidenceDigest, readinessCheckedAt: row.readinessCheckedAt, isIncluded: true } });
      const claimed = await tx.inventoryPilotConfigurationDraft.updateMany({ where: { id: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "DRAFT", version: input.expectedVersion }, data: { version: { increment: 1 }, lastEditedByUserId: session.user.id } });
      if (claimed.count !== 1) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.draft_updated", entityType: "InventoryPilotConfigurationDraft", entityId: draft.id, beforeData: { version: input.expectedVersion, selections: beforeSelections }, afterData: { version: input.expectedVersion + 1, selections: afterSelections }, metadata: { reason: normalizeReason(input.reason), sourceDecisionId: "DEC-0273", wholeSnapshot: true } } });
      return getIncludedDraft(tx, session, draft.id);
    });
  } catch (error) { throw translateBoundaryError(error); }
}

export async function abandonInventoryPilotConfigurationDraft(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationDraft);
  const input = draftActionSchema.parse(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationDraft);
      const draft = await tx.inventoryPilotConfigurationDraft.findFirst({
        where: { id: input.draftId, tenantId: session.context.tenantId, companyId: session.context.companyId },
        select: { id: true },
      });
      if (!draft) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      const abandonedAt = new Date();
      const claimed = await tx.inventoryPilotConfigurationDraft.updateMany({ where: { id: input.draftId, tenantId: session.context.tenantId, companyId: session.context.companyId, status: "DRAFT", version: input.expectedVersion }, data: { status: "ABANDONED", version: { increment: 1 }, lastEditedByUserId: session.user.id, abandonedByUserId: session.user.id, abandonedAt, abandonmentReason: normalizeReason(input.reason) } });
      if (claimed.count !== 1) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.draft_abandoned", entityType: "InventoryPilotConfigurationDraft", entityId: input.draftId, beforeData: { status: "DRAFT", version: input.expectedVersion }, afterData: { status: "ABANDONED", version: input.expectedVersion + 1, abandonedAt: abandonedAt.toISOString() }, metadata: { reason: normalizeReason(input.reason), sourceDecisionId: "DEC-0273" } } });
      return tx.inventoryPilotConfigurationDraft.findUnique({ where: { id: input.draftId } });
    });
  } catch (error) { throw translateBoundaryError(error); }
}

export async function evaluateInventoryPilotConfigurationReadiness(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationDraft);
  const input = evaluateSchema.parse(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationDraft);
      const draft = await getIncludedDraft(tx, session, input.draftId);
      if (!draft) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      if (draft.status !== "DRAFT") throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      const readiness = await deriveReadiness(tx, session, draft);
      await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.readiness_evaluated", entityType: "InventoryPilotConfigurationDraft", entityId: draft.id, afterData: { version: draft.version, blocking: readiness.blocking, blockerCodes: readiness.blockers.map((row) => row.code) }, metadata: { sourceDecisionId: "DEC-0273", evidenceOnly: true } } });
      return { draftId: draft.id, version: draft.version, ...readiness };
    });
  } catch (error) { throw translateBoundaryError(error); }
}

async function recordSealDeniedSafely(session: SessionContext, draftId: string, code: string) {
  try {
    await prisma.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.seal_denied", entityType: "InventoryPilotConfigurationDraft", entityId: draftId, afterData: { errorCode: code }, metadata: { sourceDecisionId: "DEC-0273", noConfigurationMutation: true } } });
  } catch { /* The original safe denial remains authoritative. */ }
}

function pageEnvelope<T>(items: T[], page: number, pageSize: number, totalItems: number, capped = false) {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), capped };
}

async function getEligibleParticipantUserPage(
  session: SessionContext,
  input: z.infer<typeof workspaceSchema>,
  openingEndpoints: Array<{ locationId: string; brandId: string | null }>,
) {
  if (openingEndpoints.length === 0) return pageEnvelope([], input.userPage, input.userPageSize, 0);
  const requirementRows = inventoryPilotConfigurationResponsibilities.flatMap((responsibility) =>
    responsibilityRequiredPermissions[responsibility].map((permissionCode) => ({
      responsibility,
      permissionCode,
      accessRank: responsibility === "PREPARER" || responsibility === "SUBMITTER" ? 2 : 3,
    })),
  );
  const requirementValues = Prisma.join(requirementRows.map((row) => Prisma.sql`(${row.responsibility}, ${row.permissionCode}, ${row.accessRank})`));
  const endpointValues = Prisma.join(openingEndpoints.map((endpoint) => Prisma.sql`(${endpoint.locationId}::uuid, ${endpoint.brandId}::uuid)`));
  const offset = (input.userPage - 1) * input.userPageSize;
  const rows = await prisma.$queryRaw<Array<{ id: string | null; displayName: string | null; email: string | null; totalItems: bigint }>>(Prisma.sql`
    WITH responsibility_requirements("responsibility", "permissionCode", "accessRank") AS (
      VALUES ${requirementValues}
    ),
    responsibility_totals AS (
      SELECT "responsibility", MAX("accessRank") AS "accessRank", COUNT(DISTINCT "permissionCode")::int AS "requiredPermissionCount"
        FROM responsibility_requirements
       GROUP BY "responsibility"
    ),
    opening_endpoints("locationId", "brandId") AS (
      VALUES ${endpointValues}
    ),
    eligible_pairs AS (
      SELECT ura."userId", ura."id" AS "roleAssignmentId", rt."responsibility"
        FROM "UserRoleAssignment" ura
        JOIN "User" u ON u."id" = ura."userId"
        JOIN "Role" r ON r."id" = ura."roleId"
        CROSS JOIN responsibility_totals rt
       WHERE u."tenantId" = ${session.context.tenantId}::uuid
         AND u.status = 'ACTIVE'
         AND ura.status = 'ACTIVE'
         AND ura."startsAt" <= CURRENT_TIMESTAMP
         AND (ura."endsAt" IS NULL OR ura."endsAt" > CURRENT_TIMESTAMP)
         AND r.status = 'ACTIVE'
         AND (r."tenantId" = ${session.context.tenantId}::uuid OR r."tenantId" IS NULL)
         AND (${input.userResponsibility ?? null}::text IS NULL OR rt."responsibility" = ${input.userResponsibility ?? null}::text)
         AND (
           SELECT COUNT(DISTINCT p.code)::int
             FROM "RolePermission" rp
             JOIN "Permission" p ON p."id" = rp."permissionId"
            WHERE rp."roleId" = ura."roleId"
              AND (p."tenantId" = ${session.context.tenantId}::uuid OR p."tenantId" IS NULL)
              AND p.code IN (
                SELECT rr."permissionCode"
                  FROM responsibility_requirements rr
                 WHERE rr."responsibility" = rt."responsibility"
              )
         ) = rt."requiredPermissionCount"
         AND NOT EXISTS (
           SELECT 1
             FROM opening_endpoints endpoint
            WHERE NOT EXISTS (
              SELECT 1
                FROM "UserScopeAssignment" usa
               WHERE usa."userId" = u."id"
                 AND usa.status = 'ACTIVE'
                 AND usa."startsAt" <= CURRENT_TIMESTAMP
                 AND (usa."endsAt" IS NULL OR usa."endsAt" > CURRENT_TIMESTAMP)
                 AND CASE usa."accessLevel"::text WHEN 'VIEW' THEN 1 WHEN 'OPERATE' THEN 2 WHEN 'APPROVE' THEN 3 WHEN 'MANAGE' THEN 4 ELSE 0 END >= rt."accessRank"
                 AND (
                   (usa."scopeType"::text = 'COMPANY' AND usa."scopeId" = ${session.context.companyId}::uuid) OR
                   (usa."scopeType"::text = 'LOCATION' AND usa."scopeId" = endpoint."locationId") OR
                   (endpoint."brandId" IS NOT NULL AND usa."scopeType"::text = 'BRAND' AND usa."scopeId" = endpoint."brandId")
                 )
            )
         )
    ),
    eligible_users AS (
      SELECT DISTINCT u."id", u."displayName", u.email
        FROM eligible_pairs pair
        JOIN "User" u ON u."id" = pair."userId"
       WHERE (${input.userQuery ?? null}::text IS NULL OR u."displayName" ILIKE ${input.userQuery ? `%${input.userQuery}%` : null}::text OR u.email ILIKE ${input.userQuery ? `%${input.userQuery}%` : null}::text)
    ),
    totals AS (SELECT COUNT(*)::bigint AS "totalItems" FROM eligible_users)
    SELECT page."id", page."displayName", page.email, totals."totalItems"
      FROM totals
      LEFT JOIN LATERAL (
        SELECT * FROM eligible_users ORDER BY "displayName" ASC, "id" ASC OFFSET ${offset} LIMIT ${input.userPageSize}
      ) page ON TRUE
  `);
  const totalItems = Number(rows[0]?.totalItems ?? 0n);
  const userIds = rows.flatMap((row) => row.id ? [row.id] : []);
  const users = userIds.length ? await prisma.user.findMany({
    where: { id: { in: userIds }, tenantId: session.context.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      displayName: true,
      email: true,
      roleAssignments: { where: { status: "ACTIVE", startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { id: true, roleId: true, role: { select: { name: true, code: true, status: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
      scopeAssignments: { where: { status: "ACTIVE", startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { scopeType: true, scopeId: true, accessLevel: true } },
    },
  }) : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  const items = userIds.flatMap((userId) => {
    const user = byId.get(userId);
    if (!user) return [];
    const roleAssignments = user.roleAssignments.map((assignment) => {
      const codes = new Set(assignment.role.permissions.map((row) => row.permission.code));
      const eligibleResponsibilities = inventoryPilotConfigurationResponsibilities.filter((responsibility) =>
        (!input.userResponsibility || input.userResponsibility === responsibility) &&
        responsibilityRequiredPermissions[responsibility].every((code) => codes.has(code)) &&
        inventoryPilotActorCoversOpeningEndpoints(user.scopeAssignments, openingEndpoints, responsibility, session.context.companyId)
      );
      return { ...assignment, eligibleResponsibilities };
    }).filter((assignment) => assignment.eligibleResponsibilities.length > 0);
    return roleAssignments.length > 0 ? [{ id: user.id, displayName: user.displayName, email: user.email, roleAssignments }] : [];
  });
  return pageEnvelope(items, input.userPage, input.userPageSize, totalItems);
}

export function inventoryPilotActorCoversOpeningEndpoints(
  scopes: Array<{ scopeType: string; scopeId: string; accessLevel: string }>,
  endpoints: Array<{ locationId: string; brandId: string | null }>,
  responsibility: Responsibility,
  companyId: string,
) {
  const accessLevels = responsibility === "PREPARER" || responsibility === "SUBMITTER"
    ? new Set(["OPERATE", "APPROVE", "MANAGE"])
    : new Set(["APPROVE", "MANAGE"]);
  const eligible = scopes.filter((scope) => accessLevels.has(scope.accessLevel));
  const companyWide = eligible.some((scope) => scope.scopeType === "COMPANY" && scope.scopeId === companyId);
  return endpoints.length > 0 && endpoints.every((endpoint) => companyWide || eligible.some((scope) =>
    (scope.scopeType === "LOCATION" && scope.scopeId === endpoint.locationId) ||
    (endpoint.brandId && scope.scopeType === "BRAND" && scope.scopeId === endpoint.brandId)
  ));
}

export function isInventoryPilotSealActorSeparated(
  draft: { createdByUserId: string; lastEditedByUserId: string },
  actorUserId: string,
) {
  return draft.createdByUserId !== actorUserId && draft.lastEditedByUserId !== actorUserId;
}

export async function sealInventoryPilotConfigurationDraft(session: SessionContext, rawInput: unknown) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationSeal);
  const input = sealSchema.parse(rawInput);
  const normalizedReason = normalizeReason(input.reason);
  const requestCanonicalJson = canonicalInventoryPilotConfigurationJson({ draftId: input.draftId, expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, reason: normalizedReason, sealedByUserId: session.user.id, tenantId: session.context.tenantId, companyId: session.context.companyId });
  const requestHash = hashCanonicalJson(requestCanonicalJson);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationSeal);
      await tx.$queryRaw`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`inventory-pilot-configuration:${session.context.tenantId}:${session.context.companyId}`}, 0))::text AS "lockResult"`;
      await tx.$queryRaw`SELECT "id" FROM "InventoryPilotConfigurationDraft" WHERE "id" = ${input.draftId}::uuid AND "tenantId" = ${session.context.tenantId}::uuid AND "companyId" = ${session.context.companyId}::uuid FOR UPDATE`;
      const replay = await tx.inventoryPilotConfigurationSealOperation.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, idempotencyKey: input.idempotencyKey }, include: { sealedRevision: { include: { endpointMemberships: true, itemMemberships: true, participantMemberships: true, routeReadinessMemberships: true } } } });
      if (replay) {
        if (replay.draftId !== input.draftId || replay.requestHash !== requestHash || replay.sealedByUserId !== session.user.id) throw new Error(inventoryPilotConfigurationStableErrors.idempotencyConflict);
        return { revision: replay.sealedRevision, replayed: true };
      }
      const draft = await getIncludedDraft(tx, session, input.draftId);
      if (!draft) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
      if (draft.status !== "DRAFT" || draft.version !== input.expectedVersion) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      if (!isInventoryPilotSealActorSeparated(draft, session.user.id)) {
        throw new Error(inventoryPilotConfigurationStableErrors.editorCannotSeal);
      }
      const readiness = await deriveReadiness(tx, session, draft);
      if (readiness.blocking) throw new Error(inventoryPilotConfigurationStableErrors.readinessBlocked);
      const liveSession = await assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationSeal);
      try {
        await assertPrivilegedMfaForAction({ ...session, authentication: { sessionId: liveSession.id, assuranceLevel: liveSession.assuranceLevel, mfaAuthenticatedAt: liveSession.mfaAuthenticatedAt, absoluteExpiresAt: liveSession.absoluteExpiresAt } }, { action: "inventory_pilot_configuration.seal", enforcementScope: "all_sensitive", permissionCode: permissions.inventoryPilotConfigurationSeal, entityType: "InventoryPilotConfigurationDraft", entityId: draft.id, reason: normalizedReason, metadata: { sourceDecisionId: "DEC-0273", expectedVersion: input.expectedVersion } }, { transaction: tx, forceEnforcement: true });
      } catch (error) { throw translateBoundaryError(error); }
      const latest = await tx.inventoryPilotConfigurationRevision.findFirst({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED" }, orderBy: { revisionNumber: "desc" }, select: { id: true, revisionNumber: true, configurationDigest: true } });
      if ((draft.predecessorRevisionId ?? null) !== (latest?.id ?? null) || (draft.predecessorRevisionNumber ?? null) !== (latest?.revisionNumber ?? null) || (draft.predecessorDigest ?? null) !== (latest?.configurationDigest ?? null)) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      const evidenceCutoffAt = new Date();
      const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
      const endpoints = draft.endpointMemberships.map((row) => ({ capability: row.capability, inventoryLocationId: row.inventoryLocationId, locationId: row.locationId })).sort((a, b) => asciiCompare(`${a.capability}:${a.inventoryLocationId}`, `${b.capability}:${b.inventoryLocationId}`));
      const itemIds = draft.itemMemberships.map((row) => row.itemId).sort(asciiCompare);
      const participants = draft.participants.map((row) => ({ responsibility: row.responsibility, userId: row.userId, roleAssignmentId: row.roleAssignmentId, roleId: row.roleId })).sort((a, b) => asciiCompare(a.responsibility, b.responsibility));
      const routeReadiness = draft.routeReadiness.map((row) => ({ family: row.family, approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionCanonicalJson: row.ruleDefinitionCanonicalJson, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceCanonicalJson: row.resolverEvidenceCanonicalJson, resolverEvidenceDigest: row.resolverEvidenceDigest, evidenceCutoffAt: evidenceCutoffAt.toISOString() })).sort((a, b) => asciiCompare(a.family, b.family));
      const canonicalValue: StableValue = { schemaVersion: 2, sourceDecisionId: "DEC-0273", tenantId: session.context.tenantId, companyId: session.context.companyId, revisionNumber, predecessor: latest ? { revisionId: latest.id, revisionNumber: latest.revisionNumber, configurationDigest: latest.configurationDigest } : null, endpoints, itemIds, participants, routeReadiness, sealedByUserId: session.user.id, sealedAt: evidenceCutoffAt.toISOString(), evidenceCutoffAt: evidenceCutoffAt.toISOString() };
      const canonicalJson = canonicalInventoryPilotConfigurationJson(canonicalValue);
      const configurationDigest = hashCanonicalJson(canonicalJson);
      const revision = await tx.inventoryPilotConfigurationRevision.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, revisionNumber, schemaVersion: 2, status: "SEALED", predecessorRevisionId: latest?.id ?? null, predecessorRevisionNumber: latest?.revisionNumber ?? null, predecessorDigest: latest?.configurationDigest ?? null, canonicalJson, configurationDigest, sourceDecisionId: "DEC-0273", sealedByUserId: session.user.id, sealedAt: evidenceCutoffAt } });
      await tx.inventoryPilotEndpointMembership.createMany({ data: endpoints.map((row) => ({ configurationRevisionId: revision.id, tenantId: session.context.tenantId, companyId: session.context.companyId, configurationRevisionNumber: revisionNumber, ...row })) });
      await tx.inventoryPilotItemMembership.createMany({ data: itemIds.map((itemId) => ({ configurationRevisionId: revision.id, tenantId: session.context.tenantId, companyId: session.context.companyId, configurationRevisionNumber: revisionNumber, itemId })) });
      await tx.inventoryPilotParticipantMembership.createMany({ data: participants.map((row) => ({ configurationRevisionId: revision.id, tenantId: session.context.tenantId, companyId: session.context.companyId, configurationRevisionNumber: revisionNumber, configurationDigest, evidenceCutoffAt, ...row })) });
      await tx.inventoryPilotRouteReadinessMembership.createMany({ data: routeReadiness.map((row) => ({ configurationRevisionId: revision.id, tenantId: session.context.tenantId, companyId: session.context.companyId, configurationRevisionNumber: revisionNumber, configurationDigest, family: row.family, approvalRuleId: row.approvalRuleId, approvalRuleLineageId: row.approvalRuleLineageId, approvalRuleVersion: row.approvalRuleVersion, ruleDefinitionCanonicalJson: row.ruleDefinitionCanonicalJson, ruleDefinitionDigest: row.ruleDefinitionDigest, resolverEvidenceCanonicalJson: row.resolverEvidenceCanonicalJson, resolverEvidenceDigest: row.resolverEvidenceDigest, evidenceCutoffAt })) });
      await tx.inventoryPilotConfigurationSealOperation.create({ data: { draftId: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, expectedDraftVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, requestHash, sealedRevisionId: revision.id, sealedRevisionNumber: revisionNumber, sealedRevisionDigest: configurationDigest, sealedByUserId: session.user.id, evidenceCutoffAt } });
      const claimed = await tx.inventoryPilotConfigurationDraft.updateMany({ where: { id: draft.id, tenantId: session.context.tenantId, companyId: session.context.companyId, version: input.expectedVersion, status: "DRAFT" }, data: { status: "SEALED", version: { increment: 1 }, sealedRevisionId: revision.id, sealedRevisionNumber: revisionNumber, sealedRevisionDigest: configurationDigest, sealedAt: evidenceCutoffAt } });
      if (claimed.count !== 1) throw new Error(inventoryPilotConfigurationStableErrors.stateConflict);
      await tx.auditEvent.create({ data: { tenantId: session.context.tenantId, companyId: session.context.companyId, actorUserId: session.user.id, eventType: "inventory_pilot_configuration.revision_sealed", entityType: "InventoryPilotConfigurationRevision", entityId: revision.id, afterData: { draftId: draft.id, revisionNumber, schemaVersion: 2, configurationDigest, evidenceCutoffAt: evidenceCutoffAt.toISOString(), endpointCount: endpoints.length, itemCount: itemIds.length, participantCount: participants.length, routeCount: routeReadiness.length }, metadata: { reason: normalizedReason, sourceDecisionId: "DEC-0273", evidenceOnly: true, activationEffect: false, inventoryEffect: false } } });
      return { revision: { ...revision, endpointMemberships: endpoints, itemMemberships: itemIds.map((itemId) => ({ itemId })), participantMemberships: participants, routeReadinessMemberships: routeReadiness }, replayed: false };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const translated = translateBoundaryError(error);
    if (!new Set<string>([inventoryPilotConfigurationStableErrors.permissionDenied, inventoryPilotConfigurationStableErrors.companyManageRequired, inventoryPilotConfigurationStableErrors.authorityStale, inventoryPilotConfigurationStableErrors.notFound]).has(translated.message)) {
      await recordSealDeniedSafely(session, input.draftId, translated.message);
    }
    throw translated;
  }
}

export async function getInventoryPilotConfigurationWorkspace(session: SessionContext, rawInput: unknown = {}) {
  await requireConfigurationPermission(session, permissions.inventoryPilotConfigurationView);
  const input = workspaceSchema.parse(rawInput);
  try {
    const liveSession = await prisma.$transaction((tx) => assertLiveCompanyAuthority(tx, session, permissions.inventoryPilotConfigurationView));
    const granted = new Set(await getGrantedPermissionCodes(session));
    const draftWhere = { tenantId: session.context.tenantId, companyId: session.context.companyId, status: { in: ["DRAFT" as const, "ABANDONED" as const] } };
    const revisionWhere = { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "SEALED" as const };
    const itemWhere = {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: input.itemStatus,
      trackInventory: true,
      ...(input.itemCategoryId ? { itemCategoryId: input.itemCategoryId } : {}),
      ...(input.itemQuery ? { OR: [{ itemCode: { contains: input.itemQuery, mode: "insensitive" as const } }, { itemName: { contains: input.itemQuery, mode: "insensitive" as const } }] } : {}),
    };
    const endpointWhere = {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE" as const,
      location: { status: "ACTIVE" as const },
      ...(input.endpointQuery ? { OR: [{ code: { contains: input.endpointQuery, mode: "insensitive" as const } }, { name: { contains: input.endpointQuery, mode: "insensitive" as const } }, { location: { name: { contains: input.endpointQuery, mode: "insensitive" as const } } }] } : {}),
    };
    const ruleWhere = {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: input.ruleFamily ? familyTransactionTypes[input.ruleFamily] : { in: Object.values(familyTransactionTypes) },
      ...(input.ruleQuery ? { OR: [{ transactionType: { contains: input.ruleQuery, mode: "insensitive" as const } }, { routeKey: { contains: input.ruleQuery, mode: "insensitive" as const } }] } : {}),
    };
    const [company, draftTotal, drafts, revisionTotal, sealedRevisions, endpointTotal, candidateEndpointItems, itemTotal, candidateItemItems, ruleTotal, candidateRuleItems] = await Promise.all([
      prisma.company.findFirst({ where: { id: session.context.companyId, tenantId: session.context.tenantId }, select: { id: true, legalName: true, tradingName: true, timezone: true } }),
      prisma.inventoryPilotConfigurationDraft.count({ where: draftWhere }),
      prisma.inventoryPilotConfigurationDraft.findMany({ where: draftWhere, select: { id: true, status: true, version: true, schemaVersion: true, predecessorRevisionId: true, sealedRevisionId: true, createdByUserId: true, lastEditedByUserId: true, createdAt: true, updatedAt: true, sealedAt: true, createdBy: { select: { displayName: true } }, lastEditedBy: { select: { displayName: true } }, _count: { select: { endpointMemberships: { where: { isIncluded: true } }, itemMemberships: { where: { isIncluded: true } }, participants: { where: { isIncluded: true } }, routeReadiness: { where: { isIncluded: true } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (input.queuePage - 1) * input.queuePageSize, take: input.queuePageSize }),
      prisma.inventoryPilotConfigurationRevision.count({ where: revisionWhere }),
      prisma.inventoryPilotConfigurationRevision.findMany({ where: revisionWhere, select: { id: true, revisionNumber: true, schemaVersion: true, configurationDigest: true, predecessorRevisionId: true, sealedByUserId: true, sealedAt: true, sealedBy: { select: { displayName: true } }, successorRevision: { select: { id: true, revisionNumber: true } }, _count: { select: { endpointMemberships: true, itemMemberships: true, participantMemberships: true, routeReadinessMemberships: true } } }, orderBy: { revisionNumber: "desc" }, skip: (input.queuePage - 1) * input.queuePageSize, take: input.queuePageSize }),
      prisma.inventoryLocation.count({ where: endpointWhere }),
      prisma.inventoryLocation.findMany({ where: endpointWhere, select: { id: true, code: true, name: true, locationId: true, location: { select: { code: true, name: true, locationType: true, brandId: true } } }, orderBy: [{ location: { code: "asc" } }, { code: "asc" }, { id: "asc" }], skip: (input.endpointPage - 1) * input.endpointPageSize, take: input.endpointPageSize }),
      prisma.item.count({ where: itemWhere }),
      prisma.item.findMany({ where: itemWhere, select: { id: true, itemCode: true, itemName: true, status: true, itemCategoryId: true, category: { select: { categoryCode: true, categoryName: true } }, trackLot: true, trackExpiry: true }, orderBy: [{ itemCode: "asc" }, { id: "asc" }], skip: (input.itemPage - 1) * input.itemPageSize, take: input.itemPageSize }),
      prisma.approvalRule.count({ where: ruleWhere }),
      prisma.approvalRule.findMany({ where: ruleWhere, select: { id: true, transactionType: true, routeKey: true, lineageId: true, version: true, priority: true, isActive: true, definitionSealed: true, updatedAt: true }, orderBy: [{ transactionType: "asc" }, { priority: "asc" }, { version: "desc" }, { id: "asc" }], skip: (input.rulePage - 1) * input.rulePageSize, take: input.rulePageSize }),
    ]);
    if (!company) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
    const queueRows = await prisma.$queryRaw<Array<{ id: string; recordType: "DRAFT" | "SEALED_REVISION"; sortAt: Date }>>`
      SELECT q."id", q."recordType", q."sortAt"
        FROM (
          SELECT d."id", 'DRAFT'::text AS "recordType", d."updatedAt" AS "sortAt"
            FROM "InventoryPilotConfigurationDraft" d
           WHERE d."tenantId" = ${session.context.tenantId}::uuid
             AND d."companyId" = ${session.context.companyId}::uuid
             AND d.status IN ('DRAFT', 'ABANDONED')
          UNION ALL
          SELECT r."id", 'SEALED_REVISION'::text AS "recordType", r."sealedAt" AS "sortAt"
            FROM "InventoryPilotConfigurationRevision" r
           WHERE r."tenantId" = ${session.context.tenantId}::uuid
             AND r."companyId" = ${session.context.companyId}::uuid
             AND r.status = 'SEALED'
        ) q
       ORDER BY q."sortAt" DESC, q."id" DESC
       OFFSET ${(input.queuePage - 1) * input.queuePageSize}
       LIMIT ${input.queuePageSize}
    `;
    const queueDraftIds = queueRows.filter((row) => row.recordType === "DRAFT").map((row) => row.id);
    const queueRevisionIds = queueRows.filter((row) => row.recordType === "SEALED_REVISION").map((row) => row.id);
    const [queueDrafts, queueRevisions] = await Promise.all([
      queueDraftIds.length ? prisma.inventoryPilotConfigurationDraft.findMany({ where: { id: { in: queueDraftIds }, ...draftWhere }, select: { id: true, status: true, version: true, schemaVersion: true, predecessorRevisionId: true, sealedRevisionId: true, createdByUserId: true, lastEditedByUserId: true, createdAt: true, updatedAt: true, sealedAt: true, createdBy: { select: { displayName: true } }, lastEditedBy: { select: { displayName: true } }, _count: { select: { endpointMemberships: { where: { isIncluded: true } }, itemMemberships: { where: { isIncluded: true } }, participants: { where: { isIncluded: true } }, routeReadiness: { where: { isIncluded: true } } } } } }) : [],
      queueRevisionIds.length ? prisma.inventoryPilotConfigurationRevision.findMany({ where: { id: { in: queueRevisionIds }, ...revisionWhere }, select: { id: true, revisionNumber: true, schemaVersion: true, configurationDigest: true, predecessorRevisionId: true, sealedByUserId: true, sealedAt: true, sealedBy: { select: { displayName: true } }, successorRevision: { select: { id: true, revisionNumber: true } }, _count: { select: { endpointMemberships: true, itemMemberships: true, participantMemberships: true, routeReadinessMemberships: true } } } }) : [],
    ]);
    const queueDraftById = new Map(queueDrafts.map((row) => [row.id, row]));
    const queueRevisionById = new Map(queueRevisions.map((row) => [row.id, row]));
    type RevisionQueueItem =
      | { recordType: "DRAFT"; record: (typeof queueDrafts)[number] }
      | {
          recordType: "SEALED_REVISION";
          record: (typeof queueRevisions)[number];
        };
    const revisionQueueItems: RevisionQueueItem[] = [];
    for (const row of queueRows) {
      if (row.recordType === "DRAFT") {
        const record = queueDraftById.get(row.id);
        if (record) revisionQueueItems.push({ recordType: "DRAFT", record });
        continue;
      }
      const record = queueRevisionById.get(row.id);
      if (record) {
        revisionQueueItems.push({ recordType: "SEALED_REVISION", record });
      }
    }
    const selectedDraftId = input.revisionId ? null : input.draftId ?? drafts.find((draft) => draft.status === "DRAFT")?.id ?? null;
    const selectedDraft: WorkspaceDraft | null = selectedDraftId
      ? await prisma.inventoryPilotConfigurationDraft.findFirst({
          where: { id: selectedDraftId, ...draftWhere },
          include: workspaceDraftInclude,
        })
      : null;
    if (input.draftId && !selectedDraft) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
    const selectedRevisionId = input.revisionId ?? (!selectedDraft ? sealedRevisions[0]?.id : null) ?? null;
    const selectedRevision = selectedRevisionId ? await prisma.inventoryPilotConfigurationRevision.findFirst({ where: { id: selectedRevisionId, ...revisionWhere }, include: { endpointMemberships: { orderBy: [{ capability: "asc" }, { inventoryLocationId: "asc" }] }, itemMemberships: { orderBy: { itemId: "asc" } }, participantMemberships: { orderBy: { responsibility: "asc" }, include: { user: { select: { displayName: true, email: true } }, roleAssignment: { select: { role: { select: { code: true, name: true } } } } } }, routeReadinessMemberships: { orderBy: { family: "asc" } }, sealedBy: { select: { displayName: true, email: true } }, sealedDraft: { select: { id: true, createdByUserId: true, lastEditedByUserId: true } }, successorRevision: { select: { id: true, revisionNumber: true, configurationDigest: true } } } }) : null;
    if (input.revisionId && !selectedRevision) throw new Error(inventoryPilotConfigurationStableErrors.notFound);
    const readiness = selectedDraft?.status === "DRAFT"
      ? await prisma.$transaction((tx) => deriveReadiness(tx, session, selectedDraft))
      : selectedRevision
        ? await prisma.$transaction((tx) => deriveReadiness(tx, session, {
            endpointMemberships: selectedRevision.endpointMemberships,
            itemMemberships: selectedRevision.itemMemberships,
            participants: selectedRevision.participantMemberships,
            routeReadiness: selectedRevision.routeReadinessMemberships.map((row) => ({ ...row, readinessCheckedAt: row.evidenceCutoffAt, isIncluded: true, draftId: selectedRevision.id, updatedAt: row.createdAt })),
          }))
        : { blocking: false, blockers: [] as InventoryPilotConfigurationReadinessBlocker[] };
    const selectionEndpoints = selectedDraft?.endpointMemberships ?? selectedRevision?.endpointMemberships ?? [];
    const selectionItemIds = (selectedDraft?.itemMemberships ?? selectedRevision?.itemMemberships ?? []).map((row) => row.itemId);
    const selectedEndpointIds = [...new Set(selectionEndpoints.map((row) => row.inventoryLocationId))];
    const [selectedEndpointDetails, selectedItemDetails] = await Promise.all([
      selectedEndpointIds.length ? prisma.inventoryLocation.findMany({ where: { id: { in: selectedEndpointIds }, tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true, code: true, name: true, status: true, locationId: true, location: { select: { code: true, name: true, status: true, locationType: true, brandId: true } } }, orderBy: [{ code: "asc" }, { id: "asc" }] }) : [],
      selectionItemIds.length ? prisma.item.findMany({ where: { id: { in: selectionItemIds }, tenantId: session.context.tenantId, companyId: session.context.companyId }, select: { id: true, itemCode: true, itemName: true, status: true, itemCategoryId: true, category: { select: { categoryCode: true, categoryName: true } }, trackInventory: true }, orderBy: [{ itemCode: "asc" }, { id: "asc" }] }) : [],
    ]);
    const openingEndpoints = selectedEndpointDetails.filter((endpoint) => selectionEndpoints.some((row) => row.capability === "OPENING_STOCK_LOCATION" && row.inventoryLocationId === endpoint.id)).map((endpoint) => ({ locationId: endpoint.locationId, brandId: endpoint.location.brandId }));
    const candidateUsers = await getEligibleParticipantUserPage(session, input, openingEndpoints);
    const selectedParticipants = selectedDraft?.participants ?? selectedRevision?.participantMemberships ?? [];
    const selectedParticipantUsers = selectedParticipants.length ? await prisma.user.findMany({
      where: { id: { in: selectedParticipants.map((participant) => participant.userId) }, tenantId: session.context.tenantId },
      select: { id: true, displayName: true, email: true, roleAssignments: { select: { id: true, role: { select: { name: true, code: true } } } } },
    }) : [];
    const selectedParticipantUserById = new Map(selectedParticipantUsers.map((user) => [user.id, user]));
    const selectedParticipantDetails = selectedParticipants.map((participant) => {
      const user = selectedParticipantUserById.get(participant.userId);
      const assignment = user?.roleAssignments.find((candidate) => candidate.id === participant.roleAssignmentId);
      return { ...participant, displayName: user?.displayName ?? "Unavailable actor", email: user?.email ?? null, roleName: assignment?.role.name ?? "Unavailable role", roleCode: assignment?.role.code ?? null };
    });
    const activityScope = selectedDraft
      ? { OR: [{ entityType: "InventoryPilotConfigurationDraft", entityId: selectedDraft.id }] }
      : selectedRevision
        ? { OR: [
            { entityType: "InventoryPilotConfigurationRevision", entityId: selectedRevision.id },
            ...(selectedRevision.sealedDraft ? [{ entityType: "InventoryPilotConfigurationDraft", entityId: selectedRevision.sealedDraft.id }] : []),
          ] }
        : null;
    const [activityTotal, activityItems] = activityScope ? await Promise.all([
      prisma.auditEvent.count({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, ...activityScope } }),
      prisma.auditEvent.findMany({ where: { tenantId: session.context.tenantId, companyId: session.context.companyId, ...activityScope }, select: { id: true, eventType: true, entityType: true, entityId: true, occurredAt: true, actorUserId: true, actor: { select: { displayName: true } }, beforeData: true, afterData: true, metadata: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (input.activityPage - 1) * input.activityPageSize, take: input.activityPageSize }),
    ]) : [0, []];
    const itemCategoryRows = await prisma.itemCategory.findMany({
      where: { tenantId: session.context.tenantId, companyId: session.context.companyId, status: "ACTIVE" },
      select: { id: true, categoryCode: true, categoryName: true },
      orderBy: [{ categoryCode: "asc" }, { id: "asc" }],
      take: 201,
    });
    const mfaFresh = getAuthMode() === "local" ? isMfaAssuranceFresh({ assuranceLevel: liveSession.assuranceLevel, mfaAuthenticatedAt: liveSession.mfaAuthenticatedAt, freshnessMinutes: getMfaStepUpMinutes() }) : Boolean(await hasVerifiedPrivilegedMfaEvidence(session));
    const actorSeparated = !selectedDraft || isInventoryPilotSealActorSeparated(selectedDraft, session.user.id);
    return {
      company: { id: company.id, name: company.tradingName ?? company.legalName, timezone: company.timezone },
      revisionQueuePage: pageEnvelope(revisionQueueItems, input.queuePage, input.queuePageSize, draftTotal + revisionTotal),
      draftsPage: pageEnvelope(drafts, input.queuePage, input.queuePageSize, draftTotal),
      sealedRevisionsPage: pageEnvelope(sealedRevisions, input.queuePage, input.queuePageSize, revisionTotal),
      selectedDraft,
      selectedRevision,
      selectedEndpointDetails,
      selectedItemDetails,
      selectedParticipantDetails,
      candidateEndpoints: pageEnvelope(candidateEndpointItems, input.endpointPage, input.endpointPageSize, endpointTotal),
      candidateItems: pageEnvelope(candidateItemItems, input.itemPage, input.itemPageSize, itemTotal),
      itemCategories: { items: itemCategoryRows.slice(0, 200).map((category) => ({ id: category.id, label: `${category.categoryCode} — ${category.categoryName}` })), capped: itemCategoryRows.length > 200 },
      candidateUsers,
      candidateRules: pageEnvelope(candidateRuleItems.map((rule) => ({ ...rule, family: inventoryPilotConfigurationReadinessFamilies.find((family) => familyTransactionTypes[family] === rule.transactionType) ?? null })), input.rulePage, input.rulePageSize, ruleTotal),
      activityPage: pageEnvelope(activityItems, input.activityPage, input.activityPageSize, activityTotal),
      readiness,
      canView: true,
      canDraft: granted.has(permissions.inventoryPilotConfigurationDraft),
      canSeal: granted.has(permissions.inventoryPilotConfigurationSeal),
      sealEligibility: {
        mfaFresh,
        actorSeparated,
        blockedReasons: [
          ...(!granted.has(permissions.inventoryPilotConfigurationSeal) ? [inventoryPilotConfigurationStableErrors.permissionDenied] : []),
          ...(!mfaFresh ? [inventoryPilotConfigurationStableErrors.mfaRequired] : []),
          ...(!actorSeparated ? [inventoryPilotConfigurationStableErrors.editorCannotSeal] : []),
          ...(readiness.blocking ? [inventoryPilotConfigurationStableErrors.readinessBlocked] : []),
        ],
      },
      selectionContract: { mode: "FULL_NORMALIZED_SNAPSHOT" as const, selectedItemIds: selectionItemIds, selectedEndpointMemberships: selectionEndpoints.map((row) => ({ capability: row.capability, inventoryLocationId: row.inventoryLocationId })) },
      informationalLabels: {
        readiness: "Seal-time readiness evidence only; live authorization and approval routing remain authoritative.",
        seal: "Sealing does not activate workflows or create inventory, custody, approval, or financial effects.",
        successor: "A successor governs only future eligible cohorts; existing records remain pinned to their original revision.",
      },
    };
  } catch (error) { throw translateBoundaryError(error); }
}
