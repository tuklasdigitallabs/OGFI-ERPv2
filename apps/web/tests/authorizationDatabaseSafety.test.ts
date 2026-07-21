import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

describe("authorization database safety sentinel", () => {
  const safe = {
    DATABASE_URL:
      "postgresql://ogfi_test_test_run_1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_runtime:secret@localhost:5432/ogfi_test_test_run_1_aaaaaaaaaaaaaaaa?schema=public",
    AUTHORIZATION_DATABASE_INTEGRATION: "yes",
    AUTHORIZATION_TEST_DATABASE: "ogfi_test_test_run_1_aaaaaaaaaaaaaaaa",
    AUTHORIZATION_TEST_DATABASE_HOST: "localhost",
    AUTHORIZATION_TEST_DATABASE_PORT: "5432",
    AUTHORIZATION_TEST_RUN_ID: "test-run-1",
    AUTHORIZATION_TEST_RUNTIME_ROLE:
      "ogfi_test_test_run_1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_runtime",
    AUTHORIZATION_TEST_DATABASE_NONCE_SHA256: "b".repeat(64),
  } satisfies NodeJS.ProcessEnv;

  it("rejects missing sentinel and ordinary database identities", () => {
    expect(() =>
      assertDisposableAuthorizationDatabaseConfigured({
        DATABASE_URL: "postgresql://localhost/ogfi_production",
        AUTHORIZATION_TEST_DATABASE: "ogfi_production",
        AUTHORIZATION_TEST_RUN_ID: "test-run-1",
      }),
    ).toThrow("AUTHORIZATION_DATABASE_SENTINEL_REQUIRED");
    expect(() =>
      assertDisposableAuthorizationDatabaseConfigured({
        ...safe,
        DATABASE_URL: "postgresql://localhost/ogfi_production",
        AUTHORIZATION_TEST_DATABASE: "ogfi_production",
      }),
    ).toThrow("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
    expect(() =>
      assertDisposableAuthorizationDatabaseConfigured({
        ...safe,
        DATABASE_URL: "postgresql://localhost/ogfi_authz_test",
        AUTHORIZATION_TEST_DATABASE: "different_authz_test",
      }),
    ).toThrow("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
  });

  it("accepts only an exact disposable database identity", () => {
    expect(
      assertDisposableAuthorizationDatabaseConfigured(safe),
    ).toBe("ogfi_test_test_run_1_aaaaaaaaaaaaaaaa");
  });

  it("attests the in-database marker and runtime session identity", async () => {
    let issuedQuery = "";
    const probe = {
      $queryRawUnsafe: async (query: string) => {
        issuedQuery = query;
        return [
          {
            currentDatabase: safe.AUTHORIZATION_TEST_DATABASE,
            currentUser: safe.AUTHORIZATION_TEST_RUNTIME_ROLE,
            databaseName: safe.AUTHORIZATION_TEST_DATABASE,
            nonceSha256: safe.AUTHORIZATION_TEST_DATABASE_NONCE_SHA256,
            runId: safe.AUTHORIZATION_TEST_RUN_ID,
            sessionUser: safe.AUTHORIZATION_TEST_RUNTIME_ROLE,
          },
        ];
      },
    };
    await expect(
      assertDisposableAuthorizationDatabaseMarker(probe, safe),
    ).resolves.toBe(safe.AUTHORIZATION_TEST_DATABASE);
    expect(issuedQuery).toContain(
      "ogfi_disposable_control.verify_database_identity()",
    );
    expect(issuedQuery).not.toContain("FROM ogfi_disposable_control.database_identity");
    await expect(
      assertDisposableAuthorizationDatabaseMarker(
        {
          $queryRawUnsafe: async () => [
            { ...(await probe.$queryRawUnsafe())[0], runId: "wrong-run" },
          ],
        },
        safe,
      ),
    ).rejects.toThrow("AUTHORIZATION_DATABASE_MARKER_MISMATCH");
  });

  it("rejects host, role, fixed-name, malformed marker, and credential overlap", () => {
    for (const override of [
      { AUTHORIZATION_TEST_DATABASE_HOST: "127.0.0.1" },
      { AUTHORIZATION_TEST_RUNTIME_ROLE: "postgres" },
      { AUTHORIZATION_TEST_DATABASE: "shared_authz_test" },
      { AUTHORIZATION_TEST_DATABASE_NONCE_SHA256: "not-a-hash" },
      { DISPOSABLE_DATABASE_ADMIN_URL: "postgresql://postgres:secret@localhost/postgres" },
      { MIGRATOR_DATABASE_URL: "postgresql://migrator:secret@localhost/test" },
      { MIGRATOR_DSN: "postgresql://migrator:secret@localhost/test" },
      { ALTERNATE_DATABASE_URL: "postgresql://owner:secret@localhost/test" },
      { POSTGRES_USER: "postgres" },
      { OGFI_DISPOSABLE_DATABASE_NONCE: "teardown-authority" },
      { DISPOSABLE_DATABASE_CONFIRMATION: "teardown-authority" },
    ]) {
      expect(() =>
        assertDisposableAuthorizationDatabaseConfigured({ ...safe, ...override }),
      ).toThrow("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
    }
  });

  it("forbids protected-history mutation through any client or transaction alias", () => {
    const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = path.resolve(testsDirectory, "../../..");
    const mutation =
      /\b(auditEvent|projectActivityEvent|inventoryMovement)\s*\.\s*(delete|deleteMany|update|updateMany|upsert)\s*\(/;
    const files = [
      ...readdirSync(testsDirectory)
        .filter((name) => name.endsWith(".integration.test.ts"))
        .map((name) => path.join(testsDirectory, name)),
      ...sourceFiles(path.join(workspaceRoot, "packages/database/src")),
      ...sourceFiles(path.join(workspaceRoot, "scripts")),
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), path.relative(workspaceRoot, file)).not.toMatch(
        mutation,
      );
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(?:[cm]?js|tsx?)$/.test(entry.name) ? [resolved] : [];
  });
}
