import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("authentication recovery bounded queue contract", () => {
  test("keeps recovery reads bounded and selected actions server-authoritative", () => {
    const service = readFileSync(path.resolve(__dirname, "authenticationAdmin.ts"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../../app/(app)/admin/authentication/page.tsx"), "utf8");
    expect(service).toContain("listAuthRecoveryRequestPage");
    expect(service).toContain("skip: (page - 1) * values.pageSize");
    expect(service).toContain("totalItems");
    expect(service).toContain("status: \"PENDING\"");
    expect(service).toContain("AUTH_RECOVERY_LOCAL_IDENTITY_REQUIRED");
    expect(service).toContain("updateMany");
    expect(page).toContain("PaginationBar");
    expect(page).toContain("TaskSheet");
    expect(page).toContain("Open details");
    expect(page).toContain("Account readiness");
    expect(page).not.toContain("listAuthRecoveryRequests(session)");
  });
});
