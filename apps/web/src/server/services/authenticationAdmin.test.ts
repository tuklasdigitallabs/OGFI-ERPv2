import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("authentication recovery bounded queue contract", () => {
  test("keeps recovery reads bounded and selected actions server-authoritative", () => {
    const service = readFileSync(path.resolve(__dirname, "authenticationAdmin.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/authentication/page.tsx"), "utf8");
    const loading = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/authentication/loading.tsx"), "utf8");
    expect(service).toContain("listAuthRecoveryRequestPage");
    expect(service).toContain("listAuthRecoveryTargetCatalog");
    expect(service).toContain("take: 101");
    expect(service).toContain("skip: (page - 1) * values.pageSize");
    expect(service).toContain("totalItems");
    expect(service).toContain("status: \"PENDING\"");
    expect(service).toContain("AUTH_RECOVERY_LOCAL_IDENTITY_REQUIRED");
    expect(service).toContain("invalidInput");
    expect(service).toContain("updateMany");
    expect(page).toContain("PaginationBar");
    expect(page).toContain("TaskSheet");
    expect(page).toContain("View audit");
    expect(page).toContain("AUTH_RECOVERY_INVALID_INTENT");
    expect(page).toContain("Clear filters");
    expect(loading).toContain("Loading Authentication Recovery");
    expect(page).toContain("Open details");
    expect(page).toContain("Account readiness");
    expect(page).not.toContain("listAuthRecoveryRequests(session)");
  });

  test("keeps manual temporary credentials bounded, privileged-denied, and secret-free", () => {
    const service = readFileSync(path.resolve(__dirname, "authenticationAdmin.ts"), "utf8");
    const auth = readFileSync(path.resolve(__dirname, "authentication.ts"), "utf8");
    const schema = readFileSync(path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"), "utf8");
    const migration = readFileSync(path.resolve(__dirname, "../../../../../packages/database/prisma/migrations/20260731170000_manual_temporary_password_expiry/migration.sql"), "utf8");
    expect(schema).toContain("temporaryPasswordExpiresAt");
    expect(schema).toContain("temporaryPasswordUsedAt");
    expect(migration).toContain("temporaryPasswordExpiresAt");
    expect(service).toContain("issueTemporaryPassword");
    expect(service).toContain("AUTH_TEMPORARY_PASSWORD_PRIVILEGED_TARGET_DENIED");
    expect(service).toContain("AUTH_TEMPORARY_PASSWORD_SELF_ISSUE_BLOCKED");
    expect(service).toContain("assertTargetUserInCompanyScope");
    expect(service).toContain("temporaryPasswordUsedAt: null");
    expect(service).toContain('eventType: "auth.temporary_password.issued"');
    expect(service).not.toContain("metadata: { sourceDecisionId: \"DEC-0040\", password");
    expect(auth).toContain('"PASSWORD_CHANGE_REQUIRED"');
    expect(auth).toContain("temporaryPasswordUsedAt: null");
    expect(auth).toContain("changeRequiredPassword");
    expect(auth).toContain("exceptSessionId: session.id");
    expect(auth).toContain("temporaryPasswordExpiresAt: null");
  });
});
