import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("auth provider invalidation register", () => {
  test("privilege epoch changes create provider-neutral invalidation records", () => {
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707170000_auth_session_invalidations/migration.sql"
      ),
      "utf8"
    );
    const authInvalidationSource = readFileSync(
      path.resolve(__dirname, "authInvalidation.ts"),
      "utf8"
    );
    const coreAdminSource = readFileSync(path.resolve(__dirname, "coreAdmin.ts"), "utf8");
    const contextSource = readFileSync(path.resolve(__dirname, "context.ts"), "utf8");
    const adminPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/session-invalidation/page.tsx"),
      "utf8"
    );
    const shellNavigationSource = readFileSync(
      path.resolve(__dirname, "../../components/ShellNavigation.tsx"),
      "utf8"
    );
    const actionFeedbackSource = readFileSync(
      path.resolve(__dirname, "actionFeedback.ts"),
      "utf8"
    );

    expect(schemaSource).toContain("model AuthSessionInvalidation");
    expect(migrationSource).toContain('CREATE TABLE "AuthSessionInvalidation"');
    expect(authInvalidationSource).toContain("recordAuthSessionInvalidation");
    expect(authInvalidationSource).toContain("listAuthSessionInvalidations");
    expect(authInvalidationSource).toContain("completeAuthSessionInvalidation");
    expect(authInvalidationSource).toContain('status: "PENDING_PROVIDER"');
    expect(authInvalidationSource).toContain('status: "PROVIDER_COMPLETED"');
    expect(authInvalidationSource).toContain(
      "AUTH_SESSION_INVALIDATION_SELF_COMPLETION_BLOCKED"
    );
    expect(authInvalidationSource).toContain(
      "existing.requestedByUserId === session.user.id"
    );
    expect(authInvalidationSource).toContain(
      "auth_session_invalidation.provider_completed"
    );
    expect(authInvalidationSource).toContain("AUTH_PROVIDER_NAME");
    expect(coreAdminSource).toContain("recordAuthSessionInvalidation(tx");
    expect(coreAdminSource).toContain("Privilege epoch changed");
    expect(contextSource).toContain("assertSessionFresh");
    expect(contextSource).toContain("SESSION_REVALIDATION_REQUIRED");
    expect(adminPageSource).toContain("Provider-neutral register");
    expect(adminPageSource).toContain("Complete Provider Invalidation");
    expect(adminPageSource).toContain("separate");
    expect(adminPageSource).toContain("listAuthSessionInvalidations(session)");
    expect(shellNavigationSource).toContain("Session Invalidation");
    expect(shellNavigationSource).toContain("/admin/session-invalidation");
    expect(actionFeedbackSource).toContain("AUTH_SESSION_INVALIDATION_NOT_FOUND");
  });
});
