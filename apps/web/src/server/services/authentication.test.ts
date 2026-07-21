import { readFileSync } from "node:fs";
import path from "node:path";
import { headers as nextHeaders } from "next/headers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionAuthConfiguration,
  assertAuthIdentityOwnership,
  assertTrustedServerActionOrigin,
  constantTimeEqual,
  decryptSensitiveValue,
  encryptSensitiveValue,
  getAuthMode,
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
  vi.stubEnv("AUTH_SECRET", "a".repeat(32));
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
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
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
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
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
      ["AUTH_LOGIN_WINDOW_MINUTES", "0"],
      ["AUTH_LOGIN_ACCOUNT_LIMIT", "101"],
      ["AUTH_LOGIN_SOURCE_LIMIT", "1001"],
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
});

describe("authentication integration contracts", () => {
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
