import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import path from "node:path";

describe("operational reason-code registry contract", () => {
  test("uses selected-company bounded server pagination and scoped detail", () => {
    const service = readFileSync(path.resolve(__dirname, "operationalReasonCodes.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/admin/reason-codes/page.tsx"),
      "utf8",
    );
    expect(service).toContain("listOperationalReasonCodePage");
    expect(service).toContain("assertCanManageReasonCodes(session)");
    expect(service).toContain("tenantId: session.context.tenantId");
    expect(service).toContain("companyId: session.context.companyId");
    expect(service).toContain("skip: (values.page - 1) * values.pageSize");
    expect(service).toContain('take: values.pageSize');
    expect(service).toContain('{ id: "asc" }');
    expect(service).toContain("getOperationalReasonCodeDetail");
    expect(page).toContain("PaginationBar");
    expect(page).toContain("View details");
    expect(page).toContain("selectedReasonCodeId");
    expect(page).not.toContain("listOperationalReasonCodes(session)");
  });
});
