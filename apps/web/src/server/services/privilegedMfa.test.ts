import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { privilegedMfaStatuses } from "./privilegedMfa";

describe("privileged MFA enrollment evidence controls", () => {
  test("MFA register stays evidence-only and enforces privileged targeting, separation, and audit", () => {
    const serviceSource = readFileSync(path.resolve(__dirname, "privilegedMfa.ts"), "utf8");
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/mfa/page.tsx"),
      "utf8"
    );
    const navSource = readFileSync(
      path.resolve(__dirname, "../../components/ShellNavigation.tsx"),
      "utf8"
    );
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707161000_privileged_mfa_enrollments/migration.sql"
      ),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(privilegedMfaStatuses).toEqual([
      "PENDING_VERIFICATION",
      "VERIFIED",
      "REVOKED"
    ]);
    expect(schemaSource).toContain("model PrivilegedMfaEnrollment");
    expect(migrationSource).toContain('CREATE TABLE "PrivilegedMfaEnrollment"');
    expect(serviceSource).toContain("isSensitivePermissionCode");
    expect(serviceSource).toContain("PRIVILEGED_MFA_SELF_ATTESTATION_BLOCKED");
    expect(serviceSource).toContain("PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED");
    expect(serviceSource).toContain("PRIVILEGED_MFA_TARGET_NOT_PRIVILEGED");
    expect(serviceSource).toContain('eventType: "privileged_mfa_enrollment.recorded"');
    expect(serviceSource).toContain('eventType: "privileged_mfa_enrollment.verified"');
    expect(serviceSource).toContain('eventType: "privileged_mfa_enrollment.revoked"');
    expect(serviceSource).toContain("ERP records MFA enrollment evidence only");
    expect(pageSource).toContain("ERP-side enrollment evidence tracking only");
    expect(pageSource).toContain("does not replace runtime MFA authentication at sign-in");
    expect(pageSource).toContain("External IdP/provider or vault proof");
    expect(pageSource).toContain("Preflight ready for strict privileged MFA enforcement");
    expect(pageSource).toContain("Keep privileged MFA in warn/audit mode");
    expect(navSource).toContain("MFA Enrollment");
    expect(feedbackSource).toContain("PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND");
  });
});
