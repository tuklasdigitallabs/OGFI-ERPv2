import { describe, expect, it } from "vitest";
import { assertDisposableAuthorizationDatabaseConfigured } from "./authorizationDatabaseSafety";

describe("authorization database safety sentinel", () => {
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
        DATABASE_URL: "postgresql://localhost/ogfi_production",
        AUTHORIZATION_DATABASE_INTEGRATION: "yes",
        AUTHORIZATION_TEST_DATABASE: "ogfi_production",
        AUTHORIZATION_TEST_RUN_ID: "test-run-1",
      }),
    ).toThrow("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
    expect(() =>
      assertDisposableAuthorizationDatabaseConfigured({
        DATABASE_URL: "postgresql://localhost/ogfi_authz_test",
        AUTHORIZATION_DATABASE_INTEGRATION: "yes",
        AUTHORIZATION_TEST_DATABASE: "different_authz_test",
        AUTHORIZATION_TEST_RUN_ID: "test-run-1",
      }),
    ).toThrow("AUTHORIZATION_DATABASE_NOT_DISPOSABLE");
  });

  it("accepts only an exact disposable database identity", () => {
    expect(
      assertDisposableAuthorizationDatabaseConfigured({
        DATABASE_URL: "postgresql://localhost/ogfi_authz_test?schema=public",
        AUTHORIZATION_DATABASE_INTEGRATION: "yes",
        AUTHORIZATION_TEST_DATABASE: "ogfi_authz_test",
        AUTHORIZATION_TEST_RUN_ID: "test-run-1",
      }),
    ).toBe("ogfi_authz_test");
  });
});
