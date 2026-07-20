import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { breakGlassAccessStatuses } from "./breakGlassAccess";

describe("break-glass access controls", () => {
  test("break-glass lifecycle keeps expiry, no self-approval, audit, and privilege epoch controls explicit", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "breakGlassAccess.ts"),
      "utf8"
    );
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/break-glass/page.tsx"),
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
        "../../../../../packages/database/prisma/migrations/20260707152000_break_glass_access_grants/migration.sql"
      ),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");

    expect(breakGlassAccessStatuses).toEqual([
      "PENDING_REVIEW",
      "ACTIVE",
      "REVOKED",
      "EXPIRED",
      "REJECTED",
      "POST_REVIEWED"
    ]);
    expect(schemaSource).toContain("model BreakGlassAccessGrant");
    expect(migrationSource).toContain('CREATE TABLE "BreakGlassAccessGrant"');
    expect(serviceSource).toContain("breakGlassMaxDurationHours = 24");
    expect(serviceSource).toContain("BREAK_GLASS_SELF_REQUEST_BLOCKED");
    expect(serviceSource).toContain("BREAK_GLASS_SELF_APPROVAL_BLOCKED");
    expect(serviceSource).toContain("BREAK_GLASS_SELF_REVIEW_BLOCKED");
    expect(serviceSource).toContain("expireActiveBreakGlassGrants");
    expect(serviceSource).toContain("createBreakGlassAssignment");
    expect(serviceSource).toContain("await touchUserPrivilegeEpoch(tx, grant.targetUserId)");
    expect(serviceSource).toContain('eventType: "break_glass_access.requested"');
    expect(serviceSource).toContain('eventType: "break_glass_access.activated"');
    expect(serviceSource).toContain('eventType: "break_glass_access.revoked"');
    expect(serviceSource).toContain('eventType: "break_glass_access.expired"');
    expect(serviceSource).toContain('eventType: "break_glass_access.post_reviewed"');
    expect(pageSource).toContain("Break-glass register");
    expect(pageSource).toContain("Request Break-Glass Access");
    expect(pageSource).toContain("Complete Break-Glass Post-Review");
    expect(navSource).toContain("Break-Glass Access");
    expect(feedbackSource).toContain("BREAK_GLASS_EXPIRY_TOO_LONG");
    expect(feedbackSource).toContain("BREAK_GLASS_POST_REVIEW_NOT_READY");
  });
});
