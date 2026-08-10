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
    const selection = readFileSync(
      path.resolve(__dirname, "../../components/ReasonCodeRegisterSelection.tsx"),
      "utf8",
    );
    const modal = readFileSync(
      path.resolve(__dirname, "../../components/EntryModal.tsx"),
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
    expect(service).toContain("listActiveWastageReasonCodes");
    expect(service).toContain("requireActiveWastageReasonCode");
    expect(service).toContain("wastageTypes");
    expect(service).toContain("inventoryClasses");
    expect(service).toContain("OPERATIONAL_REASON_CODE_INVALID");
    expect(service).toContain("updateMany");
    expect(service).toContain('status: "ACTIVE"');
    expect(service).toContain("transition.count !== 1");
    expect(page).toContain("PaginationBar");
    expect(page).toContain("ReasonCodeRegisterSelection");
    expect(page).toContain("ReasonCodeSelectableRecord");
    expect(page).toContain("defaultOpen");
    expect(page).toContain('eyebrowLabel="Master data record"');
    expect(page).toContain('endpoint="/api/admin/reason-codes/update"');
    expect(page).toContain('endpoint="/api/admin/reason-codes/deactivate"');
    expect(page).not.toContain("TaskSheet");
    expect(page).not.toContain("View details");
    expect(page).not.toContain('>Open details<');
    expect(page).toContain("selectedReasonCodeId");
    expect(page).not.toContain("listOperationalReasonCodes(session)");
    expect(selection).toContain('current === reasonCodeId ? "" : reasonCodeId');
    expect(selection).toContain('destination.searchParams.set("reasonCodeId", selectedReasonCodeId)');
    expect(selection).toContain("aria-pressed={selected}");
    expect(selection).toContain('role="button"');
    expect(selection).toContain("Open Reason Code");
    expect(selection).not.toContain('type="radio"');
    expect(modal).toContain("defaultOpen = false");
    expect(modal).toContain('router.replace(returnHref, { scroll: false })');
  });
});
