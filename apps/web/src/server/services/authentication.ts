import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { hash, verify } from "@node-rs/argon2";
import { prisma, type TransactionClient } from "@ogfi/database";
import { Secret, TOTP } from "otpauth";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { isSensitivePermissionCode } from "./rolePermissionCatalog";
import {
  completeSuccessfulAuthenticationAttemptInTransaction,
  loadAuthenticationThrottleConfig,
  reserveAuthenticationAttempt,
  reserveAuthenticationAttemptInTransaction,
  type AuthenticationThrottleReservation,
} from "./authenticationThrottle";
import {
  assertProductionArgon2WorkGateConfiguration,
  runWithArgon2WorkPermit,
} from "./argon2WorkGate";
import {
  recordDeniedDecisionInTransactionSafely,
  recordDeniedDecisionSafely,
} from "./authorizationDenials";

export const authModes = ["demo", "local"] as const;
export type AuthMode = (typeof authModes)[number];

// DEC-0050 keeps authorization-denial aggregation independent from the
// configurable authentication-throttle window.
export const AUTHENTICATION_DENIAL_AUDIT_WINDOW_MINUTES = 15;

type IntegerSetting = {
  name: string;
  fallback: number;
  minimum: number;
  maximum: number;
};

const authIntegerSettings = {
  sessionIdleMinutes: {
    name: "AUTH_SESSION_IDLE_MINUTES",
    fallback: 30,
    minimum: 5,
    maximum: 1_440,
  },
  sessionAbsoluteHours: {
    name: "AUTH_SESSION_ABSOLUTE_HOURS",
    fallback: 12,
    minimum: 1,
    maximum: 168,
  },
  mfaChallengeMinutes: {
    name: "AUTH_MFA_CHALLENGE_MINUTES",
    fallback: 10,
    minimum: 1,
    maximum: 30,
  },
  mfaChallengeLimit: {
    name: "AUTH_MFA_CHALLENGE_LIMIT",
    fallback: 5,
    minimum: 1,
    maximum: 20,
  },
  mfaStepUpMinutes: {
    name: "AUTH_MFA_STEP_UP_MINUTES",
    fallback: 15,
    minimum: 1,
    maximum: 60,
  },
} satisfies Record<string, IntegerSetting>;

export function readBoundedAuthInteger(setting: IntegerSetting) {
  const configured = process.env[setting.name];
  const value = configured === undefined ? setting.fallback : Number(configured);
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < setting.minimum ||
    value > setting.maximum
  ) {
    throw new Error(`${setting.name}_INVALID`);
  }
  return value;
}

export function getMfaStepUpMinutes() {
  return readBoundedAuthInteger(authIntegerSettings.mfaStepUpMinutes);
}

const sessionIdleMinutes = readBoundedAuthInteger(
  authIntegerSettings.sessionIdleMinutes,
);
const sessionAbsoluteHours = readBoundedAuthInteger(
  authIntegerSettings.sessionAbsoluteHours,
);
const mfaChallengeMinutes = readBoundedAuthInteger(
  authIntegerSettings.mfaChallengeMinutes,
);
const mfaChallengeLimit = readBoundedAuthInteger(
  authIntegerSettings.mfaChallengeLimit,
);
const recoveryCodeCount = 10;
const productionCookieName = "__Host-ogfi_session";
const developmentCookieName = "ogfi_session";

type RequestFingerprint = {
  sourceAddress: string;
  userAgent: string;
};

type MfaAuthenticatorSnapshot = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  encryptedSecret: string;
  secretIv: string;
  secretAuthTag: string;
  keyVersion: number;
  updatedAt: Date;
};

export function getTrustedRequestFingerprint(requestHeaders: Headers): RequestFingerprint {
  const trustedProxyMode = process.env.AUTH_TRUSTED_PROXY_MODE;
  if (trustedProxyMode === "caddy_single_hop") {
    const forwardedFor = requestHeaders.get("x-forwarded-for")?.trim() ?? "";
    if (!forwardedFor || forwardedFor.includes(",") || isIP(forwardedFor) === 0) {
      throw new Error("AUTH_TRUSTED_PROXY_SOURCE_INVALID");
    }
    return {
      sourceAddress: forwardedFor,
      userAgent: requestHeaders.get("user-agent") ?? "unknown",
    };
  }
  if (isProduction()) {
    throw new Error("AUTH_TRUSTED_PROXY_MODE_INVALID");
  }
  return {
    sourceAddress: "untrusted-direct",
    userAgent: requestHeaders.get("user-agent") ?? "unknown",
  };
}

function isProduction() {
  return (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function getAuthMode(): AuthMode {
  const configured =
    process.env.AUTH_MODE ?? (isProduction() ? "local" : "demo");
  if (!authModes.includes(configured as AuthMode)) {
    throw new Error("AUTH_MODE_INVALID");
  }
  if (isProduction() && configured !== "local") {
    throw new Error("PRODUCTION_DEMO_AUTH_FORBIDDEN");
  }
  return configured as AuthMode;
}

function requireAuthSecret() {
  const value = process.env.AUTH_SECRET ?? "";
  if (isProduction() && value.length < 32) {
    throw new Error("AUTH_SECRET_INVALID");
  }
  return value || "ogfi-development-auth-secret-not-for-production";
}

function decodeEncryptionKey(configured: string, variableName: string) {
  const decoded = Buffer.from(configured, "base64");
  if (decoded.length === 32) {
    return decoded;
  }
  if (isProduction()) {
    throw new Error(`${variableName}_INVALID`);
  }
  return createHash("sha256")
    .update(configured || requireAuthSecret())
    .digest();
}

function currentEncryptionKey() {
  return {
    key: decodeEncryptionKey(
      process.env.APP_ENCRYPTION_KEY ?? "",
      "APP_ENCRYPTION_KEY",
    ),
    version: Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? 1),
  };
}

function activationDeliveryConfiguration() {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = Number(process.env.SMTP_PORT ?? 0);
  const username = process.env.SMTP_USERNAME?.trim() ?? "";
  const password = process.env.SMTP_PASSWORD ?? "";
  const from = process.env.SMTP_FROM?.trim() ?? "";
  const security = process.env.SMTP_SECURITY?.trim().toLowerCase() ?? "";
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !username ||
    !password ||
    !from ||
    !appUrl ||
    !["implicit", "starttls"].includes(security) ||
    (security === "implicit" && port !== 465) ||
    (security === "starttls" && port === 465)
  ) {
    throw new Error("AUTH_ACTIVATION_DELIVERY_CONFIGURATION_INVALID");
  }
  if (isProduction() && !appUrl.startsWith("https://")) {
    throw new Error("AUTH_ACTIVATION_DELIVERY_URL_INSECURE");
  }
  return { host, port, username, password, from, appUrl, security };
}

function encryptionKeyForVersion(version: number) {
  const current = currentEncryptionKey();
  if (version === current.version) {
    return current.key;
  }
  const previousVersion = Number(
    process.env.APP_ENCRYPTION_PREVIOUS_KEY_VERSION ?? 0,
  );
  const previousKey = process.env.APP_ENCRYPTION_PREVIOUS_KEY ?? "";
  if (previousKey && version === previousVersion) {
    return decodeEncryptionKey(
      previousKey,
      "APP_ENCRYPTION_PREVIOUS_KEY",
    );
  }
  throw new Error("APP_ENCRYPTION_KEY_VERSION_UNAVAILABLE");
}

export function assertProductionAuthConfiguration() {
  getAuthMode();
  requireAuthSecret();
  Object.values(authIntegerSettings).forEach(readBoundedAuthInteger);
  assertProductionArgon2WorkGateConfiguration();
  const current = currentEncryptionKey();
  if (
    !Number.isInteger(current.version) ||
    current.version < 1 ||
    current.version > 2_147_483_647
  ) {
    throw new Error("APP_ENCRYPTION_KEY_VERSION_INVALID");
  }
  const previousKey = process.env.APP_ENCRYPTION_PREVIOUS_KEY ?? "";
  const previousVersionValue =
    process.env.APP_ENCRYPTION_PREVIOUS_KEY_VERSION ?? "";
  if (Boolean(previousKey) !== Boolean(previousVersionValue)) {
    throw new Error("APP_ENCRYPTION_PREVIOUS_KEY_PAIR_INVALID");
  }
  if (previousKey) {
    const previousVersion = Number(previousVersionValue);
    if (
      !Number.isInteger(previousVersion) ||
      previousVersion < 1 ||
      previousVersion > 2_147_483_647 ||
      previousVersion === current.version
    ) {
      throw new Error("APP_ENCRYPTION_PREVIOUS_KEY_VERSION_INVALID");
    }
    decodeEncryptionKey(previousKey, "APP_ENCRYPTION_PREVIOUS_KEY");
  }
  if (isProduction()) {
    if (process.env.AUTH_TRUSTED_PROXY_MODE !== "caddy_single_hop") {
      throw new Error("AUTH_TRUSTED_PROXY_MODE_INVALID");
    }
    loadAuthenticationThrottleConfig();
    activationDeliveryConfiguration();
  }
}

export function isSessionSecurityStateValid(input: {
  sessionTenantId: string;
  userTenantId: string;
  userActive: boolean;
  privilegeEpochAtIssue: number;
  currentPrivilegeEpoch: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return (
    input.userActive &&
    input.sessionTenantId === input.userTenantId &&
    input.privilegeEpochAtIssue === input.currentPrivilegeEpoch &&
    input.idleExpiresAt > now &&
    input.absoluteExpiresAt > now
  );
}

export function isMfaAssuranceFresh(input: {
  assuranceLevel?: string | null;
  mfaAuthenticatedAt?: Date | null;
  freshnessMinutes: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return Boolean(
    input.assuranceLevel === "MFA" &&
    input.mfaAuthenticatedAt &&
    now.getTime() - input.mfaAuthenticatedAt.getTime() <=
      input.freshnessMinutes * 60_000,
  );
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function keyedDigest(value: string) {
  return createHmac("sha256", requireAuthSecret()).update(value).digest("hex");
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTenantCode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRecoveryCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function assertAuthIdentityOwnership(
  existingUserId: string | null | undefined,
  targetUserId: string,
) {
  if (existingUserId && existingUserId !== targetUserId) {
    throw new Error("AUTH_IDENTITY_OWNERSHIP_CONFLICT");
  }
}

function sessionCookieName() {
  return isProduction() ? productionCookieName : developmentCookieName;
}

async function setSessionCookie(token: string, absoluteExpiresAt: Date) {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: absoluteExpiresAt,
  });
}

export async function clearAuthenticationCookies() {
  const store = await cookies();
  store.delete(productionCookieName);
  store.delete(developmentCookieName);
  store.delete("ogfi_demo_session");
  store.delete("ogfi_demo_session_issued_at");
  store.delete("ogfi_demo_location");
}

async function currentSessionToken() {
  const store = await cookies();
  return (
    store.get(productionCookieName)?.value ??
    store.get(developmentCookieName)?.value ??
    null
  );
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

export async function hashPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyPasswordHash: Promise<string> | null = null;

async function runAuthenticationArgon2<T>(work: () => Promise<T>) {
  try {
    return await runWithArgon2WorkPermit(work);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "AUTH_ARGON2_CAPACITY_EXCEEDED"
    ) {
      throw new Error("AUTHENTICATION_CAPACITY_TEMPORARILY_UNAVAILABLE");
    }
    throw error;
  }
}

function getDummyPasswordHash() {
  dummyPasswordHash ??= runAuthenticationArgon2(() =>
    hashPassword("OGFI timing equalization credential 2026 only"),
  ).catch((error) => {
    dummyPasswordHash = null;
    throw error;
  });
  return dummyPasswordHash;
}

export function encryptSensitiveValue(secret: string) {
  const iv = randomBytes(12);
  const current = currentEncryptionKey();
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    secretIv: iv.toString("base64"),
    secretAuthTag: cipher.getAuthTag().toString("base64"),
    keyVersion: current.version,
  };
}

export function decryptSensitiveValue(input: {
  encryptedSecret: string;
  secretIv: string;
  secretAuthTag: string;
  keyVersion: number;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKeyForVersion(input.keyVersion),
    Buffer.from(input.secretIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.secretAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.encryptedSecret, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function buildTotp(secretBase32: string, accountName: string) {
  return new TOTP({
    issuer: "OGFI ERP",
    label: accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

function generateRecoveryCodes() {
  return Array.from({ length: recoveryCodeCount }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
  });
}

async function userRequiresMfaInTransaction(
  tx: TransactionClient,
  userId: string,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      roleAssignments: {
        where: { status: "ACTIVE" },
        select: {
          role: {
            select: {
              status: true,
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      },
    },
  });
  return Boolean(
    user?.roleAssignments.some(
      ({ role }) =>
        role.status === "ACTIVE" &&
        role.permissions.some(({ permission }) =>
          isSensitivePermissionCode(permission.code),
        ),
    ),
  );
}

type SessionTransitionSource = {
  id: string;
  tenantId: string;
  userId: string;
  authIdentityId: string | null;
  status: string;
  privilegeEpochAtIssue: number;
  userAgentHash: string | null;
  sourceAddressHash: string | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  challengeFailureCount: number;
  challengeLockedAt: Date | null;
  user: { tenantId: string; status: string; privilegeEpoch: number };
};

async function createSessionRecord(
  tx: TransactionClient,
  input: {
  tenantId: string;
  userId: string;
  authIdentityId?: string | null;
  status: "ACTIVE" | "PENDING_MFA" | "MFA_ENROLLMENT_REQUIRED";
  assuranceLevel: "PASSWORD" | "MFA";
  mfaAuthenticatedAt?: Date | null;
  privilegeEpoch: number;
  fingerprint: RequestFingerprint;
  absoluteExpiresAt?: Date;
  idleMinutes?: number;
  },
) {
  const now = new Date();
  const absoluteExpiresAt =
    input.absoluteExpiresAt ?? addHours(now, sessionAbsoluteHours);
  const requestedIdleExpiresAt = addMinutes(
    now,
    input.idleMinutes ??
      (input.status === "ACTIVE" ? sessionIdleMinutes : mfaChallengeMinutes),
  );
  const idleExpiresAt =
    requestedIdleExpiresAt < absoluteExpiresAt
      ? requestedIdleExpiresAt
      : absoluteExpiresAt;
  const token = randomBytes(32).toString("base64url");
  const session = await tx.authSession.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      authIdentityId: input.authIdentityId ?? null,
      tokenHash: digest(token),
      status: input.status,
      assuranceLevel: input.assuranceLevel,
      mfaAuthenticatedAt: input.mfaAuthenticatedAt ?? null,
      privilegeEpochAtIssue: input.privilegeEpoch,
      idleExpiresAt,
      absoluteExpiresAt,
      userAgentHash: keyedDigest(input.fingerprint.userAgent),
      sourceAddressHash: keyedDigest(input.fingerprint.sourceAddress),
    },
  });
  return { session, token, absoluteExpiresAt };
}

function assertSessionTransitionSourceValid(
  session: SessionTransitionSource,
  expectedStatus: string,
  now: Date,
) {
  if (
    session.status !== expectedStatus ||
    session.challengeLockedAt ||
    !isSessionSecurityStateValid({
      sessionTenantId: session.tenantId,
      userTenantId: session.user.tenantId,
      userActive: session.user.status === "ACTIVE",
      privilegeEpochAtIssue: session.privilegeEpochAtIssue,
      currentPrivilegeEpoch: session.user.privilegeEpoch,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      now,
    })
  ) {
    throw new Error("AUTH_SESSION_TRANSITION_INVALID");
  }
}

export async function rotateSessionInTransaction(
  tx: TransactionClient,
  session: SessionTransitionSource,
  expectedStatus: string,
  input: {
    status: "ACTIVE" | "PENDING_MFA" | "MFA_ENROLLMENT_REQUIRED";
    assuranceLevel: "PASSWORD" | "MFA";
    mfaAuthenticatedAt?: Date | null;
    fingerprint?: RequestFingerprint;
  },
) {
  const now = new Date();
  assertSessionTransitionSourceValid(session, expectedStatus, now);
  const rotated = await tx.authSession.updateMany({
      where: {
        id: session.id,
        status: expectedStatus,
        challengeLockedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      data: {
        status: "ROTATED",
        revokedAt: now,
        revocationReason:
          "Session rotated after authentication assurance changed.",
      },
  });
  if (rotated.count !== 1) {
    throw new Error("AUTH_SESSION_TRANSITION_CONFLICT");
  }
  const requestedIdleExpiresAt = addMinutes(
    now,
    input.status === "ACTIVE" ? sessionIdleMinutes : mfaChallengeMinutes,
  );
  const idleExpiresAt =
    requestedIdleExpiresAt < session.absoluteExpiresAt
      ? requestedIdleExpiresAt
      : session.absoluteExpiresAt;
  const token = randomBytes(32).toString("base64url");
  const replacement = await tx.authSession.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      authIdentityId: session.authIdentityId,
      tokenHash: digest(token),
      status: input.status,
      assuranceLevel: input.assuranceLevel,
      mfaAuthenticatedAt: input.mfaAuthenticatedAt ?? null,
      privilegeEpochAtIssue: session.privilegeEpochAtIssue,
      idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      userAgentHash: input.fingerprint
        ? keyedDigest(input.fingerprint.userAgent)
        : session.userAgentHash,
      sourceAddressHash: input.fingerprint
        ? keyedDigest(input.fingerprint.sourceAddress)
        : session.sourceAddressHash,
    },
  });
  return {
    sessionId: replacement.id,
    token,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

async function recordPasswordAuthenticationDenial(
  tenantId: string | null,
  reason: "AUTHENTICATION_REQUIRED" | "POLICY_DENIED",
) {
  if (!tenantId) return;
  await recordDeniedDecisionSafely({
    tenantId,
    companyId: null,
    locationId: null,
    actorUserId: null,
    subjectType: "UNRESOLVED_IDENTITY",
    action: "AUTHENTICATE",
    reason,
    resource: "AUTHENTICATION",
    windowMinutes: AUTHENTICATION_DENIAL_AUDIT_WINDOW_MINUTES,
  });
}

async function lockAndReloadPasswordIdentity(
  tx: TransactionClient,
  input: {
    identityId: string;
    tenantCode: string;
    normalizedIdentifier: string;
    verifiedPasswordHash: string;
  },
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT identity.id
      FROM "AuthIdentity" identity
      JOIN "Tenant" tenant_account ON tenant_account.id = identity."tenantId"
      JOIN "User" user_account ON user_account.id = identity."userId"
      JOIN "PasswordCredential" credential
        ON credential."authIdentityId" = identity.id
     WHERE identity.id = ${input.identityId}::uuid
       AND identity.provider = 'LOCAL'
       AND identity."normalizedIdentifier" = ${input.normalizedIdentifier}
       AND identity.status = 'ACTIVE'
       AND tenant_account."loginCode" = ${input.tenantCode}
       AND tenant_account.status = 'ACTIVE'
       AND user_account.status = 'ACTIVE'
     FOR UPDATE OF identity, tenant_account, user_account, credential`;
  if (!locked[0]) throw new Error("LOGIN_CREDENTIALS_INVALID");
  const identity = await tx.authIdentity.findFirst({
    where: {
      id: input.identityId,
      provider: "LOCAL",
      normalizedIdentifier: input.normalizedIdentifier,
      status: "ACTIVE",
      tenant: { loginCode: input.tenantCode, status: "ACTIVE" },
      user: { status: "ACTIVE" },
    },
    include: { passwordCredential: true, user: true },
  });
  if (
    !identity?.passwordCredential ||
    identity.passwordCredential.passwordHash !== input.verifiedPasswordHash
  ) {
    throw new Error("LOGIN_CREDENTIALS_INVALID");
  }
  return identity;
}

export async function finalizePasswordAuthenticationInTransaction(
  tx: TransactionClient,
  input: {
    identityId: string;
    tenantCode: string;
    normalizedIdentifier: string;
    verifiedPasswordHash: string;
    fingerprint: RequestFingerprint;
    reservation: AuthenticationThrottleReservation;
  },
) {
  const identity = await lockAndReloadPasswordIdentity(tx, input);
  if (
    input.reservation.attemptType !== "PASSWORD" ||
    input.reservation.tenantId !== identity.tenantId ||
    input.reservation.accountUserId !== identity.userId
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_SCOPE_MISMATCH");
  }
  const mfaRequired = await userRequiresMfaInTransaction(tx, identity.userId);
  const activeAuthenticator = mfaRequired
    ? await tx.mfaAuthenticator.findFirst({
        where: {
          tenantId: identity.tenantId,
          userId: identity.userId,
          status: "ACTIVE",
        },
      })
    : null;
  const status = mfaRequired
    ? activeAuthenticator
      ? "PENDING_MFA"
      : "MFA_ENROLLMENT_REQUIRED"
    : "ACTIVE";
  const now = new Date();
  const createdSession = await createSessionRecord(tx, {
    tenantId: identity.tenantId,
    userId: identity.userId,
    authIdentityId: identity.id,
    status,
    assuranceLevel: "PASSWORD",
    privilegeEpoch: identity.user.privilegeEpoch,
    fingerprint: input.fingerprint,
  });
  await tx.auditEvent.create({
    data: {
      id: input.reservation.id,
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      eventType: "auth.password.succeeded",
      entityType: "AuthSession",
      entityId: createdSession.session.id,
      occurredAt: now,
      afterData: { status, assuranceLevel: "PASSWORD", mfaRequired },
      metadata: { sourceDecisionId: "DEC-0050" },
    },
  });
  await completeSuccessfulAuthenticationAttemptInTransaction(
    input.reservation,
    { client: tx },
  );
  if (status === "ACTIVE") {
    await tx.user.update({
      where: { id: identity.userId },
      data: { lastLoginAt: now },
    });
  }
  return { status, createdSession };
}

export async function authenticatePassword(input: {
  tenantCode: string;
  identifier: string;
  password: string;
  fingerprint: RequestFingerprint;
}) {
  assertProductionAuthConfiguration();
  if (getAuthMode() !== "local") {
    throw new Error("LOCAL_AUTH_NOT_ENABLED");
  }
  const tenantCode = normalizeTenantCode(input.tenantCode);
  const identifier = normalizeIdentifier(input.identifier);
  const identity = await prisma.authIdentity.findFirst({
    where: {
      provider: "LOCAL",
      normalizedIdentifier: identifier,
      status: "ACTIVE",
      tenant: { loginCode: tenantCode, status: "ACTIVE" },
      user: { status: "ACTIVE" },
    },
    include: { passwordCredential: true, user: true },
  });
  const throttle = await reserveAuthenticationAttempt({
    attemptType: "PASSWORD",
    identifierSignal: `${tenantCode}:${identifier}`,
    sourceSignal: input.fingerprint.sourceAddress,
    tenantId: identity?.tenantId ?? null,
    accountUserId: identity?.userId ?? null,
  });
  if (!throttle.allowed) {
    await recordPasswordAuthenticationDenial(identity?.tenantId ?? null, "POLICY_DENIED");
    // An account-only threshold must not reveal that the submitted identifier
    // maps to a real account. Source/global/tenant pressure remains a distinct,
    // retryable capacity response because it affects known and unknown inputs.
    throw new Error(
      throttle.thresholdDimensions.length === 1 &&
        throttle.thresholdDimensions[0] === "ACCOUNT"
        ? "LOGIN_CREDENTIALS_INVALID"
        : "LOGIN_TEMPORARILY_THROTTLED",
    );
  }
  const passwordHash =
    identity?.passwordCredential?.passwordHash ??
    (await getDummyPasswordHash());
  const passwordVerified = await runAuthenticationArgon2(() =>
    verifyPassword(passwordHash, input.password),
  );
  const valid = Boolean(identity?.passwordCredential && passwordVerified);
  if (!valid || !identity?.passwordCredential) {
    await recordPasswordAuthenticationDenial(
      identity?.tenantId ?? null,
      "AUTHENTICATION_REQUIRED",
    );
    throw new Error("LOGIN_CREDENTIALS_INVALID");
  }
  const verifiedPasswordHash = identity.passwordCredential.passwordHash;
  let finalized: Awaited<
    ReturnType<typeof finalizePasswordAuthenticationInTransaction>
  >;
  try {
    finalized = await prisma.$transaction((tx) =>
      finalizePasswordAuthenticationInTransaction(tx, {
        identityId: identity.id,
        tenantCode,
        normalizedIdentifier: identifier,
        verifiedPasswordHash,
        fingerprint: input.fingerprint,
        reservation: throttle.reservation,
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "LOGIN_CREDENTIALS_INVALID"
    ) {
      throw error;
    }
    throw new Error("LOGIN_TEMPORARILY_THROTTLED");
  }
  await setSessionCookie(
    finalized.createdSession.token,
    finalized.createdSession.absoluteExpiresAt,
  );
  const { status } = finalized;
  return status === "PENDING_MFA"
    ? "/mfa-challenge"
    : status === "MFA_ENROLLMENT_REQUIRED"
      ? "/account/security"
      : "/";
}

async function findSessionByToken(statuses: string[]) {
  const token = await currentSessionToken();
  if (!token) {
    return null;
  }
  return prisma.authSession.findFirst({
    where: { tokenHash: digest(token), status: { in: statuses } },
    include: { user: true, authIdentity: true },
  });
}

async function expireSession(sessionId: string, reason: string) {
  await prisma.authSession.updateMany({
    where: {
      id: sessionId,
      status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
    },
    data: {
      status: "EXPIRED",
      revokedAt: new Date(),
      revocationReason: reason,
    },
  });
}

export async function getValidatedSessionPrincipal() {
  assertProductionAuthConfiguration();
  if (getAuthMode() !== "local") {
    return null;
  }
  const session = await findSessionByToken(["ACTIVE"]);
  if (!session) {
    return null;
  }
  const now = new Date();
  if (
    !isSessionSecurityStateValid({
      sessionTenantId: session.tenantId,
      userTenantId: session.user.tenantId,
      userActive: session.user.status === "ACTIVE",
      privilegeEpochAtIssue: session.privilegeEpochAtIssue,
      currentPrivilegeEpoch: session.user.privilegeEpoch,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      now,
    })
  ) {
    await expireSession(
      session.id,
      "Session security state or expiry is no longer valid.",
    );
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60_000) {
    const nextIdle = addMinutes(now, sessionIdleMinutes);
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        idleExpiresAt:
          nextIdle < session.absoluteExpiresAt
            ? nextIdle
            : session.absoluteExpiresAt,
      },
    });
  }
  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    userId: session.userId,
    assuranceLevel: session.assuranceLevel,
    mfaAuthenticatedAt: session.mfaAuthenticatedAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

function mfaAttemptIdentifierHash(session: {
  tenantId: string;
  userId: string;
}) {
  return keyedDigest(`${session.tenantId}:${session.userId}`);
}

async function lockMfaChallengeInTransaction(
  tx: TransactionClient,
  session: SessionTransitionSource,
  now: Date,
) {
  const reason = "MFA challenge attempt limit reached.";
  const result = await tx.authSession.updateMany({
    where: {
      id: session.id,
      status: "PENDING_MFA",
      challengeLockedAt: null,
      idleExpiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    data: {
      status: "REVOKED",
      challengeLockedAt: now,
      revokedAt: now,
      revocationReason: reason,
    },
  });
  if (result.count !== 1) throw new Error("AUTH_SESSION_TRANSITION_CONFLICT");
  await tx.auditEvent.create({
    data: {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      eventType: "auth.mfa.challenge_locked",
      entityType: "AuthSession",
      entityId: session.id,
      afterData: { status: "REVOKED" },
      metadata: { sourceDecisionId: "DEC-0040", reason },
    },
  });
}

async function recordMfaAuthenticationDenial(
  tx: TransactionClient,
  session: SessionTransitionSource,
  reason: "AUTHENTICATION_REQUIRED" | "POLICY_DENIED",
) {
  await recordDeniedDecisionInTransactionSafely(
    {
      tenantId: session.tenantId,
      companyId: null,
      locationId: null,
      actorUserId: session.userId,
      subjectType: "ACTOR",
      action: "AUTHENTICATE",
      reason,
      resource: "AUTHENTICATION",
      windowMinutes: AUTHENTICATION_DENIAL_AUDIT_WINDOW_MINUTES,
    },
    { client: tx },
  );
}

async function lockAndReloadPendingMfaSession(
  tx: TransactionClient,
  sessionId: string,
  now: Date,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT auth_session.id
      FROM "AuthSession" auth_session
      JOIN "Tenant" tenant_account
        ON tenant_account.id = auth_session."tenantId"
      JOIN "User" user_account
        ON user_account.id = auth_session."userId"
       AND user_account."tenantId" = auth_session."tenantId"
     WHERE auth_session.id = ${sessionId}::uuid
       AND tenant_account.status = 'ACTIVE'
       AND user_account.status = 'ACTIVE'
     FOR UPDATE OF auth_session, tenant_account, user_account`;
  if (!locked[0]) throw new Error("MFA_CHALLENGE_NOT_FOUND");
  const session = await tx.authSession.findFirst({
    where: { id: sessionId },
    include: { user: true, authIdentity: true },
  });
  if (!session) throw new Error("MFA_CHALLENGE_NOT_FOUND");
  assertSessionTransitionSourceValid(session, "PENDING_MFA", now);
  return session;
}

async function lockAndReloadExactMfaAuthenticator(
  tx: TransactionClient,
  session: SessionTransitionSource,
  snapshot: MfaAuthenticatorSnapshot,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT authenticator.id
      FROM "MfaAuthenticator" authenticator
      JOIN "Tenant" tenant_account
        ON tenant_account.id = authenticator."tenantId"
      JOIN "User" user_account
        ON user_account.id = authenticator."userId"
       AND user_account."tenantId" = authenticator."tenantId"
     WHERE authenticator.id = ${snapshot.id}::uuid
       AND authenticator."tenantId" = ${session.tenantId}::uuid
       AND authenticator."userId" = ${session.userId}::uuid
       AND authenticator.status = 'ACTIVE'
       AND tenant_account.status = 'ACTIVE'
       AND user_account.status = 'ACTIVE'
     FOR UPDATE OF authenticator, tenant_account, user_account`;
  if (!locked[0]) throw new Error("MFA_CODE_INVALID");
  const current = await tx.mfaAuthenticator.findUnique({
    where: { id: snapshot.id },
  });
  if (
    !current ||
    current.tenantId !== snapshot.tenantId ||
    current.userId !== snapshot.userId ||
    current.status !== "ACTIVE" ||
    current.encryptedSecret !== snapshot.encryptedSecret ||
    current.secretIv !== snapshot.secretIv ||
    current.secretAuthTag !== snapshot.secretAuthTag ||
    current.keyVersion !== snapshot.keyVersion ||
    current.updatedAt.getTime() !== snapshot.updatedAt.getTime()
  ) {
    throw new Error("MFA_CODE_INVALID");
  }
  return current;
}

export async function recordMfaFailure(session: SessionTransitionSource) {
  let result: "MFA_CODE_INVALID" | "MFA_CHALLENGE_TEMPORARILY_THROTTLED";
  try {
    result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const lockedSession = await lockAndReloadPendingMfaSession(tx, session.id, now);
      const throttle = await reserveAuthenticationAttemptInTransaction(
        {
          attemptType: "MFA",
          identifierSignal: mfaAttemptIdentifierHash(lockedSession),
          sourceSignal: lockedSession.sourceAddressHash ?? keyedDigest("unknown"),
          tenantId: lockedSession.tenantId,
          accountUserId: lockedSession.userId,
        },
        { client: tx },
      );
      if (!throttle.allowed) {
        await lockMfaChallengeInTransaction(tx, lockedSession, now);
        await recordMfaAuthenticationDenial(tx, lockedSession, "POLICY_DENIED");
        return "MFA_CHALLENGE_TEMPORARILY_THROTTLED" as const;
      }
      const updated = await tx.authSession.updateMany({
        where: {
          id: lockedSession.id,
          status: "PENDING_MFA",
          challengeLockedAt: null,
          challengeFailureCount: lockedSession.challengeFailureCount,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        data: { challengeFailureCount: { increment: 1 } },
      });
      if (updated.count !== 1) throw new Error("AUTH_SESSION_TRANSITION_CONFLICT");
      await recordMfaAuthenticationDenial(
        tx,
        lockedSession,
        "AUTHENTICATION_REQUIRED",
      );
      if (lockedSession.challengeFailureCount + 1 >= mfaChallengeLimit) {
        await lockMfaChallengeInTransaction(tx, lockedSession, now);
      }
      return "MFA_CODE_INVALID" as const;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "AUTH_THROTTLE_UNAVAILABLE",
        "AUTH_THROTTLE_SUCCESS_RELEASE_UNAVAILABLE",
      ].includes(error.message)
    ) {
      throw new Error("MFA_CHALLENGE_TEMPORARILY_THROTTLED");
    }
    throw error;
  }
  return result;
}

async function recordReservedMfaFailure(session: SessionTransitionSource) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const lockedSession = await lockAndReloadPendingMfaSession(tx, session.id, now);
    const updated = await tx.authSession.updateMany({
      where: {
        id: lockedSession.id,
        status: "PENDING_MFA",
        challengeLockedAt: null,
        challengeFailureCount: lockedSession.challengeFailureCount,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      data: { challengeFailureCount: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("AUTH_SESSION_TRANSITION_CONFLICT");
    await recordMfaAuthenticationDenial(
      tx,
      lockedSession,
      "AUTHENTICATION_REQUIRED",
    );
    if (lockedSession.challengeFailureCount + 1 >= mfaChallengeLimit) {
      await lockMfaChallengeInTransaction(tx, lockedSession, now);
    }
    return "MFA_CODE_INVALID" as const;
  });
}

async function recordMfaThrottleDenial(session: SessionTransitionSource) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const lockedSession = await lockAndReloadPendingMfaSession(tx, session.id, now);
    await lockMfaChallengeInTransaction(tx, lockedSession, now);
    await recordMfaAuthenticationDenial(tx, lockedSession, "POLICY_DENIED");
  });
}

export async function completeMfaChallenge(
  codeValue: string,
  fingerprint: RequestFingerprint,
) {
  const session = await findSessionByToken(["PENDING_MFA"]);
  if (!session) {
    throw new Error("MFA_CHALLENGE_NOT_FOUND");
  }
  assertSessionTransitionSourceValid(session, "PENDING_MFA", new Date());
  const throttle = await reserveAuthenticationAttempt({
    attemptType: "MFA",
    identifierSignal: mfaAttemptIdentifierHash(session),
    sourceSignal: fingerprint.sourceAddress,
    tenantId: session.tenantId,
    accountUserId: session.userId,
  });
  if (!throttle.allowed) {
    try {
      await recordMfaThrottleDenial(session);
    } catch {
      // The response remains a stable retryable denial; persistence failures
      // must not expose database or reservation internals to the caller.
    }
    throw new Error("MFA_CHALLENGE_TEMPORARILY_THROTTLED");
  }
  const authenticator = await prisma.mfaAuthenticator.findFirst({
    where: {
      tenantId: session.tenantId,
      userId: session.userId,
      status: "ACTIVE",
    },
    orderBy: { verifiedAt: "desc" },
  });
  if (!authenticator) {
    throw new Error("MFA_AUTHENTICATOR_NOT_FOUND");
  }
  const normalized = codeValue.trim();
  let verified = false;
  let usedCounter: bigint | null = null;
  let recoveryCodeId: string | null = null;

  // Code verification is read-only and deliberately outside the database
  // transaction. Every mutation re-locks and revalidates the session, then
  // reserves the throttle attempt before replay, recovery, or session writes.
  if (/^\d{6}$/.test(normalized)) {
    const secret = decryptSensitiveValue(authenticator);
    const totp = buildTotp(
      secret,
      session.authIdentity?.normalizedIdentifier ?? session.user.email,
    );
    const delta = totp.validate({ token: normalized, window: 1 });
    if (delta !== null) {
      usedCounter = BigInt(Math.floor(Date.now() / 30_000) + delta);
      verified =
        authenticator.lastUsedCounter === null ||
        usedCounter > authenticator.lastUsedCounter;
    }
  } else {
    const recoveryHash = keyedDigest(
      `${session.userId}:${normalizeRecoveryCode(normalized)}`,
    );
    const recovery = await prisma.mfaRecoveryCode.findFirst({
      where: {
        authenticatorId: authenticator.id,
        codeHash: recoveryHash,
        consumedAt: null,
      },
    });
    recoveryCodeId = recovery?.id ?? null;
    verified = Boolean(recoveryCodeId);
  }
  if (!verified) {
    throw new Error(await recordReservedMfaFailure(session));
  }

  let transactionResult: {
    rotated: { sessionId: string; token: string; absoluteExpiresAt: Date };
  };
  try {
    transactionResult = await prisma.$transaction((tx) =>
      finalizeMfaAuthenticationInTransaction(tx, {
        sessionId: session.id,
        authenticator,
        usedCounter,
        recoveryCodeId,
        fingerprint,
        reservation: throttle.reservation,
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "AUTH_THROTTLE_UNAVAILABLE",
        "AUTH_THROTTLE_SUCCESS_RELEASE_UNAVAILABLE",
      ].includes(error.message)
    ) {
      throw new Error("MFA_CHALLENGE_TEMPORARILY_THROTTLED");
    }
    throw error;
  }
  const { rotated } = transactionResult;
  await setSessionCookie(rotated.token, rotated.absoluteExpiresAt);
  return "/";
}

export async function finalizeMfaAuthenticationInTransaction(
  tx: TransactionClient,
  input: {
    sessionId: string;
    authenticator: MfaAuthenticatorSnapshot;
    usedCounter: bigint | null;
    recoveryCodeId: string | null;
    fingerprint: RequestFingerprint;
    reservation: AuthenticationThrottleReservation;
  },
) {
  const now = new Date();
  const lockedSession = await lockAndReloadPendingMfaSession(
    tx,
    input.sessionId,
    now,
  );
  const lockedAuthenticator = await lockAndReloadExactMfaAuthenticator(
    tx,
    lockedSession,
    input.authenticator,
  );
  if (
    input.reservation.attemptType !== "MFA" ||
    input.reservation.tenantId !== lockedSession.tenantId ||
    input.reservation.accountUserId !== lockedSession.userId
  ) {
    throw new Error("AUTH_THROTTLE_RESERVATION_SCOPE_MISMATCH");
  }
  if (input.usedCounter !== null) {
    const result = await tx.mfaAuthenticator.updateMany({
      where: {
        id: lockedAuthenticator.id,
        status: "ACTIVE",
        updatedAt: lockedAuthenticator.updatedAt,
        OR: [
          { lastUsedCounter: null },
          { lastUsedCounter: { lt: input.usedCounter } },
        ],
      },
      data: { lastUsedCounter: input.usedCounter },
    });
    if (result.count !== 1) throw new Error("MFA_CODE_REPLAYED");
  }
  if (input.recoveryCodeId) {
    const recovery = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT recovery.id
        FROM "MfaRecoveryCode" recovery
        JOIN "MfaAuthenticator" authenticator
          ON authenticator.id = recovery."authenticatorId"
       WHERE recovery.id = ${input.recoveryCodeId}::uuid
         AND recovery."authenticatorId" = ${lockedAuthenticator.id}::uuid
         AND recovery."consumedAt" IS NULL
         AND authenticator.status = 'ACTIVE'
       FOR UPDATE OF recovery`;
    if (!recovery[0]) throw new Error("MFA_RECOVERY_CODE_REPLAYED");
    const result = await tx.mfaRecoveryCode.updateMany({
      where: {
        id: input.recoveryCodeId,
        authenticatorId: lockedAuthenticator.id,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
    if (result.count !== 1) throw new Error("MFA_RECOVERY_CODE_REPLAYED");
  }
  const rotated = await rotateSessionInTransaction(
    tx,
    lockedSession,
    "PENDING_MFA",
    {
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: now,
      fingerprint: input.fingerprint,
    },
  );
  await tx.auditEvent.create({
    data: {
      id: input.reservation.id,
      tenantId: lockedSession.tenantId,
      actorUserId: lockedSession.userId,
      eventType: input.recoveryCodeId
        ? "auth.mfa.recovery_used"
        : "auth.mfa.challenge_succeeded",
      entityType: "AuthSession",
      entityId: rotated.sessionId,
      occurredAt: now,
      afterData: { assuranceLevel: "MFA" },
      metadata: { sourceDecisionId: "DEC-0050" },
    },
  });
  await completeSuccessfulAuthenticationAttemptInTransaction(
    input.reservation,
    { client: tx },
  );
  await tx.user.update({
    where: {
      id: lockedSession.userId,
      tenantId: lockedSession.tenantId,
      status: "ACTIVE",
      privilegeEpoch: lockedSession.privilegeEpochAtIssue,
    },
    data: { lastLoginAt: now },
  });
  return { rotated };
}

export async function beginMfaStepUp() {
  const session = await findSessionByToken(["ACTIVE"]);
  if (!session) {
    throw new Error("AUTH_REQUIRED");
  }
  const now = new Date();
  assertSessionTransitionSourceValid(session, "ACTIVE", now);
  const authenticator = await prisma.mfaAuthenticator.findFirst({
    where: {
      tenantId: session.tenantId,
      userId: session.userId,
      status: "ACTIVE",
    },
  });
  if (!authenticator) {
    throw new Error("MFA_AUTHENTICATOR_NOT_FOUND");
  }
  const challengeExpiry = addMinutes(now, mfaChallengeMinutes);
  const result = await prisma.authSession.updateMany({
    where: {
      id: session.id,
      status: "ACTIVE",
      idleExpiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
      privilegeEpochAtIssue: session.user.privilegeEpoch,
    },
    data: {
      status: "PENDING_MFA",
      assuranceLevel: "PASSWORD",
      mfaAuthenticatedAt: null,
      challengeFailureCount: 0,
      challengeLockedAt: null,
      idleExpiresAt:
        challengeExpiry < session.absoluteExpiresAt
          ? challengeExpiry
          : session.absoluteExpiresAt,
    },
  });
  if (result.count !== 1) {
    throw new Error("AUTH_SESSION_TRANSITION_CONFLICT");
  }
}

export async function startMfaEnrollment() {
  const session = await findSessionByToken([
    "MFA_ENROLLMENT_REQUIRED",
    "ACTIVE",
  ]);
  if (!session) {
    throw new Error("MFA_ENROLLMENT_SESSION_REQUIRED");
  }
  assertSessionTransitionSourceValid(session, session.status, new Date());
  const existingActive = await prisma.mfaAuthenticator.findFirst({
    where: {
      tenantId: session.tenantId,
      userId: session.userId,
      status: "ACTIVE",
    },
  });
  if (existingActive) {
    throw new Error("MFA_AUTHENTICATOR_ALREADY_ACTIVE");
  }
  const secret = new Secret({ size: 20 }).base32;
  const encrypted = encryptSensitiveValue(secret);
  const authenticator = await prisma.$transaction(async (tx) => {
    await tx.mfaAuthenticator.updateMany({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
        status: "PENDING",
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return tx.mfaAuthenticator.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        label: "Primary authenticator",
        ...encrypted,
      },
    });
  });
  const totp = buildTotp(
    secret,
    session.authIdentity?.normalizedIdentifier ?? session.user.email,
  );
  return {
    authenticatorId: authenticator.id,
    manualKey: secret,
    qrDataUrl: await QRCode.toDataURL(totp.toString(), {
      width: 240,
      margin: 1,
    }),
  };
}

export async function completeMfaEnrollment(input: {
  authenticatorId: string;
  code: string;
}) {
  const session = await findSessionByToken([
    "MFA_ENROLLMENT_REQUIRED",
    "ACTIVE",
  ]);
  if (!session) {
    throw new Error("MFA_ENROLLMENT_SESSION_REQUIRED");
  }
  assertSessionTransitionSourceValid(session, session.status, new Date());
  const authenticator = await prisma.mfaAuthenticator.findFirst({
    where: {
      id: input.authenticatorId,
      tenantId: session.tenantId,
      userId: session.userId,
      status: "PENDING",
    },
  });
  if (!authenticator) {
    throw new Error("MFA_ENROLLMENT_NOT_FOUND");
  }
  const secret = decryptSensitiveValue(authenticator);
  const totp = buildTotp(
    secret,
    session.authIdentity?.normalizedIdentifier ?? session.user.email,
  );
  const delta = totp.validate({ token: input.code.trim(), window: 1 });
  if (delta === null) {
    throw new Error("MFA_CODE_INVALID");
  }
  const counter = BigInt(Math.floor(Date.now() / 30_000) + delta);
  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();
  const rotated = await prisma.$transaction(async (tx) => {
    const activated = await tx.mfaAuthenticator.updateMany({
      where: {
        id: authenticator.id,
        tenantId: session.tenantId,
        userId: session.userId,
        status: "PENDING",
      },
      data: { status: "ACTIVE", verifiedAt: now, lastUsedCounter: counter },
    });
    if (activated.count !== 1) {
      throw new Error("MFA_ENROLLMENT_CONFLICT");
    }
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        authenticatorId: authenticator.id,
        codeHash: keyedDigest(
          `${session.userId}:${normalizeRecoveryCode(code)}`,
        ),
      })),
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        eventType: "auth.mfa.enrolled",
        entityType: "MfaAuthenticator",
        entityId: authenticator.id,
        afterData: { status: "ACTIVE", recoveryCodeCount },
        metadata: { sourceDecisionId: "DEC-0040" },
      },
    });
    return rotateSessionInTransaction(tx, session, session.status, {
      status: "ACTIVE",
      assuranceLevel: "MFA",
      mfaAuthenticatedAt: now,
    });
  });
  await setSessionCookie(rotated.token, rotated.absoluteExpiresAt);
  return recoveryCodes;
}

export async function issueAccountActivationInTransaction(
  tx: TransactionClient,
  input: {
    tenantId: string;
    targetUserId: string;
    issuedByUserId: string;
  },
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = addMinutes(new Date(), 30);
  const targetUser = await tx.user.findFirst({
    where: {
      id: input.targetUserId,
      tenantId: input.tenantId,
      status: "ACTIVE",
    },
    select: { id: true, email: true },
  });
  if (!targetUser || !normalizeIdentifier(targetUser.email)) {
    throw new Error("AUTH_ACTIVATION_TARGET_INVALID");
  }
  await tx.authActivationToken.updateMany({
      where: {
        tenantId: input.tenantId,
        targetUserId: input.targetUserId,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
      },
  });
  const activationToken = await tx.authActivationToken.create({
      data: {
        tenantId: input.tenantId,
        targetUserId: input.targetUserId,
        issuedByUserId: input.issuedByUserId,
        tokenHash: digest(token),
        expiresAt,
      },
  });
  await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.issuedByUserId,
        eventType: "auth.activation.issued",
        entityType: "User",
        entityId: input.targetUserId,
        afterData: { expiresAt: expiresAt.toISOString() },
        metadata: { sourceDecisionId: "DEC-0040" },
      },
  });
  return { activationTokenId: activationToken.id, token, expiresAt };
}

export async function issueAccountActivation(input: {
  tenantId: string;
  targetUserId: string;
  issuedByUserId: string;
}) {
  const issued = await prisma.$transaction((tx) =>
    issueAccountActivationInTransaction(tx, input),
  );
  return deliverAccountActivation({
    activationTokenId: issued.activationTokenId,
    token: issued.token,
  });
}

export async function deliverAccountActivation(input: {
  activationTokenId: string;
  token?: string;
}) {
  const staleDeliveryCutoff = addMinutes(new Date(), -5);
  const activation = await prisma.authActivationToken.findFirst({
    where: {
      id: input.activationTokenId,
      status: "ACTIVE",
      OR: [
        { deliveryStatus: { in: ["PENDING", "FAILED"] } },
        {
          deliveryStatus: "SENDING",
          deliveryAttemptedAt: { lt: staleDeliveryCutoff },
        },
      ],
      expiresAt: { gt: new Date() },
    },
    include: {
      targetUser: { select: { email: true, displayName: true, status: true } },
    },
  });
  if (!activation || activation.targetUser.status !== "ACTIVE") {
    throw new Error("AUTH_ACTIVATION_DELIVERY_NOT_AVAILABLE");
  }
  const token = input.token ?? null;
  if (!token || digest(token) !== activation.tokenHash) {
    throw new Error("AUTH_ACTIVATION_DELIVERY_TOKEN_UNAVAILABLE");
  }
  const config = activationDeliveryConfiguration();
  const activationUrl = `${config.appUrl}/activate?token=${encodeURIComponent(token)}`;
  const attemptedAt = new Date();
  const claimed = await prisma.authActivationToken.updateMany({
    where: {
      id: activation.id,
      status: "ACTIVE",
      deliveryStatus: activation.deliveryStatus,
      ...(activation.deliveryStatus === "SENDING"
        ? { deliveryAttemptedAt: activation.deliveryAttemptedAt }
        : {}),
      expiresAt: { gt: attemptedAt },
    },
    data: { deliveryStatus: "SENDING", deliveryAttemptedAt: attemptedAt },
  });
  if (claimed.count !== 1) {
    throw new Error("AUTH_ACTIVATION_DELIVERY_CONFLICT");
  }
  let messageAccepted = false;
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.security === "implicit",
      requireTLS: config.security === "starttls",
      auth: { user: config.username, pass: config.password },
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    });
    await transporter.sendMail({
      from: config.from,
      to: activation.targetUser.email,
      subject: "Activate or recover your OGFI ERP account",
      text: [
        `Hello ${activation.targetUser.displayName},`,
        "",
        "Use the single-use link below to activate or recover your OGFI ERP account.",
        `The link expires at ${activation.expiresAt.toISOString()}.`,
        "",
        activationUrl,
        "",
        "If you did not expect this message, contact your administrator and do not use the link.",
      ].join("\n"),
    });
    messageAccepted = true;
    await prisma.$transaction(async (tx) => {
      await tx.authActivationToken.update({
        where: { id: activation.id },
        data: {
          deliveryStatus: "DELIVERED",
          deliveryAttemptCount: { increment: 1 },
          deliveryAttemptedAt: attemptedAt,
          deliveredAt: new Date(),
          deliveryError: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: activation.tenantId,
          actorUserId: activation.issuedByUserId,
          eventType: "auth.activation.delivered",
          entityType: "AuthActivationToken",
          entityId: activation.id,
          afterData: { deliveryStatus: "DELIVERED" },
          metadata: { sourceDecisionId: "DEC-0040" },
        },
      });
    });
    return {
      activationTokenId: activation.id,
      deliveryStatus: "DELIVERED" as const,
      expiresAt: activation.expiresAt,
    };
  } catch {
    if (messageAccepted) {
      throw new Error("AUTH_ACTIVATION_DELIVERY_STATE_UNCERTAIN");
    }
    const deliveryError = "SMTP_SEND_FAILED";
    await prisma.$transaction(async (tx) => {
      await tx.authActivationToken.update({
        where: { id: activation.id },
        data: {
          status: "REVOKED",
          deliveryStatus: "FAILED",
          deliveryAttemptCount: { increment: 1 },
          deliveryAttemptedAt: attemptedAt,
          deliveryError,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: activation.tenantId,
          actorUserId: activation.issuedByUserId,
          eventType: "auth.activation.delivery_failed",
          entityType: "AuthActivationToken",
          entityId: activation.id,
          afterData: { deliveryStatus: "FAILED" },
          metadata: { sourceDecisionId: "DEC-0040" },
        },
      });
    });
    throw new Error("AUTH_ACTIVATION_DELIVERY_FAILED");
  }
}

function assertPasswordPolicy(password: string) {
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error("PASSWORD_POLICY_NOT_MET");
  }
}

export async function activateAccount(input: {
  token: string;
  password: string;
  passwordConfirmation: string;
  fingerprint: RequestFingerprint;
}) {
  assertProductionAuthConfiguration();
  if (input.password !== input.passwordConfirmation) {
    throw new Error("PASSWORD_CONFIRMATION_MISMATCH");
  }
  assertPasswordPolicy(input.password);
  const activation = await prisma.authActivationToken.findFirst({
    where: {
      tokenHash: digest(input.token),
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      targetUser: { status: "ACTIVE" },
    },
    include: { targetUser: true },
  });
  if (!activation) {
    throw new Error("AUTH_ACTIVATION_INVALID");
  }
  const passwordHash = await runAuthenticationArgon2(() =>
    hashPassword(input.password),
  );
  const normalizedIdentifier = normalizeIdentifier(activation.targetUser.email);
  const saved = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const consumed = await tx.authActivationToken.updateMany({
      where: {
        id: activation.id,
        tokenHash: digest(input.token),
        tenantId: activation.tenantId,
        targetUserId: activation.targetUserId,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      data: {
        status: "CONSUMED",
        consumedAt: now,
      },
    });
    if (consumed.count !== 1) {
      throw new Error("AUTH_ACTIVATION_CONFLICT");
    }
    const targetUser = await tx.user.findFirst({
      where: {
        id: activation.targetUserId,
        tenantId: activation.tenantId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!targetUser) {
      throw new Error("AUTH_ACTIVATION_INVALID");
    }
    const existingIdentity = await tx.authIdentity.findUnique({
      where: {
        tenantId_provider_normalizedIdentifier: {
          tenantId: activation.tenantId,
          provider: "LOCAL",
          normalizedIdentifier,
        },
      },
    });
    assertAuthIdentityOwnership(
      existingIdentity?.userId,
      activation.targetUserId,
    );
    const identity = existingIdentity
      ? await tx.authIdentity.update({
          where: { id: existingIdentity.id },
          data: { status: "ACTIVE" },
        })
      : await tx.authIdentity.create({
          data: {
            tenantId: activation.tenantId,
            userId: activation.targetUserId,
            provider: "LOCAL",
            normalizedIdentifier,
          },
        });
    await tx.passwordCredential.upsert({
      where: { authIdentityId: identity.id },
      create: { authIdentityId: identity.id, passwordHash },
      update: {
        passwordHash,
        hashAlgorithm: "ARGON2ID",
        requiresChange: false,
        passwordChangedAt: new Date(),
      },
    });
    const user = await tx.user.update({
      where: { id: activation.targetUserId },
      data: { privilegeEpoch: { increment: 1 } },
      select: { privilegeEpoch: true },
    });
    await revokeApplicationSessions(tx, {
      userId: activation.targetUserId,
      reason: "Account credentials were activated or replaced.",
    });
    await tx.auditEvent.create({
      data: {
        tenantId: activation.tenantId,
        actorUserId: activation.targetUserId,
        eventType: "auth.activation.completed",
        entityType: "AuthIdentity",
        entityId: identity.id,
        afterData: { provider: "LOCAL", status: "ACTIVE" },
        metadata: { sourceDecisionId: "DEC-0040" },
      },
    });
    const mfaRequired = await userRequiresMfaInTransaction(
      tx,
      activation.targetUserId,
    );
    const activeAuthenticator = mfaRequired
      ? await tx.mfaAuthenticator.findFirst({
        where: {
          tenantId: activation.tenantId,
          userId: activation.targetUserId,
          status: "ACTIVE",
        },
      })
      : null;
    const status = mfaRequired
      ? activeAuthenticator
        ? "PENDING_MFA"
        : "MFA_ENROLLMENT_REQUIRED"
      : "ACTIVE";
    const createdSession = await createSessionRecord(tx, {
      tenantId: activation.tenantId,
      userId: activation.targetUserId,
      authIdentityId: identity.id,
      status,
      assuranceLevel: "PASSWORD",
      privilegeEpoch: user.privilegeEpoch,
      fingerprint: input.fingerprint,
    });
    return { status, createdSession };
  });
  await setSessionCookie(
    saved.createdSession.token,
    saved.createdSession.absoluteExpiresAt,
  );
  return saved.status === "PENDING_MFA"
    ? "/mfa-challenge"
    : saved.status === "MFA_ENROLLMENT_REQUIRED"
      ? "/account/security"
      : "/";
}

export async function signOutCurrentSession() {
  const token = await currentSessionToken();
  if (token) {
    const session = await prisma.authSession.findFirst({
      where: { tokenHash: digest(token) },
      select: { id: true, tenantId: true, userId: true },
    });
    const result = await prisma.authSession.updateMany({
      where: {
        tokenHash: digest(token),
        status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
      },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: "User signed out.",
      },
    });
    if (session && result.count === 1) {
      await prisma.auditEvent.create({
        data: {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          eventType: "auth.session.signed_out",
          entityType: "AuthSession",
          entityId: session.id,
          afterData: { status: "REVOKED" },
          metadata: { sourceDecisionId: "DEC-0040" },
        },
      });
    }
  }
  await clearAuthenticationCookies();
}

export async function listUserSessions(userId: string) {
  return prisma.authSession.findMany({
    where: { userId, status: "ACTIVE" },
    select: {
      id: true,
      assuranceLevel: true,
      mfaAuthenticatedAt: true,
      createdAt: true,
      lastSeenAt: true,
      idleExpiresAt: true,
      absoluteExpiresAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeOwnSession(sessionId: string) {
  const principal = await getValidatedSessionPrincipal();
  if (!principal) {
    throw new Error("AUTH_REQUIRED");
  }
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId: principal.userId, status: "ACTIVE" },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: "User revoked this session.",
    },
  });
  if (result.count !== 1) {
    throw new Error("AUTH_SESSION_NOT_FOUND");
  }
  await prisma.auditEvent.create({
    data: {
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      eventType: "auth.session.user_revoked",
      entityType: "AuthSession",
      entityId: sessionId,
      afterData: { status: "REVOKED" },
      metadata: { sourceDecisionId: "DEC-0040" },
    },
  });
  if (sessionId === principal.sessionId) {
    await clearAuthenticationCookies();
    return true;
  }
  return false;
}

export async function revokeApplicationSessions(
  tx: TransactionClient,
  input: { userId: string; reason: string; exceptSessionId?: string },
) {
  return tx.authSession.updateMany({
    where: {
      userId: input.userId,
      ...(input.exceptSessionId ? { id: { not: input.exceptSessionId } } : {}),
      status: { in: ["ACTIVE", "PENDING_MFA", "MFA_ENROLLMENT_REQUIRED"] },
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: input.reason,
    },
  });
}

export function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isTrustedMutationOrigin(input: {
  origin: string | null;
  requestUrl: string;
  appUrl?: string | null | undefined;
}) {
  if (!input.origin) {
    return false;
  }
  try {
    const expectedOrigin = new URL(
      input.appUrl || input.requestUrl,
    ).origin;
    return input.origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function assertTrustedServerActionOrigin() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (isProduction() ? "https" : "http");
  const requestUrl = host
    ? `${protocol}://${host}/`
    : process.env.APP_URL ?? "http://localhost/";
  if (
    !isTrustedMutationOrigin({
      origin: requestHeaders.get("origin"),
      requestUrl,
      appUrl: process.env.APP_URL,
    })
  ) {
    throw new Error("ORIGIN_DENIED");
  }
}
