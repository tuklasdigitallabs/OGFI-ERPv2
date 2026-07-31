import { createHash, randomUUID } from "node:crypto";
import { PrismaClient, prisma } from "@ogfi/database";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";
import type { SessionContext } from "../src/server/services/context";
import {
  canonicalOpeningInventoryJson,
  requestOpeningInventoryExecutionCommand,
} from "../src/server/services/openingInventoryCutovers";
import {
  requestInventoryPilotBootstrap,
} from "./helpers/inventoryPilotApprovalPgBootstrapClient";
import { createSealedApprovalRuleFixture } from "./helpers/approvalRulePgFixtures";
import { permissions } from "../src/server/services/authorization";

/**
 * The normal authorization guard rejects secondary credentials. This suite
 * attests the ordinary runtime connection independently, then constructs its
 * dedicated executor client below. The extra URL is only injected by the
 * matching disposable lifecycle suite.
 */
function runtimeSafetyEnvironment() {
  const environment = { ...process.env };
  delete environment.OPENING_STOCK_EXECUTOR_DATABASE_URL;
  return environment;
}

const runPg = process.env.RUN_OPENING_INVENTORY_CUTOVER_PG_TESTS === "true";
const pgDescribe = runPg ? describe : describe.skip;
const expectedDatabase = runPg
  ? assertDisposableAuthorizationDatabaseConfigured(runtimeSafetyEnvironment())
  : null;
const executorUrl = process.env.OPENING_STOCK_EXECUTOR_DATABASE_URL;

type Fixture = {
  tenantId: string;
  companyId: string;
  cohortId: string;
  cutoverId: string;
  positiveItemId: string;
  zeroItemId: string;
  inventoryLocationId: string;
  uomId: string;
  postingUserId: string;
  secondaryCutoverId?: string;
  secondaryInventoryLocationId?: string;
  freezer: SessionContext;
  stager: SessionContext;
  activator: SessionContext;
  reverser: SessionContext;
  creatorExecutor: SessionContext;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function session(input: {
  tenantId: string;
  companyId: string;
  locationId: string;
  userId: string;
  sessionId: string;
  permissionCodes: string[];
  authorizedLocationIds?: string[];
}): SessionContext {
  return {
    user: {
      id: input.userId,
      email: `${input.userId}@opening-cutover.test`,
      displayName: "Opening cutover test actor",
      role: "Opening inventory test control",
    },
    context: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Opening inventory test company",
      brandId: "",
      brandName: "Company-wide",
      locationId: input.locationId,
      locationName: "Opening inventory test location",
      locationType: "BRANCH",
    },
    authorizedLocations: (input.authorizedLocationIds ?? [input.locationId]).map((locationId, index) => ({
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: "Opening inventory test company",
      brandId: "",
      brandName: "Company-wide",
      locationId,
      locationName: "Opening inventory test location",
      locationType: "BRANCH" as const,
      scopeAssignmentId: `opening-cutover-scope-${input.userId}-${index}`,
      accessLevel: "MANAGE" as const,
    })),
    permissionCodes: input.permissionCodes,
    authentication: {
      sessionId: input.sessionId,
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: new Date(),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000),
    },
  };
}

/**
 * This is intentionally a runtime-only fixture. It models an already
 * normalized, independently approved source because the public approval
 * action is cookie-bound; commands themselves are always requested through
 * the service and executed only by the isolated executor role.
 */
async function createApprovedFixture(options: { twoLocations?: boolean } = {}): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const effectiveAt = new Date(now.getTime() - 60_000);
  const cutoffAt = new Date(now.getTime() - 120_000);
  const expiresAt = new Date(now.getTime() + 60 * 60_000);
  const ids = Object.fromEntries([
    "tenantId", "companyId", "locationId", "inventoryLocationId", "secondaryLocationId", "secondaryInventoryLocationId", "uomId", "categoryId",
    "positiveItemId", "zeroItemId", "cohortCreatorId", "cutoverRequesterId", "counterId", "countReviewerId",
    "operationsApproverId", "accountingApproverId", "freezerId", "stagerId", "activatorId",
    "reverserId", "revisionId", "cohortId", "stockCountSessionId", "stockCountAttemptId",
    "positiveAttemptLineId", "zeroAttemptLineId", "cutoverId", "approvalRuleId", "approvalId",
    "operationsStepId", "accountingStepId", "attachmentId", "controlledEvidenceId",
    "secondaryStockCountSessionId", "secondaryStockCountAttemptId", "secondaryPositiveAttemptLineId", "secondaryZeroAttemptLineId",
    "secondaryCutoverId", "secondaryApprovalId", "secondaryOperationsStepId", "secondaryAccountingStepId",
  ].map((key) => [key, randomUUID()])) as Record<string, string>;

  const commandPermissionCodes = [
    permissions.openingInventoryRequestExecute,
    permissions.openingInventoryRequestActivate,
    permissions.openingInventoryRequestReverse,
  ];
  const requiredPermissionCodes = [
    permissions.openingInventoryOperationsReview,
    permissions.openingInventoryAccountingReview,
    ...commandPermissionCodes,
  ];
  const permissionRows = await prisma.permission.findMany({
    where: { code: { in: requiredPermissionCodes } },
    select: { id: true, code: true },
  });
  expect(permissionRows).toHaveLength(requiredPermissionCodes.length);
  const permissionId = new Map(permissionRows.map((row) => [row.code, row.id]));

  await prisma.tenant.create({ data: { id: ids.tenantId, name: `Opening cutover ${suffix}`, loginCode: `oic-${suffix}` } });
  await prisma.company.create({ data: { id: ids.companyId, tenantId: ids.tenantId, code: `OIC-${suffix}`, legalName: `Opening cutover ${suffix}`, currencyCode: "PHP" } });
  await prisma.location.create({ data: { id: ids.locationId, tenantId: ids.tenantId, companyId: ids.companyId, locationType: "BRANCH", code: `OIC-L-${suffix}`, name: "Opening cutover branch" } });
  await prisma.inventoryLocation.create({ data: { id: ids.inventoryLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, code: `OIC-I-${suffix}`, name: "Opening cutover inventory", status: "ACTIVE" } });
  if (options.twoLocations) {
    await prisma.location.create({ data: { id: ids.secondaryLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationType: "BRANCH", code: `OIC-L2-${suffix}`, name: "Opening cutover second branch" } });
    await prisma.inventoryLocation.create({ data: { id: ids.secondaryInventoryLocationId, tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.secondaryLocationId, code: `OIC-I2-${suffix}`, name: "Opening cutover second inventory", status: "ACTIVE" } });
  }
  await prisma.uom.create({ data: { id: ids.uomId, tenantId: ids.tenantId, companyId: ids.companyId, uomCode: `EA-${suffix}`, uomName: "Each", uomType: "COUNT" } });
  await prisma.itemCategory.create({ data: { id: ids.categoryId, tenantId: ids.tenantId, companyId: ids.companyId, categoryCode: `OIC-C-${suffix}`, categoryName: "Opening cutover category", inventoryClass: "STOCK" } });
  await prisma.item.createMany({ data: [
    { id: ids.positiveItemId, tenantId: ids.tenantId, companyId: ids.companyId, itemCode: `OIC-P-${suffix}`, itemName: "Opening positive item", itemCategoryId: ids.categoryId, itemType: "INVENTORY", baseUomId: ids.uomId, purchaseUomId: ids.uomId, issueUomId: ids.uomId, trackInventory: true },
    { id: ids.zeroItemId, tenantId: ids.tenantId, companyId: ids.companyId, itemCode: `OIC-Z-${suffix}`, itemName: "Opening zero item", itemCategoryId: ids.categoryId, itemType: "INVENTORY", baseUomId: ids.uomId, purchaseUomId: ids.uomId, issueUomId: ids.uomId, trackInventory: true },
  ] });

  const people = [
    ids.cohortCreatorId, ids.cutoverRequesterId, ids.counterId, ids.countReviewerId, ids.operationsApproverId,
    ids.accountingApproverId, ids.freezerId, ids.stagerId, ids.activatorId, ids.reverserId,
  ];
  await prisma.user.createMany({ data: people.map((id, index) => ({
    id, tenantId: ids.tenantId, email: `oic-${suffix}-${index}@example.test`, displayName: `Opening actor ${index}`, status: "ACTIVE", privilegeEpoch: 0,
  })) });

  const roleIds = Object.fromEntries(["operations", "accounting", "execute", "activate", "reverse"].map((key) => [key, randomUUID()])) as Record<string, string>;
  await prisma.role.createMany({ data: [
    { id: roleIds.operations, tenantId: ids.tenantId, code: `OIC_OPERATIONS_${suffix}`, name: "Opening operations" },
    { id: roleIds.accounting, tenantId: ids.tenantId, code: `OIC_ACCOUNTING_${suffix}`, name: "Opening accounting" },
    { id: roleIds.execute, tenantId: ids.tenantId, code: `OIC_EXECUTE_${suffix}`, name: "Opening execute requester" },
    { id: roleIds.activate, tenantId: ids.tenantId, code: `OIC_ACTIVATE_${suffix}`, name: "Opening activate requester" },
    { id: roleIds.reverse, tenantId: ids.tenantId, code: `OIC_REVERSE_${suffix}`, name: "Opening reverse requester" },
  ] });
  await prisma.rolePermission.createMany({ data: [
    { roleId: roleIds.operations, permissionId: permissionId.get(permissions.openingInventoryOperationsReview)! },
    { roleId: roleIds.accounting, permissionId: permissionId.get(permissions.openingInventoryAccountingReview)! },
    { roleId: roleIds.execute, permissionId: permissionId.get(permissions.openingInventoryRequestExecute)! },
    { roleId: roleIds.activate, permissionId: permissionId.get(permissions.openingInventoryRequestActivate)! },
    { roleId: roleIds.reverse, permissionId: permissionId.get(permissions.openingInventoryRequestReverse)! },
  ] });
  await prisma.userRoleAssignment.createMany({ data: [
    { userId: ids.operationsApproverId, roleId: roleIds.operations, startsAt: cutoffAt },
    { userId: ids.accountingApproverId, roleId: roleIds.accounting, startsAt: cutoffAt },
    { userId: ids.freezerId, roleId: roleIds.execute, startsAt: cutoffAt },
    { userId: ids.stagerId, roleId: roleIds.execute, startsAt: cutoffAt },
    { userId: ids.activatorId, roleId: roleIds.activate, startsAt: cutoffAt },
    { userId: ids.reverserId, roleId: roleIds.reverse, startsAt: cutoffAt },
    { userId: ids.cohortCreatorId, roleId: roleIds.execute, startsAt: cutoffAt },
  ] });
  const authorizedLocationIds = options.twoLocations
    ? [ids.locationId, ids.secondaryLocationId]
    : [ids.locationId];
  await prisma.userScopeAssignment.createMany({ data: [
    ids.operationsApproverId, ids.accountingApproverId, ids.freezerId, ids.stagerId, ids.activatorId, ids.reverserId, ids.cohortCreatorId,
  ].flatMap((userId) => authorizedLocationIds.map((scopeId) => ({ userId, scopeType: "LOCATION", scopeId, accessLevel: "MANAGE", startsAt: cutoffAt }))) });

  const authSessionIds = new Map(people.map((id) => [id, randomUUID()]));
  await prisma.authSession.createMany({ data: people.map((userId) => ({
    id: authSessionIds.get(userId)!, tenantId: ids.tenantId, userId, tokenHash: `oic-${suffix}-${userId}`,
    status: "ACTIVE", assuranceLevel: "MFA", mfaAuthenticatedAt: now, privilegeEpochAtIssue: 0,
    idleExpiresAt: expiresAt, absoluteExpiresAt: expiresAt,
  })) });
  await prisma.privilegedMfaEnrollment.createMany({
    data: [ids.freezerId, ids.stagerId, ids.activatorId, ids.reverserId].map(
      (targetUserId) => ({
        id: randomUUID(),
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        targetUserId,
        providerName: `OPENING-CUTOVER-${suffix}`,
        status: "VERIFIED",
        evidenceReference: `OPENING-CUTOVER-MFA-${suffix}-${targetUserId}`,
        attestationNote: "Disposable opening-cutover MFA evidence.",
        attestedByUserId: ids.accountingApproverId,
        verifiedByUserId: ids.accountingApproverId,
        verificationNote: "Disposable fixture verification.",
        verifiedAt: now,
      }),
    ),
  });

  const revision = await requestInventoryPilotBootstrap({
    action: "OPENING_INITIALIZE",
    tenantId: ids.tenantId,
    companyId: ids.companyId,
    actorUserId: ids.cohortCreatorId,
    locations: authorizedLocationIds.map((locationId) => ({
      locationId,
      inventoryLocationId: locationId === ids.locationId ? ids.inventoryLocationId : ids.secondaryInventoryLocationId,
    })),
    itemIds: [ids.positiveItemId, ids.zeroItemId],
  });
  if (!revision) throw new Error("OPENING_INVENTORY_PILOT_BOOTSTRAP_RESULT_MISSING");
  ids.revisionId = revision.id;
  const configurationDigest = revision.configurationDigest;

  const cohortCanonicalJson = canonicalOpeningInventoryJson({
    configurationRevisionId: ids.revisionId, configurationRevisionNumber: 1, configurationDigest,
    effectiveAt, endpointInventoryLocationIds: options.twoLocations
      ? [ids.inventoryLocationId, ids.secondaryInventoryLocationId].sort()
      : [ids.inventoryLocationId], itemIds: [ids.positiveItemId, ids.zeroItemId].sort(),
    predecessorCohortId: null, generation: 1,
  });
  await prisma.openingInventoryCohort.create({ data: {
    id: ids.cohortId, tenantId: ids.tenantId, companyId: ids.companyId, configurationRevisionId: ids.revisionId,
    configurationRevisionNumber: 1, configurationDigest, publicReference: `OIC-${suffix}`, generation: 1,
    effectiveAt, status: "DRAFT", canonicalJson: cohortCanonicalJson, cohortDigest: sha256(cohortCanonicalJson),
    createdByUserId: ids.cohortCreatorId,
  } });

  await prisma.stockCountSession.create({ data: {
    id: ids.stockCountSessionId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
    publicReference: `OIC-SC-${suffix}`, countType: "OPENING", status: "REVIEWED", freezeMovements: true,
    cutoffAt, startedAt: cutoffAt, submittedAt: cutoffAt, reviewedAt: cutoffAt,
    createdByUserId: ids.cutoverRequesterId, assignedToUserId: ids.counterId, reviewedByUserId: ids.countReviewerId,
  } });
  await prisma.stockCountAttempt.create({ data: {
    id: ids.stockCountAttemptId, stockCountSessionId: ids.stockCountSessionId, tenantId: ids.tenantId, companyId: ids.companyId,
    inventoryLocationId: ids.inventoryLocationId, attemptNumber: 1, status: "REVIEWED", freezeMovements: true,
    cutoffAt, startedAt: cutoffAt, submittedAt: cutoffAt, reviewedAt: cutoffAt, evidenceReference: "controlled opening count evidence",
    createdByUserId: ids.cutoverRequesterId, assignedToUserId: ids.counterId, reviewedByUserId: ids.countReviewerId,
  } });
  await prisma.stockCountSession.update({
    where: { id: ids.stockCountSessionId },
    data: { currentAttemptId: ids.stockCountAttemptId },
  });
  await prisma.stockCountAttemptLine.createMany({ data: [
    { id: ids.positiveAttemptLineId, stockCountAttemptId: ids.stockCountAttemptId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId, itemId: ids.positiveItemId, uomId: ids.uomId, lineNumber: 1, lotKey: "NOLOT|NOEXP", systemQuantityBaseUom: 0, countedQuantityBaseUom: 7, varianceQuantityBaseUom: 7, countedByUserId: ids.counterId, countedAt: cutoffAt },
    { id: ids.zeroAttemptLineId, stockCountAttemptId: ids.stockCountAttemptId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId, itemId: ids.zeroItemId, uomId: ids.uomId, lineNumber: 2, lotKey: "NOLOT|NOEXP", systemQuantityBaseUom: 0, countedQuantityBaseUom: 0, varianceQuantityBaseUom: 0, countedByUserId: ids.counterId, countedAt: cutoffAt },
  ] });
  if (options.twoLocations) {
    await prisma.stockCountSession.create({ data: {
      id: ids.secondaryStockCountSessionId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.secondaryInventoryLocationId,
      publicReference: `OIC-SC2-${suffix}`, countType: "OPENING", status: "REVIEWED", freezeMovements: true,
      cutoffAt, startedAt: cutoffAt, submittedAt: cutoffAt, reviewedAt: cutoffAt,
      createdByUserId: ids.cutoverRequesterId, assignedToUserId: ids.counterId, reviewedByUserId: ids.countReviewerId,
    } });
    await prisma.stockCountAttempt.create({ data: {
      id: ids.secondaryStockCountAttemptId, stockCountSessionId: ids.secondaryStockCountSessionId, tenantId: ids.tenantId, companyId: ids.companyId,
      inventoryLocationId: ids.secondaryInventoryLocationId, attemptNumber: 1, status: "REVIEWED", freezeMovements: true,
      cutoffAt, startedAt: cutoffAt, submittedAt: cutoffAt, reviewedAt: cutoffAt, evidenceReference: "controlled opening count evidence",
      createdByUserId: ids.cutoverRequesterId, assignedToUserId: ids.counterId, reviewedByUserId: ids.countReviewerId,
    } });
    await prisma.stockCountSession.update({ where: { id: ids.secondaryStockCountSessionId }, data: { currentAttemptId: ids.secondaryStockCountAttemptId } });
    await prisma.stockCountAttemptLine.createMany({ data: [
      { id: ids.secondaryPositiveAttemptLineId, stockCountAttemptId: ids.secondaryStockCountAttemptId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.secondaryInventoryLocationId, itemId: ids.positiveItemId, uomId: ids.uomId, lineNumber: 1, lotKey: "NOLOT|NOEXP", systemQuantityBaseUom: 0, countedQuantityBaseUom: 11, varianceQuantityBaseUom: 11, countedByUserId: ids.counterId, countedAt: cutoffAt },
      { id: ids.secondaryZeroAttemptLineId, stockCountAttemptId: ids.secondaryStockCountAttemptId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.secondaryInventoryLocationId, itemId: ids.zeroItemId, uomId: ids.uomId, lineNumber: 2, lotKey: "NOLOT|NOEXP", systemQuantityBaseUom: 0, countedQuantityBaseUom: 0, varianceQuantityBaseUom: 0, countedByUserId: ids.counterId, countedAt: cutoffAt },
    ] });
  }

  const objectVersionId = `oic-version-${suffix}`;
  const checksum = sha256(`oic-evidence-${suffix}`);
  await prisma.attachment.create({ data: {
    id: ids.attachmentId, tenantId: ids.tenantId, companyId: ids.companyId, storageEnvironment: "LOCAL_DEVELOPMENT",
    storageProvider: "disposable", objectKey: `opening/${suffix}`, objectVersionId, originalFilename: "opening-count.txt",
    mimeType: "text/plain", detectedMimeType: "text/plain", sizeBytes: 1, checksum, detectedChecksum: checksum,
    uploadState: "VERIFIED", scanState: "CLEAN", availabilityState: "AVAILABLE", physicalState: "DURABLE",
    scanVerifiedObjectVersionId: objectVersionId, uploadVerifiedAt: cutoffAt,
    scanCompletedAt: cutoffAt, availableAt: cutoffAt, status: "ACTIVE",
    uploadedByUserId: ids.cohortCreatorId,
  } });
  await prisma.attachmentScanAttempt.create({ data: {
    id: randomUUID(), tenantId: ids.tenantId, companyId: ids.companyId, attachmentId: ids.attachmentId, objectVersionId,
    scanProvider: "disposable", scannerEngineVersion: "1", signatureVersion: "1", startedAt: cutoffAt, completedAt: cutoffAt,
    result: "CLEAN", plaintextChecksum: checksum,
  } });
  await prisma.controlledEvidenceAttachment.create({ data: {
    id: ids.controlledEvidenceId, tenantId: ids.tenantId, companyId: ids.companyId, sourceType: "OPENING_INVENTORY_COHORT",
    sourceRecordId: ids.cohortId, sourceKey: `opening-cohort-${ids.cohortId}`, attachmentId: ids.attachmentId,
    purpose: "EVIDENCE", status: "ACTIVE", createdByUserId: ids.cohortCreatorId,
  } });

  const evidenceManifestJson = canonicalOpeningInventoryJson([{
    controlledEvidenceAttachmentId: ids.controlledEvidenceId, attachmentId: ids.attachmentId, objectVersionId, checksum,
  }]);
  const sourceLines = [
    { itemId: ids.positiveItemId, attemptLineId: ids.positiveAttemptLineId, lineNumber: 1, quantity: 7, unitCost: 3 },
    { itemId: ids.zeroItemId, attemptLineId: ids.zeroAttemptLineId, lineNumber: 2, quantity: 0, unitCost: 0 },
  ];
  const cutoverLineFacts = sourceLines.map((line) => {
    const lineCanonicalJson = canonicalOpeningInventoryJson({
      expiryDate: null, itemId: line.itemId, lineNumber: line.lineNumber, lotKey: "NOLOT|NOEXP", lotNumber: null,
      openingQuantityBaseUom: line.quantity, openingValue: line.quantity * line.unitCost,
      sourceCountedQuantityBaseUom: line.quantity, sourceSystemQuantityBaseUom: 0, sourceVarianceQuantityBaseUom: line.quantity,
      stockCountAttemptLineId: line.attemptLineId, unitCost: line.unitCost, uomId: ids.uomId,
    });
    return { ...line, lineCanonicalJson, lineDigest: sha256(lineCanonicalJson) };
  });
  const valuationCanonicalJson = canonicalOpeningInventoryJson(cutoverLineFacts
    .map((line) => ({ itemId: line.itemId, lotKey: "NOLOT|NOEXP", unitCost: line.unitCost }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId)));
  const valuationDigest = sha256(valuationCanonicalJson);
  const cutoverCanonicalJson = canonicalOpeningInventoryJson({
    attemptCutoffAt: cutoffAt, cutoverVersion: 2, evidenceDigest: sha256(evidenceManifestJson),
    lines: cutoverLineFacts.map((line) => ({ lineCanonicalJson: JSON.parse(line.lineCanonicalJson), lineDigest: line.lineDigest, lineNumber: line.lineNumber })),
    sessionCutoffAt: cutoffAt, stockCountAttemptId: ids.stockCountAttemptId, valuationDigest,
  });
  const cutoverDigest = sha256(cutoverCanonicalJson);
  await prisma.openingInventoryCutover.create({ data: {
    id: ids.cutoverId, cohortId: ids.cohortId, tenantId: ids.tenantId, companyId: ids.companyId,
    inventoryLocationId: ids.inventoryLocationId, locationId: ids.locationId, stockCountSessionId: ids.stockCountSessionId,
    stockCountAttemptId: ids.stockCountAttemptId, status: "DRAFT", idempotencyKey: `opening-cutover-${suffix}`,
    evidenceManifestJson, evidenceDigest: sha256(evidenceManifestJson), valuationCanonicalJson, valuationDigest,
    cutoverCanonicalJson, cutoverDigest, requestedByUserId: ids.cutoverRequesterId,
  } });
  await prisma.openingInventoryCutoverLine.createMany({ data: cutoverLineFacts.map((line) => ({
    id: randomUUID(), cutoverId: ids.cutoverId, tenantId: ids.tenantId, companyId: ids.companyId,
    inventoryLocationId: ids.inventoryLocationId, itemId: line.itemId, uomId: ids.uomId,
    stockCountAttemptId: ids.stockCountAttemptId, stockCountAttemptLineId: line.attemptLineId, lineNumber: line.lineNumber,
    lotKey: "NOLOT|NOEXP", sourceSystemQuantityBaseUom: 0, sourceCountedQuantityBaseUom: line.quantity,
    sourceVarianceQuantityBaseUom: line.quantity, openingQuantityBaseUom: line.quantity, unitCost: line.unitCost,
    openingValue: line.quantity * line.unitCost, lineCanonicalJson: line.lineCanonicalJson, lineDigest: line.lineDigest,
  })) });

  await createSealedApprovalRuleFixture(prisma, { data: {
    id: ids.approvalRuleId, tenantId: ids.tenantId, companyId: ids.companyId, transactionType: "OpeningInventoryCutover",
    definitionSealed: true, isActive: true,
  } });
  await prisma.approvalInstance.create({ data: {
    id: ids.approvalId, tenantId: ids.tenantId, companyId: ids.companyId, documentType: "OpeningInventoryCutover",
    documentId: ids.cutoverId, approvalRuleId: ids.approvalRuleId, status: "APPROVED", currentStepOrder: 2,
  } });
  await prisma.approvalInstanceStep.createMany({ data: [
    { id: ids.operationsStepId, approvalInstanceId: ids.approvalId, stepOrder: 1, status: "APPROVED", actedAt: cutoffAt, activatedAt: cutoffAt, actedByUserId: ids.operationsApproverId, requiredPermissionId: permissionId.get(permissions.openingInventoryOperationsReview)! },
    { id: ids.accountingStepId, approvalInstanceId: ids.approvalId, stepOrder: 2, status: "APPROVED", actedAt: cutoffAt, activatedAt: cutoffAt, actedByUserId: ids.accountingApproverId, requiredPermissionId: permissionId.get(permissions.openingInventoryAccountingReview)! },
  ] });
  await prisma.openingInventoryCutover.update({ where: { id: ids.cutoverId }, data: { status: "PENDING_APPROVAL", approvalInstanceId: ids.approvalId, version: 2 } });
  for (const [stepOrder, actorId, stepId, permissionCode] of [
    [1, ids.operationsApproverId, ids.operationsStepId, permissions.openingInventoryOperationsReview],
    [2, ids.accountingApproverId, ids.accountingStepId, permissions.openingInventoryAccountingReview],
  ] as const) {
    const mfaValidUntil = expiresAt;
    const requiredPermissionId = permissionId.get(permissionCode)!;
    const authSessionId = authSessionIds.get(actorId)!;
    const canonicalJson = canonicalOpeningInventoryJson({
      approvalInstanceId: ids.approvalId,
      approvalInstanceStepId: stepId,
      attestationVersion: 1,
      actedAt: cutoffAt,
      authSessionId,
      cutoverDigest,
      cutoverId: ids.cutoverId,
      decision: "APPROVED",
      decisionActorUserId: actorId,
      inventoryLocationId: ids.inventoryLocationId,
      mfaMode: "runtime_mfa",
      mfaValidUntil,
      mfaVerifiedAt: now,
      privilegeEpochAtIssue: 0,
      requiredPermissionCode: permissionCode,
      requiredPermissionId,
      stepOrder,
    });
    await prisma.openingInventoryApprovalAttestation.create({ data: {
      id: randomUUID(), cutoverId: ids.cutoverId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.inventoryLocationId,
      approvalInstanceId: ids.approvalId, approvalInstanceStepId: stepId, stepOrder, decisionActorUserId: actorId,
      requiredPermissionId, requiredPermissionCode: permissionCode,
      authSessionId, privilegeEpochAtIssue: 0, mfaVerifiedAt: now, mfaMode: "runtime_mfa",
      mfaValidUntil, decision: "APPROVED", actedAt: cutoffAt, canonicalJson, attestationDigest: sha256(canonicalJson),
    } });
  }
  if (options.twoLocations) {
    const secondarySourceLines = [
      { itemId: ids.positiveItemId, attemptLineId: ids.secondaryPositiveAttemptLineId, lineNumber: 1, quantity: 11, unitCost: 3 },
      { itemId: ids.zeroItemId, attemptLineId: ids.secondaryZeroAttemptLineId, lineNumber: 2, quantity: 0, unitCost: 0 },
    ];
    const secondaryLineFacts = secondarySourceLines.map((line) => {
      const lineCanonicalJson = canonicalOpeningInventoryJson({
        expiryDate: null, itemId: line.itemId, lineNumber: line.lineNumber, lotKey: "NOLOT|NOEXP", lotNumber: null,
        openingQuantityBaseUom: line.quantity, openingValue: line.quantity * line.unitCost,
        sourceCountedQuantityBaseUom: line.quantity, sourceSystemQuantityBaseUom: 0, sourceVarianceQuantityBaseUom: line.quantity,
        stockCountAttemptLineId: line.attemptLineId, unitCost: line.unitCost, uomId: ids.uomId,
      });
      return { ...line, lineCanonicalJson, lineDigest: sha256(lineCanonicalJson) };
    });
    const secondaryValuationCanonicalJson = canonicalOpeningInventoryJson(secondaryLineFacts
      .map((line) => ({ itemId: line.itemId, lotKey: "NOLOT|NOEXP", unitCost: line.unitCost }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)));
    const secondaryValuationDigest = sha256(secondaryValuationCanonicalJson);
    const secondaryCanonicalJson = canonicalOpeningInventoryJson({
      attemptCutoffAt: cutoffAt, cutoverVersion: 2, evidenceDigest: sha256(evidenceManifestJson),
      lines: secondaryLineFacts.map((line) => ({ lineCanonicalJson: JSON.parse(line.lineCanonicalJson), lineDigest: line.lineDigest, lineNumber: line.lineNumber })),
      sessionCutoffAt: cutoffAt, stockCountAttemptId: ids.secondaryStockCountAttemptId, valuationDigest: secondaryValuationDigest,
    });
    const secondaryDigest = sha256(secondaryCanonicalJson);
    await prisma.openingInventoryCutover.create({ data: {
      id: ids.secondaryCutoverId, cohortId: ids.cohortId, tenantId: ids.tenantId, companyId: ids.companyId,
      inventoryLocationId: ids.secondaryInventoryLocationId, locationId: ids.secondaryLocationId, stockCountSessionId: ids.secondaryStockCountSessionId,
      stockCountAttemptId: ids.secondaryStockCountAttemptId, status: "DRAFT", idempotencyKey: `opening-cutover-2-${suffix}`,
      evidenceManifestJson, evidenceDigest: sha256(evidenceManifestJson), valuationCanonicalJson: secondaryValuationCanonicalJson, valuationDigest: secondaryValuationDigest,
      cutoverCanonicalJson: secondaryCanonicalJson, cutoverDigest: secondaryDigest, requestedByUserId: ids.cutoverRequesterId,
    } });
    await prisma.openingInventoryCutoverLine.createMany({ data: secondaryLineFacts.map((line) => ({
      id: randomUUID(), cutoverId: ids.secondaryCutoverId, tenantId: ids.tenantId, companyId: ids.companyId,
      inventoryLocationId: ids.secondaryInventoryLocationId, itemId: line.itemId, uomId: ids.uomId,
      stockCountAttemptId: ids.secondaryStockCountAttemptId, stockCountAttemptLineId: line.attemptLineId, lineNumber: line.lineNumber,
      lotKey: "NOLOT|NOEXP", sourceSystemQuantityBaseUom: 0, sourceCountedQuantityBaseUom: line.quantity,
      sourceVarianceQuantityBaseUom: line.quantity, openingQuantityBaseUom: line.quantity, unitCost: line.unitCost,
      openingValue: line.quantity * line.unitCost, lineCanonicalJson: line.lineCanonicalJson, lineDigest: line.lineDigest,
    })) });
    await prisma.approvalInstance.create({ data: {
      id: ids.secondaryApprovalId, tenantId: ids.tenantId, companyId: ids.companyId, documentType: "OpeningInventoryCutover",
      documentId: ids.secondaryCutoverId, approvalRuleId: ids.approvalRuleId, status: "APPROVED", currentStepOrder: 2,
    } });
    await prisma.approvalInstanceStep.createMany({ data: [
      { id: ids.secondaryOperationsStepId, approvalInstanceId: ids.secondaryApprovalId, stepOrder: 1, status: "APPROVED", actedAt: cutoffAt, activatedAt: cutoffAt, actedByUserId: ids.operationsApproverId, requiredPermissionId: permissionId.get(permissions.openingInventoryOperationsReview)! },
      { id: ids.secondaryAccountingStepId, approvalInstanceId: ids.secondaryApprovalId, stepOrder: 2, status: "APPROVED", actedAt: cutoffAt, activatedAt: cutoffAt, actedByUserId: ids.accountingApproverId, requiredPermissionId: permissionId.get(permissions.openingInventoryAccountingReview)! },
    ] });
    await prisma.openingInventoryCutover.update({
      where: { id: ids.secondaryCutoverId },
      data: { status: "PENDING_APPROVAL", approvalInstanceId: ids.secondaryApprovalId, version: 2 },
    });
    for (const [stepOrder, actorId, stepId, permissionCode] of [
      [1, ids.operationsApproverId, ids.secondaryOperationsStepId, permissions.openingInventoryOperationsReview],
      [2, ids.accountingApproverId, ids.secondaryAccountingStepId, permissions.openingInventoryAccountingReview],
    ] as const) {
      const authSessionId = authSessionIds.get(actorId)!;
      const requiredPermissionId = permissionId.get(permissionCode)!;
      const canonicalJson = canonicalOpeningInventoryJson({
        approvalInstanceId: ids.secondaryApprovalId, approvalInstanceStepId: stepId, attestationVersion: 1, actedAt: cutoffAt,
        authSessionId, cutoverDigest: secondaryDigest, cutoverId: ids.secondaryCutoverId, decision: "APPROVED",
        decisionActorUserId: actorId, inventoryLocationId: ids.secondaryInventoryLocationId, mfaMode: "runtime_mfa",
        mfaValidUntil: expiresAt, mfaVerifiedAt: now, privilegeEpochAtIssue: 0,
        requiredPermissionCode: permissionCode, requiredPermissionId, stepOrder,
      });
      await prisma.openingInventoryApprovalAttestation.create({ data: {
        id: randomUUID(), cutoverId: ids.secondaryCutoverId, tenantId: ids.tenantId, companyId: ids.companyId, inventoryLocationId: ids.secondaryInventoryLocationId,
        approvalInstanceId: ids.secondaryApprovalId, approvalInstanceStepId: stepId, stepOrder, decisionActorUserId: actorId,
        requiredPermissionId, requiredPermissionCode: permissionCode, authSessionId, privilegeEpochAtIssue: 0,
        mfaVerifiedAt: now, mfaMode: "runtime_mfa", mfaValidUntil: expiresAt, decision: "APPROVED", actedAt: cutoffAt,
        canonicalJson, attestationDigest: sha256(canonicalJson),
      } });
    }
    await prisma.openingInventoryCutover.update({ where: { id: ids.secondaryCutoverId }, data: { status: "APPROVED", approvedAt: cutoffAt, approvalInstanceId: ids.secondaryApprovalId, version: 3 } });
  }
  await prisma.openingInventoryCutover.update({ where: { id: ids.cutoverId }, data: { status: "APPROVED", approvedAt: cutoffAt, version: 3 } });
  await prisma.openingInventoryCohort.update({ where: { id: ids.cohortId }, data: { status: "SEALED", sealedByUserId: ids.cohortCreatorId, sealedAt: cutoffAt, version: 2 } });
  await prisma.companyPolicySetting.createMany({ data: [
    { tenantId: ids.tenantId, companyId: ids.companyId, key: "inventory.opening_cutover.max_count_age_minutes", category: "inventory", label: "Maximum opening count age", description: "Disposable executor test", value: 60, defaultValue: 60, valueType: "INTEGER", sourceDecisionId: "DEC-0263", isDefault: false, status: "ACTIVE", updatedByUserId: ids.cohortCreatorId },
    { tenantId: ids.tenantId, companyId: ids.companyId, key: "inventory.opening_cutover.max_freeze_minutes", category: "inventory", label: "Maximum opening freeze", description: "Disposable executor test", value: 60, defaultValue: 60, valueType: "INTEGER", sourceDecisionId: "DEC-0263", isDefault: false, status: "ACTIVE", updatedByUserId: ids.cohortCreatorId },
  ] });

  return {
    tenantId: ids.tenantId, companyId: ids.companyId,
    cohortId: ids.cohortId, cutoverId: ids.cutoverId, positiveItemId: ids.positiveItemId, zeroItemId: ids.zeroItemId,
    inventoryLocationId: ids.inventoryLocationId, uomId: ids.uomId, postingUserId: ids.cohortCreatorId,
    ...(options.twoLocations ? { secondaryCutoverId: ids.secondaryCutoverId, secondaryInventoryLocationId: ids.secondaryInventoryLocationId } : {}),
    freezer: session({ tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, userId: ids.freezerId, sessionId: authSessionIds.get(ids.freezerId)!, permissionCodes: [permissions.openingInventoryRequestExecute], authorizedLocationIds }),
    stager: session({ tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, userId: ids.stagerId, sessionId: authSessionIds.get(ids.stagerId)!, permissionCodes: [permissions.openingInventoryRequestExecute], authorizedLocationIds }),
    activator: session({ tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, userId: ids.activatorId, sessionId: authSessionIds.get(ids.activatorId)!, permissionCodes: [permissions.openingInventoryRequestActivate], authorizedLocationIds }),
    reverser: session({ tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, userId: ids.reverserId, sessionId: authSessionIds.get(ids.reverserId)!, permissionCodes: [permissions.openingInventoryRequestReverse], authorizedLocationIds }),
    creatorExecutor: session({ tenantId: ids.tenantId, companyId: ids.companyId, locationId: ids.locationId, userId: ids.cohortCreatorId, sessionId: authSessionIds.get(ids.cohortCreatorId)!, permissionCodes: [permissions.openingInventoryRequestExecute], authorizedLocationIds }),
  };
}

async function execute(executor: { $queryRaw: PrismaClient["$queryRaw"] }, commandId: string) {
  const rows = await executor.$queryRaw<Array<{ result: string }>>`
    SELECT public.execute_opening_inventory_command(${commandId}::uuid) AS result
  `;
  return rows[0]?.result;
}

async function waitForDatabaseBlock(blockedPid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<Array<{ blockerCount: number }>>`
      SELECT pg_catalog.cardinality(pg_catalog.pg_blocking_pids(${blockedPid}::integer))::integer AS "blockerCount"
    `;
    if (rows[0]?.blockerCount && rows[0].blockerCount > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("OPENING_INVENTORY_EXPECTED_DATABASE_LOCK_NOT_OBSERVED");
}

function rawMovementData(
  fixture: Fixture,
  input: {
    inventoryLocationId?: string;
    relatedInventoryLocationId?: string;
    quantity?: number;
    movementType?: "ADJUSTMENT_IN" | "TRANSFER_OUT";
  } = {},
) {
  const quantity = input.quantity ?? 1;
  const movementType = input.movementType ?? "ADJUSTMENT_IN";
  return {
    tenantId: fixture.tenantId,
    companyId: fixture.companyId,
    inventoryLocationId: input.inventoryLocationId ?? fixture.inventoryLocationId,
    relatedInventoryLocationId: input.relatedInventoryLocationId,
    itemId: fixture.positiveItemId,
    movementType,
    occurredAt: new Date(),
    enteredQuantity: Math.abs(quantity),
    enteredUomId: fixture.uomId,
    quantityDeltaBaseUom: quantity,
    baseUomId: fixture.uomId,
    sourceDocumentType: "OpeningInventoryConcurrencyProbe",
    sourceDocumentId: randomUUID(),
    sourceEventKey: `probe-${randomUUID()}`,
    postedByUserId: fixture.postingUserId,
  } as const;
}

async function command(
  fixture: Fixture,
  actor: SessionContext,
  commandType: "FREEZE_COHORT" | "STAGE_LOCATION" | "ACTIVATE_COHORT" | "REVERSE_LOCATION",
  input: { cohortVersion: number; cutoverVersion?: number; cutoverId?: string; key: string },
) {
  return requestOpeningInventoryExecutionCommand({
    cohortId: fixture.cohortId,
    ...(commandType === "STAGE_LOCATION" || commandType === "REVERSE_LOCATION"
      ? { cutoverId: input.cutoverId ?? fixture.cutoverId, expectedCutoverVersion: input.cutoverVersion }
      : {}),
    expectedCohortVersion: input.cohortVersion,
    idempotencyKey: input.key,
    reason: `Disposable cutover ${commandType} verification`,
  }, commandType, actor);
}

async function directCommandData(
  fixture: Fixture,
  commandType: "FREEZE_COHORT" | "STAGE_LOCATION",
  target: { cutoverId: string | null; expectedCutoverVersion: number | null },
) {
  const requester = fixture.stager;
  const authSession = await prisma.authSession.findUniqueOrThrow({
    where: { id: requester.authentication!.sessionId },
    select: {
      id: true,
      privilegeEpochAtIssue: true,
      mfaAuthenticatedAt: true,
      idleExpiresAt: true,
      absoluteExpiresAt: true,
    },
  });
  const idempotencyKey = `direct-command-${randomUUID()}`;
  const requestReason = `Disposable direct ${commandType} target guard`;
  const requiredPermissionCode = permissions.openingInventoryRequestExecute;
  const canonicalJson = canonicalOpeningInventoryJson({
    cohortId: fixture.cohortId,
    commandType,
    companyId: fixture.companyId,
    cutoverId: target.cutoverId,
    expectedCohortVersion: 2,
    expectedCutoverVersion: target.expectedCutoverVersion,
    idempotencyKey,
    reason: requestReason,
    requestedAuthSessionId: authSession.id,
    requestedByUserId: requester.user.id,
    requestedMfaMode: "runtime_mfa",
    requestedMfaValidUntil: new Date(Math.min(
      authSession.idleExpiresAt.getTime(),
      authSession.absoluteExpiresAt.getTime(),
    )),
    requestedMfaVerifiedAt: authSession.mfaAuthenticatedAt!,
    requestedPrivilegeEpoch: authSession.privilegeEpochAtIssue,
    requiredPermissionCode,
    tenantId: fixture.tenantId,
  });
  return {
    cohortId: fixture.cohortId,
    cutoverId: target.cutoverId,
    tenantId: fixture.tenantId,
    companyId: fixture.companyId,
    commandType,
    status: "PENDING" as const,
    idempotencyKey,
    expectedCohortVersion: 2,
    expectedCutoverVersion: target.expectedCutoverVersion,
    canonicalJson,
    commandDigest: sha256(canonicalJson),
    requestedByUserId: requester.user.id,
    requestedAuthSessionId: authSession.id,
    requestedPrivilegeEpoch: authSession.privilegeEpochAtIssue,
    requestedMfaVerifiedAt: authSession.mfaAuthenticatedAt!,
    requestedMfaMode: "runtime_mfa",
    requestedMfaValidUntil: new Date(Math.min(
      authSession.idleExpiresAt.getTime(),
      authSession.absoluteExpiresAt.getTime(),
    )),
    requiredPermissionCode,
    requestReason,
  };
}

pgDescribe("DEC-0263 opening-inventory cutover PostgreSQL executor boundary", () => {
  let executor: PrismaClient | null = null;

  beforeAll(async () => {
    await prisma.$connect();
    await assertDisposableAuthorizationDatabaseMarker(prisma, runtimeSafetyEnvironment());
    const database = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    expect(database).toEqual([{ currentDatabase: expectedDatabase }]);
    if (executorUrl) {
      expect(executorUrl).not.toBe(process.env.DATABASE_URL);
      executor = new PrismaClient({ datasources: { db: { url: executorUrl } } });
      await executor.$connect();
    }
  });

  afterAll(async () => {
    await executor?.$disconnect();
    await prisma.$disconnect();
  });

  test("does not grant the runtime principal the isolated posting routine", async () => {
    const rows = await prisma.$queryRaw<Array<{ mayExecute: boolean }>>`
      SELECT has_function_privilege(current_user, 'public.execute_opening_inventory_command(uuid)', 'EXECUTE') AS "mayExecute"
    `;
    expect(rows).toEqual([{ mayExecute: false }]);
  });

  test("rejects direct malformed cohort and location command target shapes before creating command activity", async () => {
    const fixture = await createApprovedFixture();
    const auditWhere = {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      eventType: "opening_inventory.execution_command_requested",
    };
    const [commandsBefore, auditsBefore] = await Promise.all([
      prisma.openingInventoryExecutionCommand.count({ where: { cohortId: fixture.cohortId } }),
      prisma.auditEvent.count({ where: auditWhere }),
    ]);
    await expect(prisma.openingInventoryExecutionCommand.create({
      data: await directCommandData(fixture, "FREEZE_COHORT", {
        cutoverId: fixture.cutoverId,
        expectedCutoverVersion: 3,
      }),
    })).rejects.toThrow(/OPENING_INVENTORY_COMMAND_COHORT_TARGET_INVALID/i);
    await expect(prisma.openingInventoryExecutionCommand.create({
      data: await directCommandData(fixture, "STAGE_LOCATION", {
        cutoverId: null,
        expectedCutoverVersion: null,
      }),
    })).rejects.toThrow(/OPENING_INVENTORY_COMMAND_LOCATION_TARGET_INVALID/i);
    await expect(Promise.all([
      prisma.openingInventoryExecutionCommand.count({ where: { cohortId: fixture.cohortId } }),
      prisma.auditEvent.count({ where: auditWhere }),
    ])).resolves.toEqual([commandsBefore, auditsBefore]);
  });

  test("serializes distinct-key concurrent semantic requests into one unresolved command and audit", async () => {
    const fixture = await createApprovedFixture();
    const auditWhere = {
      tenantId: fixture.tenantId,
      companyId: fixture.companyId,
      eventType: "opening_inventory.execution_command_requested",
      entityType: "OpeningInventoryCohort",
      entityId: fixture.cohortId,
    };
    const results = await Promise.allSettled([
      command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: `same-action-a-${randomUUID()}` }),
      command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: `same-action-b-${randomUUID()}` }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: "OPENING_INVENTORY_COMMAND_IN_FLIGHT" }),
    });
    expect(await prisma.openingInventoryExecutionCommand.count({
      where: { cohortId: fixture.cohortId, commandType: "FREEZE_COHORT", status: "PENDING" },
    })).toBe(1);
    expect(await prisma.auditEvent.count({ where: auditWhere })).toBe(1);
  });

  test("allows one unresolved stage command per distinct location cutover", async () => {
    const fixture = await createApprovedFixture({ twoLocations: true });
    expect(fixture.secondaryCutoverId).toBeTruthy();
    const [first, second] = await Promise.all([
      command(fixture, fixture.stager, "STAGE_LOCATION", {
        cohortVersion: 2,
        cutoverVersion: 3,
        key: `stage-primary-${randomUUID()}`,
      }),
      command(fixture, fixture.stager, "STAGE_LOCATION", {
        cohortVersion: 2,
        cutoverId: fixture.secondaryCutoverId,
        cutoverVersion: 3,
        key: `stage-secondary-${randomUUID()}`,
      }),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(await prisma.openingInventoryExecutionCommand.count({
      where: {
        cohortId: fixture.cohortId,
        commandType: "STAGE_LOCATION",
        cutoverId: { in: [fixture.cutoverId, fixture.secondaryCutoverId!] },
        status: "PENDING",
      },
    })).toBe(2);
  });

  test.skipIf(!executorUrl)("releases a semantic command slot after terminal execution failure", async () => {
    const fixture = await createApprovedFixture();
    const failed = await command(fixture, fixture.stager, "STAGE_LOCATION", {
      cohortVersion: 2,
      cutoverVersion: 3,
      key: `stage-terminal-${randomUUID()}`,
    });
    expect(await execute(executor!, failed.id)).toBe("FAILED_TERMINAL");
    expect(await prisma.openingInventoryExecutionCommand.findUniqueOrThrow({
      where: { id: failed.id },
      select: { status: true },
    })).toEqual({ status: "FAILED_TERMINAL" });
    const retryAfterTerminal = await command(fixture, fixture.stager, "STAGE_LOCATION", {
      cohortVersion: 2,
      cutoverVersion: 3,
      key: `stage-terminal-retry-${randomUUID()}`,
    });
    expect(retryAfterTerminal.id).not.toBe(failed.id);
    expect(retryAfterTerminal.status).toBe("PENDING");
  });

  test.skipIf(!executorUrl)("stages without inventory mutation, activates once, and leaves zero-count lines absent", async () => {
    const fixture = await createApprovedFixture();
    const identity = await executor!.$queryRaw<Array<{ mayExecute: boolean; mayReadCommandTable: boolean }>>`
      SELECT has_function_privilege(current_user, 'public.execute_opening_inventory_command(uuid)', 'EXECUTE') AS "mayExecute",
             has_table_privilege(current_user, 'public."OpeningInventoryExecutionCommand"', 'SELECT') AS "mayReadCommandTable"
    `;
    expect(identity).toEqual([{ mayExecute: true, mayReadCommandTable: false }]);

    const freezeKey = `freeze-${randomUUID()}`;
    const [freeze, freezeReplay] = await Promise.all([
      command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: freezeKey }),
      command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: freezeKey }),
    ]);
    expect(freezeReplay.id).toBe(freeze.id);
    expect(await execute(executor!, freeze.id)).toBe("SUCCEEDED");
    const stage = await command(fixture, fixture.stager, "STAGE_LOCATION", { cohortVersion: 3, cutoverVersion: 3, key: `stage-${randomUUID()}` });
    expect(await execute(executor!, stage.id)).toBe("SUCCEEDED");
    expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId } })).toBe(0);
    expect(await prisma.inventoryBalance.count({ where: { inventoryLocationId: fixture.inventoryLocationId, itemId: { in: [fixture.positiveItemId, fixture.zeroItemId] } } })).toBe(0);

    const activate = await command(fixture, fixture.activator, "ACTIVATE_COHORT", { cohortVersion: 4, key: `activate-${randomUUID()}` });
    expect(await Promise.all([execute(executor!, activate.id), execute(executor!, activate.id)])).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId } })).toBe(1);
    const positiveBalance = await prisma.inventoryBalance.findFirst({ where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId } });
    expect(Number(positiveBalance?.qtyOnHand)).toBe(7);
    expect(await prisma.inventoryBalance.count({ where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.zeroItemId } })).toBe(0);

    const postedMovement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId },
    });
    await expect(prisma.inventoryBalance.create({ data: {
      id: randomUUID(), tenantId: positiveBalance!.tenantId, companyId: positiveBalance!.companyId,
      inventoryLocationId: positiveBalance!.inventoryLocationId, itemId: positiveBalance!.itemId,
      lotKey: `DENIED-${randomUUID()}`, baseUomId: positiveBalance!.baseUomId, qtyOnHand: 1,
    } })).rejects.toThrow(/permission denied/i);
    await expect(prisma.inventoryBalance.update({
      where: { id: positiveBalance!.id }, data: { qtyOnHand: 8 },
    })).rejects.toThrow(/permission denied/i);
    await expect(prisma.inventoryBalance.delete({
      where: { id: positiveBalance!.id },
    })).rejects.toThrow(/permission denied/i);

    const movementCountBeforeDeniedIssue = await prisma.inventoryMovement.count({
      where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId },
    });
    await expect(prisma.inventoryMovement.create({ data: {
      tenantId: postedMovement.tenantId, companyId: postedMovement.companyId,
      inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId,
      movementType: "ADJUSTMENT_OUT", occurredAt: new Date(), enteredQuantity: 8,
      enteredUomId: postedMovement.enteredUomId, quantityDeltaBaseUom: -8,
      baseUomId: postedMovement.baseUomId, sourceDocumentType: "DerivedCacheBoundaryProbe",
      sourceDocumentId: randomUUID(), sourceEventKey: `insufficient-${randomUUID()}`,
      postedByUserId: postedMovement.postedByUserId,
    } })).rejects.toThrow(/INVENTORY_BALANCE_METADATA_OR_QUANTITY_INVALID/i);
    expect(await prisma.inventoryMovement.count({
      where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId },
    })).toBe(movementCountBeforeDeniedIssue);
    expect(Number((await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: positiveBalance!.id } })).qtyOnHand)).toBe(7);
  });

  test.skipIf(!executorUrl)("rejects stale or conflicted runtime commands without a ledger mutation", async () => {
    const fixture = await createApprovedFixture();
    const before = await prisma.inventoryMovement.count({ where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId } });
    const freeze = await command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: `stale-${randomUUID()}` });
    await prisma.authSession.update({ where: { id: fixture.freezer.authentication!.sessionId }, data: { status: "REVOKED" } });
    expect(await execute(executor!, freeze.id)).toBe("FAILED_TERMINAL");
    expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId } })).toBe(before);
  });

  test.skipIf(!executorUrl)("makes pre-release supersession ledger-neutral and rejects custody or tamper attempts", async () => {
    const fixture = await createApprovedFixture();
    await expect(command(fixture, fixture.creatorExecutor, "FREEZE_COHORT", {
      cohortVersion: 2,
      key: `custody-${randomUUID()}`,
    })).rejects.toThrow("OPENING_INVENTORY_COMMAND_REQUESTER_CONFLICT");
    const capturedLine = await prisma.openingInventoryCutoverLine.findFirstOrThrow({
      where: { cutoverId: fixture.cutoverId, itemId: fixture.positiveItemId },
    });
    await expect(prisma.openingInventoryCutoverLine.update({
      where: { id: capturedLine.id },
      data: { lineDigest: "0".repeat(64) },
    })).rejects.toThrow(/permission denied|immutable|digest/i);
    expect((await prisma.openingInventoryCutoverLine.findUniqueOrThrow({
      where: { id: capturedLine.id },
      select: { lineDigest: true },
    })).lineDigest).toBe(capturedLine.lineDigest);

    const freeze = await command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: `freeze-supersede-${randomUUID()}` });
    expect(await execute(executor!, freeze.id)).toBe("SUCCEEDED");
    const stage = await command(fixture, fixture.stager, "STAGE_LOCATION", { cohortVersion: 3, cutoverVersion: 3, key: `stage-supersede-${randomUUID()}` });
    expect(await execute(executor!, stage.id)).toBe("SUCCEEDED");
    const reverse = await command(fixture, fixture.reverser, "REVERSE_LOCATION", { cohortVersion: 4, cutoverVersion: 4, key: `supersede-${randomUUID()}` });
    expect(await execute(executor!, reverse.id)).toBe("SUCCEEDED");
    expect(await prisma.inventoryMovement.count({ where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: fixture.cutoverId } })).toBe(0);
    expect(await prisma.inventoryBalance.count({ where: { inventoryLocationId: fixture.inventoryLocationId, itemId: { in: [fixture.positiveItemId, fixture.zeroItemId] } } })).toBe(0);
  });

  test.skipIf(!executorUrl)("drains an in-flight ordinary movement before freeze and then fails closed", async () => {
    const fixture = await createApprovedFixture();
    const freeze = await command(fixture, fixture.freezer, "FREEZE_COHORT", {
      cohortVersion: 2,
      key: `freeze-race-${randomUUID()}`,
    });
    let movementInserted!: () => void;
    let releaseMovement!: () => void;
    let executorPidReady!: (pid: number) => void;
    const inserted = new Promise<void>((resolve) => { movementInserted = resolve; });
    const release = new Promise<void>((resolve) => { releaseMovement = resolve; });
    const executorPid = new Promise<number>((resolve) => { executorPidReady = resolve; });
    const writer = prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({ data: rawMovementData(fixture) });
      movementInserted();
      await release;
    }, { timeout: 10_000 });
    await inserted;
    const freezeExecution = executor!.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_catalog.pg_backend_pid() AS pid`;
      executorPidReady(rows[0]!.pid);
      return execute(tx, freeze.id);
    }, { timeout: 10_000 });
    try {
      await waitForDatabaseBlock(await executorPid);
    } finally {
      releaseMovement();
    }
    await writer;
    expect(await freezeExecution).toBe("FAILED_TERMINAL");
    expect(await prisma.inventoryMovement.count({
      where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId },
    })).toBe(1);
    expect(Number((await prisma.inventoryBalance.findFirstOrThrow({
      where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId },
    })).qtyOnHand)).toBe(1);
    expect(await prisma.openingInventoryCohort.findUniqueOrThrow({
      where: { id: fixture.cohortId }, select: { status: true },
    })).toEqual({ status: "SEALED" });
  }, 15_000);

  test.skipIf(!executorUrl)("rejects an ordinary movement after freeze owns the location fence", async () => {
    const fixture = await createApprovedFixture();
    const freeze = await command(fixture, fixture.freezer, "FREEZE_COHORT", {
      cohortVersion: 2,
      key: `freeze-first-${randomUUID()}`,
    });
    expect(await execute(executor!, freeze.id)).toBe("SUCCEEDED");
    await expect(prisma.inventoryMovement.create({ data: rawMovementData(fixture) }))
      .rejects.toThrow(/OPENING_INVENTORY_CUTOVER_MOVEMENT_FENCE_ACTIVE/i);
    expect(await prisma.inventoryMovement.count({
      where: { inventoryLocationId: fixture.inventoryLocationId, itemId: fixture.positiveItemId },
    })).toBe(0);
  });

  test("locks opposing transfer endpoints in stable order without deadlock", async () => {
    const fixture = await createApprovedFixture({ twoLocations: true });
    await Promise.all([
      prisma.inventoryMovement.create({ data: rawMovementData(fixture, { inventoryLocationId: fixture.inventoryLocationId, quantity: 10 }) }),
      prisma.inventoryMovement.create({ data: rawMovementData(fixture, { inventoryLocationId: fixture.secondaryInventoryLocationId!, quantity: 10 }) }),
    ]);
    await Promise.all([
      prisma.inventoryMovement.create({ data: rawMovementData(fixture, {
        inventoryLocationId: fixture.inventoryLocationId,
        relatedInventoryLocationId: fixture.secondaryInventoryLocationId!,
        quantity: -1,
        movementType: "TRANSFER_OUT",
      }) }),
      prisma.inventoryMovement.create({ data: rawMovementData(fixture, {
        inventoryLocationId: fixture.secondaryInventoryLocationId!,
        relatedInventoryLocationId: fixture.inventoryLocationId,
        quantity: -1,
        movementType: "TRANSFER_OUT",
      }) }),
    ]);
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        inventoryLocationId: { in: [fixture.inventoryLocationId, fixture.secondaryInventoryLocationId!] },
        itemId: fixture.positiveItemId,
      },
      orderBy: { inventoryLocationId: "asc" },
    });
    expect(balances.map((balance) => Number(balance.qtyOnHand))).toEqual([9, 9]);
  });

  test.skipIf(!executorUrl)("rolls back the entire staged cohort when the second location cannot post", async () => {
    const fixture = await createApprovedFixture({ twoLocations: true });
    expect(fixture.secondaryCutoverId).toBeTruthy();
    expect(fixture.secondaryInventoryLocationId).toBeTruthy();

    const freeze = await command(fixture, fixture.freezer, "FREEZE_COHORT", { cohortVersion: 2, key: `freeze-two-${randomUUID()}` });
    expect(await execute(executor!, freeze.id)).toBe("SUCCEEDED");
    const firstStage = await command(fixture, fixture.stager, "STAGE_LOCATION", { cohortVersion: 3, cutoverVersion: 3, key: `stage-one-${randomUUID()}` });
    expect(await execute(executor!, firstStage.id)).toBe("SUCCEEDED");
    const secondStage = await command(fixture, fixture.stager, "STAGE_LOCATION", {
      cohortVersion: 3,
      cutoverId: fixture.secondaryCutoverId,
      cutoverVersion: 3,
      key: `stage-two-${randomUUID()}`,
    });
    expect(await execute(executor!, secondStage.id)).toBe("SUCCEEDED");

    await requestInventoryPilotBootstrap({
      action: "OPENING_INSTALL_INVENTORY_MOVEMENT_FAILURE",
      targetInventoryLocationId: fixture.secondaryInventoryLocationId!,
    });
    const activate = await command(fixture, fixture.activator, "ACTIVATE_COHORT", { cohortVersion: 4, key: `activate-rollback-${randomUUID()}` });
    expect(await execute(executor!, activate.id)).toBe("FAILED_TERMINAL");

    expect(await prisma.inventoryMovement.count({
      where: { sourceDocumentType: "OpeningInventoryCutover", sourceDocumentId: { in: [fixture.cutoverId, fixture.secondaryCutoverId!] } },
    })).toBe(0);
    expect(await prisma.inventoryBalance.count({
      where: { inventoryLocationId: { in: [fixture.inventoryLocationId, fixture.secondaryInventoryLocationId!] }, itemId: { in: [fixture.positiveItemId, fixture.zeroItemId] } },
    })).toBe(0);
    expect(await prisma.openingInventoryCutover.findMany({
      where: { id: { in: [fixture.cutoverId, fixture.secondaryCutoverId!] } },
      select: { status: true },
    })).toEqual(expect.arrayContaining([{ status: "RECONCILED" }, { status: "RECONCILED" }]));
    expect(await prisma.openingInventoryCohort.findUniqueOrThrow({ where: { id: fixture.cohortId }, select: { status: true } })).toEqual({ status: "STAGED" });
  });
});
