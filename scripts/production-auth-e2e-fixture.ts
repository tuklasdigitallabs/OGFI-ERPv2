import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { requestInventoryPilotBootstrap } from "../apps/web/tests/helpers/inventoryPilotApprovalPgBootstrapClient";
import { createSealedApprovalRuleFixture } from "../apps/web/tests/helpers/approvalRulePgFixtures";
import { configureApprovalStepRouting } from "../apps/web/src/server/services/approvalRouting";
import { approvalRoutingPolicies } from "../apps/web/src/server/services/approvalRoutingRegistry";

const prisma = new PrismaClient();

function assertFixtureRuntimeAdmission() {
  const ordinaryProductionLane =
    process.env.APP_ENV === "production" &&
    process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "false" &&
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "false" &&
    process.env.APPROVAL_ROUTING_V1_ENABLED === "false";
  const boundedUatLane =
    process.env.APP_ENV === "uat" &&
    process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "true" &&
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true" &&
    process.env.APPROVAL_ROUTING_V1_ENABLED === "false";
  if (
    process.env.CI !== "true" ||
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_MODE !== "local" ||
    (!ordinaryProductionLane && !boundedUatLane)
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_RUNTIME_NOT_ADMITTED");
  }
  if (
    required("AUTHORIZATION_TEST_RUN_ID") !==
    required("OGFI_DISPOSABLE_DATABASE_RUN_ID")
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_RUN_ID_MISMATCH");
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(required("APP_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY_INVALID");
  return key;
}

function encrypt(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    secretIv: iv.toString("base64"),
    secretAuthTag: cipher.getAuthTag().toString("base64"),
    keyVersion: Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? "1"),
  };
}

function randomBase32Secret(bytes = 20) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of randomBytes(bytes))
    bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let index = 0; index + 5 <= bits.length; index += 5) {
    encoded += alphabet[Number.parseInt(bits.slice(index, index + 5), 2)];
  }
  return encoded;
}

async function assertDisposableMarker() {
  const expectedName = required("OGFI_DISPOSABLE_DATABASE_EXPECTED_NAME");
  const expectedRunId = required("OGFI_DISPOSABLE_DATABASE_RUN_ID");
  const expectedNonce = required("OGFI_DISPOSABLE_DATABASE_NONCE_SHA256");
  const rows = await prisma.$queryRaw<
    Array<{ database_name: string; run_id: string; nonce_sha256: string }>
  >`
    SELECT database_name, run_id, nonce_sha256
      FROM ogfi_disposable_control.verify_database_identity()`;
  const marker = rows[0];
  if (
    rows.length !== 1 ||
    !marker ||
    marker.database_name !== expectedName ||
    marker.run_id !== expectedRunId ||
    marker.nonce_sha256 !== expectedNonce
  ) {
    throw new Error("PRODUCTION_AUTH_E2E_DISPOSABLE_MARKER_MISMATCH");
  }
}

async function createInventoryApprovalWorklistFixture(input: {
  tenantId: string;
  companyId: string;
  brandId: string | null;
  locationId: string;
  approverUserId: string;
  requesterUserId: string;
}) {
  const permissionCode = "purchasing.purchase_request.approve";
  const ruleId = randomUUID();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  await createSealedApprovalRuleFixture(prisma, {
    data: {
      id: ruleId,
      tenantId: input.tenantId,
      companyId: input.companyId,
      transactionType: `PRODUCTION_AUTH_APPROVAL_WORKLIST_${suffix}`,
      priority: 1,
    },
  });

  const approvals: Array<{
    approvalInstanceId: string;
    sourceId: string;
    publicReference: string;
  }> = [];
  for (let index = 1; index <= 11; index += 1) {
    const sourceId = randomUUID();
    const approvalInstanceId = randomUUID();
    const approvalStepId = randomUUID();
    const publicReference = `PR-UAT-${suffix}-${String(index).padStart(2, "0")}`;
    await prisma.purchaseRequest.create({
      data: {
        id: sourceId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        brandId: input.brandId,
        requestLocationId: input.locationId,
        requesterUserId: input.requesterUserId,
        publicReference,
        requiredDate: new Date(Date.now() + (index + 2) * 24 * 60 * 60_000),
        urgency: index === 1 ? "HIGH" : "NORMAL",
        justification:
          index === 1
            ? "Prevent unexplained high-risk beef stock loss before branch replenishment."
            : `Pagination fixture purchase request ${index}.`,
        status: "PENDING_APPROVAL",
        currentApprovalStep: 1,
        lines: {
          create: {
            lineNumber: 1,
            description:
              index === 1
                ? "High-risk beef inventory control line"
                : `Approval worklist fixture line ${index}`,
            requestedQty: index === 1 ? 12.5 : index,
            estimatedUnitCost: index === 1 ? 500 : 100,
            estimatedLineTotal: index === 1 ? 6250 : index * 100,
            uomCode: index === 1 ? "KG" : "EA",
            purpose:
              index === 1
                ? "Controlled branch replenishment"
                : "Server pagination evidence",
            notes: index === 1 ? "Review quantity, value, scope, and route before approval." : null,
          },
        },
      },
    });
    await prisma.approvalInstance.create({
      data: {
        id: approvalInstanceId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        documentType: "PurchaseRequest",
        documentId: sourceId,
        approvalRuleId: ruleId,
        status: "PENDING",
        currentStepOrder: 1,
        steps: {
          create: {
            id: approvalStepId,
            stepOrder: 1,
            assignedUserId: input.approverUserId,
            status: "PENDING",
          },
        },
      },
    });
    await prisma.$transaction((tx) =>
      configureApprovalStepRouting(tx, {
        approvalInstanceStepId: approvalStepId,
        tenantId: input.tenantId,
        companyId: input.companyId,
        routingPolicy: approvalRoutingPolicies.PurchaseRequest,
        requiredPermissionCode: permissionCode,
        activatedAt: new Date(),
        dueAt: new Date(Date.now() + 24 * 60 * 60_000),
        scopeGroups: [
          {
            groupOrder: 1,
            targetMatchMode: "ANY",
            targets: [
              {
                scopeType: "LOCATION",
                companyId: input.companyId,
                brandId: input.brandId,
                locationId: input.locationId,
              },
            ],
          },
        ],
        prohibitedActors: [
          { userId: input.requesterUserId, reasonCode: "REQUESTER" },
        ],
        activationAudit: {
          actorUserId: null,
          source: "production-authenticated-approval-worklist-fixture",
        },
      }),
    );
    approvals.push({ approvalInstanceId, sourceId, publicReference });
  }

  const target = approvals[0];
  if (!target) throw new Error("PRODUCTION_AUTH_E2E_APPROVAL_FIXTURE_EMPTY");
  return {
    targetApprovalInstanceId: target.approvalInstanceId,
    targetSourceId: target.sourceId,
    targetPublicReference: target.publicReference,
    targetRequesterUserId: input.requesterUserId,
    targetLocationId: input.locationId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    fixtureApprovalInstanceIds: approvals.map(({ approvalInstanceId }) =>
      approvalInstanceId,
    ),
    expectedMinimumPending: approvals.length,
  };
}

async function provision() {
  assertFixtureRuntimeAdmission();
  await assertDisposableMarker();
  const provisioningNow = new Date();
  const tenantCode = process.env.OGFI_PRODUCTION_AUTH_E2E_TENANT_CODE ?? "ogfi";
  const privilegedEmail =
    process.env.OGFI_PRODUCTION_AUTH_E2E_PRIVILEGED_EMAIL ??
    process.env.DEMO_ADMIN_EMAIL ??
    "erp.admin@ogfi.example";
  const branchEmail =
    process.env.OGFI_PRODUCTION_AUTH_E2E_BRANCH_EMAIL ??
    process.env.DEMO_USER_EMAIL ??
    "storekeeper.bgc@ogfi.example";
  const privilegedUser = await prisma.user.findFirst({
    where: {
      email: { equals: privilegedEmail, mode: "insensitive" },
      status: "ACTIVE",
      tenant: { loginCode: tenantCode, status: "ACTIVE" },
    },
    include: {
      tenant: { select: { id: true, loginCode: true } },
      roleAssignments: {
        where: { status: "ACTIVE" },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
      scopeAssignments: {
        where: {
          status: "ACTIVE",
          scopeType: "LOCATION",
          accessLevel: { in: ["APPROVE", "MANAGE"] },
          startsAt: { lte: provisioningNow },
          AND: [
            { OR: [{ endsAt: null }, { endsAt: { gt: provisioningNow } }] },
          ],
        },
        orderBy: { startsAt: "asc" },
        select: { scopeId: true },
      },
    },
  });
  if (!privilegedUser)
    throw new Error("PRODUCTION_AUTH_E2E_PRIVILEGED_USER_NOT_FOUND");
  const permissionCodes = new Set(
    privilegedUser.roleAssignments.flatMap((assignment) =>
      assignment.role.permissions.map(({ permission }) => permission.code),
    ),
  );
  if (!permissionCodes.has("core.administer")) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVILEGED_USER_REQUIRED");
  }
  if (!permissionCodes.has("purchasing.purchase_request.approve")) {
    throw new Error("PRODUCTION_AUTH_E2E_APPROVER_PERMISSION_REQUIRED");
  }
  const branchUser = await prisma.user.findFirst({
    where: {
      email: { equals: branchEmail, mode: "insensitive" },
      tenantId: privilegedUser.tenantId,
      status: "ACTIVE",
    },
  });
  if (!branchUser) throw new Error("PRODUCTION_AUTH_E2E_BRANCH_USER_NOT_FOUND");
  const privilegedPassword = randomBytes(32).toString("base64url");
  const branchPassword = randomBytes(32).toString("base64url");
  const [privilegedPasswordHash, branchPasswordHash] = await Promise.all(
    [privilegedPassword, branchPassword].map((password) =>
      hash(password, {
        algorithm: 2,
        memoryCost: 65_536,
        timeCost: 3,
        parallelism: 1,
        outputLen: 32,
      }),
    ),
  );
  const secret = randomBase32Secret();
  const now = provisioningNow;
  await prisma.$transaction(async (tx) => {
    const identity = await tx.authIdentity.upsert({
      where: {
        tenantId_provider_normalizedIdentifier: {
          tenantId: privilegedUser.tenantId,
          provider: "LOCAL",
          normalizedIdentifier: privilegedUser.email.toLowerCase(),
        },
      },
      create: {
        tenantId: privilegedUser.tenantId,
        userId: privilegedUser.id,
        provider: "LOCAL",
        normalizedIdentifier: privilegedUser.email.toLowerCase(),
        status: "ACTIVE",
      },
      update: { userId: privilegedUser.id, status: "ACTIVE" },
    });
    await tx.passwordCredential.upsert({
      where: { authIdentityId: identity.id },
      create: {
        authIdentityId: identity.id,
        passwordHash: privilegedPasswordHash,
        requiresChange: false,
      },
      update: {
        passwordHash: privilegedPasswordHash,
        requiresChange: false,
        passwordChangedAt: now,
      },
    });
    await tx.mfaAuthenticator.updateMany({
      where: {
        tenantId: privilegedUser.tenantId,
        userId: privilegedUser.id,
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: now },
    });
    await tx.mfaAuthenticator.create({
      data: {
        tenantId: privilegedUser.tenantId,
        userId: privilegedUser.id,
        label: "CI production authenticated browser fixture",
        status: "ACTIVE",
        verifiedAt: now,
        ...encrypt(secret),
      },
    });
    const branchIdentity = await tx.authIdentity.upsert({
      where: {
        tenantId_provider_normalizedIdentifier: {
          tenantId: branchUser.tenantId,
          provider: "LOCAL",
          normalizedIdentifier: branchUser.email.toLowerCase(),
        },
      },
      create: {
        tenantId: branchUser.tenantId,
        userId: branchUser.id,
        provider: "LOCAL",
        normalizedIdentifier: branchUser.email.toLowerCase(),
        status: "ACTIVE",
      },
      update: { userId: branchUser.id, status: "ACTIVE" },
    });
    await tx.passwordCredential.upsert({
      where: { authIdentityId: branchIdentity.id },
      create: {
        authIdentityId: branchIdentity.id,
        passwordHash: branchPasswordHash,
        requiresChange: false,
      },
      update: {
        passwordHash: branchPasswordHash,
        requiresChange: false,
        passwordChangedAt: now,
      },
    });
  });
  const approvalWorklist =
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true"
      ? await (async () => {
          const locationScope = privilegedUser.scopeAssignments[0];
          if (!locationScope) {
            throw new Error("PRODUCTION_AUTH_E2E_APPROVER_LOCATION_SCOPE_REQUIRED");
          }
          const location = await prisma.location.findFirst({
            where: {
              id: locationScope.scopeId,
              tenantId: privilegedUser.tenantId,
              status: "ACTIVE",
            },
            select: { id: true, companyId: true, brandId: true },
          });
          if (!location) {
            throw new Error("PRODUCTION_AUTH_E2E_APPROVER_LOCATION_REQUIRED");
          }
          return createInventoryApprovalWorklistFixture({
            tenantId: privilegedUser.tenantId,
            companyId: location.companyId,
            brandId: location.brandId,
            locationId: location.id,
            approverUserId: privilegedUser.id,
            requesterUserId: branchUser.id,
          });
        })()
      : undefined;
  const inventoryPilotConfiguration = await requestInventoryPilotBootstrap({
    action: "CONFIGURATION_V2_SEALED",
  });
  const fixtureFile = required("OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE");
  await writeFile(
    fixtureFile,
    `${JSON.stringify({ tenantCode: privilegedUser.tenant.loginCode, branch: { email: branchUser.email, password: branchPassword }, privileged: { email: privilegedUser.email, password: privilegedPassword, totpSecret: secret }, inventoryPilotConfiguration, ...(approvalWorklist ? { approvalWorklist } : {}) })}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  await chmod(fixtureFile, 0o600);
}

if (process.argv[2] !== "provision") {
  throw new Error("PRODUCTION_AUTH_E2E_FIXTURE_COMMAND_INVALID");
}

provision()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
