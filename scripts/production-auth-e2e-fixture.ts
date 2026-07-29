import { createCipheriv, randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

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
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
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
  for (const byte of randomBytes(bytes)) bits += byte.toString(2).padStart(8, "0");
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
  const rows = await prisma.$queryRaw<Array<{ database_name: string; run_id: string; nonce_sha256: string }>>`
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

async function provision() {
  await assertDisposableMarker();
  const tenantCode = process.env.OGFI_PRODUCTION_AUTH_E2E_TENANT_CODE ?? "ogfi";
  const privilegedEmail = process.env.OGFI_PRODUCTION_AUTH_E2E_PRIVILEGED_EMAIL ?? process.env.DEMO_ADMIN_EMAIL ?? "admin@example.test";
  const branchEmail = process.env.OGFI_PRODUCTION_AUTH_E2E_BRANCH_EMAIL ?? "user@example.test";
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
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!privilegedUser) throw new Error("PRODUCTION_AUTH_E2E_PRIVILEGED_USER_NOT_FOUND");
  const permissionCodes = new Set(
    privilegedUser.roleAssignments.flatMap((assignment) =>
      assignment.role.permissions.map(({ permission }) => permission.code),
    ),
  );
  if (!permissionCodes.has("core.administer")) {
    throw new Error("PRODUCTION_AUTH_E2E_PRIVILEGED_USER_REQUIRED");
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
  const [privilegedPasswordHash, branchPasswordHash] = await Promise.all([privilegedPassword, branchPassword].map((password) => hash(password, {
    algorithm: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  })));
  const secret = randomBase32Secret();
  const now = new Date();
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
      create: { authIdentityId: identity.id, passwordHash: privilegedPasswordHash, requiresChange: false },
      update: { passwordHash: privilegedPasswordHash, requiresChange: false, passwordChangedAt: now },
    });
    await tx.mfaAuthenticator.updateMany({
      where: { tenantId: privilegedUser.tenantId, userId: privilegedUser.id, status: "ACTIVE" },
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
      where: { tenantId_provider_normalizedIdentifier: { tenantId: branchUser.tenantId, provider: "LOCAL", normalizedIdentifier: branchUser.email.toLowerCase() } },
      create: { tenantId: branchUser.tenantId, userId: branchUser.id, provider: "LOCAL", normalizedIdentifier: branchUser.email.toLowerCase(), status: "ACTIVE" },
      update: { userId: branchUser.id, status: "ACTIVE" },
    });
    await tx.passwordCredential.upsert({
      where: { authIdentityId: branchIdentity.id },
      create: { authIdentityId: branchIdentity.id, passwordHash: branchPasswordHash, requiresChange: false },
      update: { passwordHash: branchPasswordHash, requiresChange: false, passwordChangedAt: now },
    });
  });
  const fixtureFile = required("OGFI_PRODUCTION_AUTH_E2E_FIXTURE_FILE");
  await writeFile(
    fixtureFile,
    `${JSON.stringify({ tenantCode: privilegedUser.tenant.loginCode, branch: { email: branchUser.email, password: branchPassword }, privileged: { email: privilegedUser.email, password: privilegedPassword, totpSecret: secret } })}\n`,
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
