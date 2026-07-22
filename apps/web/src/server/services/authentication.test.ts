import { readFileSync } from "node:fs";
import path from "node:path";
import { headers as nextHeaders } from "next/headers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTHENTICATION_DENIAL_AUDIT_WINDOW_MINUTES,
  assertProductionAuthConfiguration,
  assertAuthIdentityOwnership,
  assertTrustedServerActionOrigin,
  constantTimeEqual,
  decryptSensitiveValue,
  encryptSensitiveValue,
  getAuthMode,
  getTrustedRequestFingerprint,
  hashPassword,
  isMfaAssuranceFresh,
  isSessionSecurityStateValid,
  isTrustedMutationOrigin,
  verifyPassword,
} from "./authentication";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function stubCompleteProductionAuthEnvironment() {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "caddy_single_hop");
  vi.stubEnv("AUTH_ARGON2_MAX_CONCURRENCY", "2");
  vi.stubEnv("AUTH_SECRET", "a".repeat(32));
  vi.stubEnv("AUTH_THROTTLE_HMAC_KEY", "t".repeat(32));
  vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
  vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "1");
  vi.stubEnv("APP_URL", "https://erp.example.test");
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USERNAME", "erp");
  vi.stubEnv("SMTP_PASSWORD", "secret");
  vi.stubEnv("SMTP_FROM", "erp@example.test");
  vi.stubEnv("SMTP_SECURITY", "starttls");
}

describe("production authentication primitives", () => {
  it("hashes passwords with Argon2id and rejects a wrong password", async () => {
    const encoded = await hashPassword("Correct-Horse-42");
    expect(encoded).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(encoded, "Correct-Horse-42")).resolves.toBe(
      true,
    );
    await expect(verifyPassword(encoded, "wrong-password")).resolves.toBe(
      false,
    );
  });

  it("forbids demo authentication in production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "demo");
    expect(() => getAuthMode()).toThrow("PRODUCTION_DEMO_AUTH_FORBIDDEN");
  });

  it("requires production auth and encryption secrets", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("AUTH_SECRET", "short");
    vi.stubEnv("APP_ENCRYPTION_KEY", "invalid");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "AUTH_SECRET_INVALID",
    );
  });

  it("accepts a complete production configuration and rejects missing SMTP delivery", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "caddy_single_hop");
    vi.stubEnv("AUTH_ARGON2_MAX_CONCURRENCY", "2");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("AUTH_THROTTLE_HMAC_KEY", "t".repeat(32));
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "2");
    vi.stubEnv("APP_URL", "https://erp.example.test");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USERNAME", "erp");
    vi.stubEnv("SMTP_PASSWORD", "secret");
    vi.stubEnv("SMTP_FROM", "erp@example.test");
    vi.stubEnv("SMTP_SECURITY", "starttls");
    expect(() => assertProductionAuthConfiguration()).not.toThrow();
    vi.stubEnv("SMTP_HOST", "");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "AUTH_ACTIVATION_DELIVERY_CONFIGURATION_INVALID",
    );
  });

  it("accepts only implicit TLS or required STARTTLS SMTP policy", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "caddy_single_hop");
    vi.stubEnv("AUTH_ARGON2_MAX_CONCURRENCY", "2");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("AUTH_THROTTLE_HMAC_KEY", "t".repeat(32));
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "1");
    vi.stubEnv("APP_URL", "https://erp.example.test");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USERNAME", "erp");
    vi.stubEnv("SMTP_PASSWORD", "secret");
    vi.stubEnv("SMTP_FROM", "erp@example.test");
    vi.stubEnv("SMTP_PORT", "25");
    vi.stubEnv("SMTP_SECURITY", "plaintext");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "AUTH_ACTIVATION_DELIVERY_CONFIGURATION_INVALID",
    );
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_SECURITY", "implicit");
    expect(() => assertProductionAuthConfiguration()).not.toThrow();
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURITY", "starttls");
    expect(() => assertProductionAuthConfiguration()).not.toThrow();
  });

  it("fails startup for malformed or out-of-range authentication settings", () => {
    const invalidSettings = [
      ["AUTH_SESSION_IDLE_MINUTES", "NaN"],
      ["AUTH_SESSION_ABSOLUTE_HOURS", "0"],
      ["AUTH_MFA_STEP_UP_MINUTES", "61"],
      ["AUTH_MFA_CHALLENGE_MINUTES", "1.5"],
      ["AUTH_MFA_CHALLENGE_LIMIT", "-1"],
    ] as const;

    for (const [name, value] of invalidSettings) {
      vi.unstubAllEnvs();
      stubCompleteProductionAuthEnvironment();
      vi.stubEnv(name, value);
      expect(() => assertProductionAuthConfiguration()).toThrow(
        `${name}_INVALID`,
      );
    }

    vi.unstubAllEnvs();
    stubCompleteProductionAuthEnvironment();
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "2147483648");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "APP_ENCRYPTION_KEY_VERSION_INVALID",
    );

    vi.unstubAllEnvs();
    stubCompleteProductionAuthEnvironment();
    vi.stubEnv("SMTP_PORT", "65536");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "AUTH_ACTIVATION_DELIVERY_CONFIGURATION_INVALID",
    );
  });

  it("decrypts values encrypted under the immediately previous key version", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "1");
    const encrypted = encryptSensitiveValue("rotation-safe-value");
    vi.stubEnv("APP_ENCRYPTION_KEY", Buffer.alloc(32, 2).toString("base64"));
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "2");
    vi.stubEnv(
      "APP_ENCRYPTION_PREVIOUS_KEY",
      Buffer.alloc(32, 1).toString("base64"),
    );
    vi.stubEnv("APP_ENCRYPTION_PREVIOUS_KEY_VERSION", "1");
    expect(decryptSensitiveValue(encrypted)).toBe("rotation-safe-value");
  });

  it("rejects expired, cross-tenant, or stale-privilege sessions", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const valid = {
      sessionTenantId: "tenant-a",
      userTenantId: "tenant-a",
      userActive: true,
      privilegeEpochAtIssue: 4,
      currentPrivilegeEpoch: 4,
      idleExpiresAt: new Date("2026-07-21T00:10:00.000Z"),
      absoluteExpiresAt: new Date("2026-07-21T01:00:00.000Z"),
      now,
    };
    expect(isSessionSecurityStateValid(valid)).toBe(true);
    expect(
      isSessionSecurityStateValid({ ...valid, userTenantId: "tenant-b" }),
    ).toBe(false);
    expect(
      isSessionSecurityStateValid({ ...valid, currentPrivilegeEpoch: 5 }),
    ).toBe(false);
    expect(isSessionSecurityStateValid({ ...valid, idleExpiresAt: now })).toBe(
      false,
    );
  });

  it("requires recent session-bound MFA assurance", () => {
    const now = new Date("2026-07-21T00:15:00.000Z");
    expect(
      isMfaAssuranceFresh({
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date("2026-07-21T00:01:00.000Z"),
        freshnessMinutes: 15,
        now,
      }),
    ).toBe(true);
    expect(
      isMfaAssuranceFresh({
        assuranceLevel: "MFA",
        mfaAuthenticatedAt: new Date("2026-07-20T23:59:59.000Z"),
        freshnessMinutes: 15,
        now,
      }),
    ).toBe(false);
    expect(
      isMfaAssuranceFresh({
        assuranceLevel: "PASSWORD",
        mfaAuthenticatedAt: now,
        freshnessMinutes: 15,
        now,
      }),
    ).toBe(false);
  });

  it("uses constant-time comparison for equal-length secret values", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("short", "much-longer")).toBe(false);
  });

  it("never permits an existing normalized identity to change owners", () => {
    expect(() => assertAuthIdentityOwnership("user-a", "user-a")).not.toThrow();
    expect(() => assertAuthIdentityOwnership(null, "user-a")).not.toThrow();
    expect(() => assertAuthIdentityOwnership("user-a", "user-b")).toThrow(
      "AUTH_IDENTITY_OWNERSHIP_CONFLICT",
    );
  });

  it("requires an exact same-origin value for state-changing requests", () => {
    expect(
      isTrustedMutationOrigin({
        origin: "https://erp.example.test",
        requestUrl: "https://erp.example.test/sign-out",
        appUrl: "https://erp.example.test",
      }),
    ).toBe(true);
    expect(
      isTrustedMutationOrigin({
        origin: null,
        requestUrl: "https://erp.example.test/sign-out",
        appUrl: "https://erp.example.test",
      }),
    ).toBe(false);
    expect(
      isTrustedMutationOrigin({
        origin: "https://attacker.example",
        requestUrl: "https://erp.example.test/sign-out",
        appUrl: "https://erp.example.test",
      }),
    ).toBe(false);
  });

  it("fails an authentication Server Action closed for hostile or absent Origin", async () => {
    vi.stubEnv("APP_URL", "https://erp.example.test");
    vi.mocked(nextHeaders).mockResolvedValueOnce(
      new Headers({
        origin: "https://attacker.example",
        host: "erp.example.test",
        "x-forwarded-proto": "https",
      }) as Awaited<ReturnType<typeof nextHeaders>>,
    );
    await expect(assertTrustedServerActionOrigin()).rejects.toThrow(
      "ORIGIN_DENIED",
    );
    vi.mocked(nextHeaders).mockResolvedValueOnce(
      new Headers({
        host: "erp.example.test",
        "x-forwarded-proto": "https",
      }) as Awaited<ReturnType<typeof nextHeaders>>,
    );
    await expect(assertTrustedServerActionOrigin()).rejects.toThrow(
      "ORIGIN_DENIED",
    );
    vi.mocked(nextHeaders).mockResolvedValueOnce(
      new Headers({
        origin: "https://erp.example.test",
        host: "erp.example.test",
        "x-forwarded-proto": "https",
      }) as Awaited<ReturnType<typeof nextHeaders>>,
    );
    await expect(assertTrustedServerActionOrigin()).resolves.toBeUndefined();
  });

  it("accepts only one valid proxy-overwritten source address in trusted mode", () => {
    vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "caddy_single_hop");
    expect(getTrustedRequestFingerprint(new Headers({
      "x-forwarded-for": "203.0.113.9",
      "user-agent": "trusted-test"
    }))).toEqual({ sourceAddress: "203.0.113.9", userAgent: "trusted-test" });
    for (const forwardedFor of [
      "203.0.113.9, 10.0.0.1",
      "not-an-address",
      ""
    ]) {
      expect(() => getTrustedRequestFingerprint(new Headers({
        "x-forwarded-for": forwardedFor
      }))).toThrow("AUTH_TRUSTED_PROXY_SOURCE_INVALID");
    }
  });

  it("ignores spoofable forwarded headers outside trusted proxy mode", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "untrusted");
    expect(getTrustedRequestFingerprint(new Headers({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "local-test"
    }))).toEqual({ sourceAddress: "untrusted-direct", userAgent: "local-test" });
  });

  it("requires the Caddy single-hop trust contract in production", () => {
    stubCompleteProductionAuthEnvironment();
    vi.stubEnv("AUTH_TRUSTED_PROXY_MODE", "");
    expect(() => assertProductionAuthConfiguration()).toThrow(
      "AUTH_TRUSTED_PROXY_MODE_INVALID"
    );
  });
});

describe("authentication integration contracts", () => {
  it("keeps the DEC-0050 denial audit window separate from throttle policy", () => {
    expect(AUTHENTICATION_DENIAL_AUDIT_WINDOW_MINUTES).toBe(15);
  });

  it("reserves before gated Argon2 and atomically finalizes before setting the cookie", () => {
    const source = readFileSync(path.resolve(__dirname, "authentication.ts"), "utf8");
    const start = source.indexOf("export async function authenticatePassword");
    const end = source.indexOf("async function findSessionByToken", start);
    const passwordFlow = source.slice(start, end);
    expect(passwordFlow.match(/reserveAuthenticationAttempt\(/g)).toHaveLength(1);
    expect(passwordFlow.indexOf("prisma.authIdentity.findFirst")).toBeLessThan(
      passwordFlow.indexOf("reserveAuthenticationAttempt(")
    );
    expect(passwordFlow.indexOf("reserveAuthenticationAttempt(")).toBeLessThan(
      passwordFlow.indexOf("getDummyPasswordHash()")
    );
    expect(passwordFlow.indexOf("if (!throttle.allowed)")).toBeLessThan(
      passwordFlow.indexOf("getDummyPasswordHash()")
    );
    expect(passwordFlow.indexOf("reserveAuthenticationAttempt(")).toBeLessThan(
      passwordFlow.indexOf("runAuthenticationArgon2(")
    );
    expect(passwordFlow).toContain("finalizePasswordAuthenticationInTransaction");
    expect(passwordFlow.indexOf("prisma.$transaction")).toBeLessThan(
      passwordFlow.indexOf("setSessionCookie(")
    );
    const finalizerStart = source.indexOf(
      "export async function finalizePasswordAuthenticationInTransaction",
    );
    const finalizerEnd = source.indexOf(
      "export async function authenticatePassword",
      finalizerStart,
    );
    const finalizer = source.slice(finalizerStart, finalizerEnd);
    expect(finalizer).toContain("verifiedPasswordHash");
    expect(finalizer.indexOf("tx.auditEvent.create")).toBeLessThan(
      finalizer.indexOf("completeSuccessfulAuthenticationAttemptInTransaction"),
    );
    expect(finalizer).toContain("id: input.reservation.id");
    expect(finalizer).toContain('eventType: "auth.password.succeeded"');
    expect(passwordFlow).not.toContain("authLoginAttempt");
    expect(passwordFlow).not.toContain("auth.login.failed");
  });

  it("uses the current MFA fingerprint and reserves before code or replay validation", () => {
    const source = readFileSync(path.resolve(__dirname, "authentication.ts"), "utf8");
    const failureStart = source.indexOf("export async function recordMfaFailure");
    const challengeStart = source.indexOf("export async function completeMfaChallenge");
    const challengeEnd = source.indexOf("export async function beginMfaStepUp", challengeStart);
    const failureFlow = source.slice(failureStart, challengeStart);
    const challengeFlow = source.slice(challengeStart, challengeEnd);
    expect(failureFlow.match(/reserveAuthenticationAttemptInTransaction\(/g)).toHaveLength(1);
    expect(challengeFlow.match(/reserveAuthenticationAttempt\(/g)).toHaveLength(1);
    expect(challengeFlow).not.toContain("reserveAuthenticationAttemptInTransaction(");
    expect(challengeFlow.indexOf("reserveAuthenticationAttempt(")).toBeLessThan(
      challengeFlow.indexOf("prisma.mfaAuthenticator.findFirst")
    );
    expect(challengeFlow.indexOf("if (!throttle.allowed)")).toBeLessThan(
      challengeFlow.indexOf("tx.mfaAuthenticator.updateMany")
    );
    expect(challengeFlow.indexOf("if (!throttle.allowed)")).toBeLessThan(
      challengeFlow.indexOf("tx.mfaRecoveryCode.updateMany")
    );
    expect(challengeFlow).toContain("sourceSignal: fingerprint.sourceAddress");
    expect(challengeFlow).toContain("fingerprint,");
    expect(challengeFlow).toContain("reservation: throttle.reservation");
    expect(challengeFlow).toContain("lockAndReloadExactMfaAuthenticator");
    expect(challengeFlow).toContain("id: input.reservation.id");
    expect(challengeFlow.indexOf("tx.auditEvent.create")).toBeLessThan(
      challengeFlow.indexOf("completeSuccessfulAuthenticationAttemptInTransaction"),
    );
    expect(source).not.toContain("auth.mfa.challenge_failed");
    expect(source).not.toContain("authLoginAttempt.create");
    expect(source).not.toContain("authLoginAttempt.count");
  });

  it("defines additive credential, MFA, session, and activation records", () => {
    const schema = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/schema.prisma",
      ),
      "utf8",
    );
    for (const model of [
      "AuthIdentity",
      "PasswordCredential",
      "MfaAuthenticator",
      "MfaRecoveryCode",
      "AuthSession",
      "AuthActivationToken",
      "AuthLoginAttempt",
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain("privilegeEpoch");
    expect(schema).toContain("loginCode");
  });

  it("enforces break-glass assignment expiry during context authorization", () => {
    const context = readFileSync(path.resolve(__dirname, "context.ts"), "utf8");
    const breakGlass = readFileSync(
      path.resolve(__dirname, "breakGlassAccess.ts"),
      "utf8",
    );
    expect(context).toContain("startsAt: { lte: now }");
    expect(context).toContain("{ endsAt: { gt: now } }");
    expect(breakGlass).toContain("endsAt: input.requestedUntil");
    const signOutRoute = readFileSync(
      path.resolve(__dirname, "../../app/(auth)/sign-out/route.ts"),
      "utf8",
    );
    expect(signOutRoute).toContain('error: "ORIGIN_DENIED"');
    expect(signOutRoute).toContain("status: 405");
    const instrumentation = readFileSync(
      path.resolve(__dirname, "../../instrumentation.ts"),
      "utf8",
    );
    expect(instrumentation).toContain("assertProductionAuthConfiguration");
  });
});
