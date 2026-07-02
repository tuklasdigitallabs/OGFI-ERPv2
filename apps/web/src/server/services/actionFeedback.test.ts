import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionErrorRedirectPath,
  getActionErrorCode,
  getActionFeedback
} from "./actionFeedback";

const appRoot = path.resolve(__dirname, "../../app/(app)");

const operationalActionPages = [
  "approvals/[id]/page.tsx",
  "adjustments/page.tsx",
  "adjustments/[id]/page.tsx",
  "admin/users/[id]/page.tsx",
  "counts/page.tsx",
  "counts/[id]/page.tsx",
  "items/page.tsx",
  "purchase-orders/page.tsx",
  "purchase-orders/[id]/page.tsx",
  "purchase-requests/page.tsx",
  "purchase-requests/[id]/page.tsx",
  "quotes/page.tsx",
  "receiving/page.tsx",
  "receiving/[id]/page.tsx",
  "suppliers/page.tsx",
  "transfers/page.tsx",
  "transfers/[id]/page.tsx",
  "wastage/page.tsx",
  "wastage/[id]/page.tsx"
];

const projectServiceFiles = [
  "projects.ts",
  "projectTasks.ts",
  "projectMilestones.ts",
  "projectRisks.ts",
  "projectRecordLinks.ts",
  "projectTemplates.ts",
  "projectReports.ts",
  "projectNotifications.ts"
];

const mappedOperationalCodes = [
  "AUTH_REQUIRED",
  "GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED",
  "INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED",
  "INVENTORY_LOCATION_SCOPE_DENIED",
  "INVENTORY_MOVEMENT_BASE_QUANTITY_INVALID",
  "INVENTORY_MOVEMENT_FROZEN_BY_STOCK_COUNT",
  "INVENTORY_SEARCH_QUERY_TOO_LONG",
  "INVALID_STATUS_TRANSITION",
  "ITEM_CATEGORY_HAS_ACTIVE_ITEMS",
  "ITEM_NOT_TRACKED_FOR_INVENTORY",
  "PERMISSION_DENIED",
  "PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED",
  "PROJECT_LIFECYCLE_OPEN_BLOCKERS_BLOCKED",
  "PROJECT_LIFECYCLE_OPEN_RISKS_BLOCKED",
  "PROJECT_MILESTONE_AT_RISK_REASON_REQUIRED",
  "PROJECT_MILESTONE_CANCEL_REASON_REQUIRED",
  "PROJECT_MILESTONE_NOT_FOUND",
  "PROJECT_MILESTONE_PERMISSION_DENIED",
  "PROJECT_MILESTONE_STALE_VERSION",
  "PROJECT_TEMPLATE_CODE_DUPLICATE",
  "PROJECT_TEMPLATE_NOT_DRAFT",
  "PROJECT_TEMPLATE_NOT_FOUND",
  "PROJECT_TEMPLATE_PERMISSION_DENIED",
  "PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE",
  "PROJECT_TASK_REQUIRED_CHECKLIST_INCOMPLETE",
  "PROJECT_RISK_STALE_VERSION",
  "PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED",
  "PURCHASE_ORDER_ISSUE_METHOD_NOT_ALLOWED",
  "PURCHASE_ORDER_NOT_ISSUED_FOR_RESEND",
  "QUOTATION_RECOMMENDATION_NOT_APPROVED_FOR_PO",
  "RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED",
  "SCOPE_DENIED",
  "OPENING_BALANCE_ALREADY_EXISTS",
  "OPENING_BALANCE_EVIDENCE_REQUIRED",
  "OPENING_BALANCE_EXISTING_STOCK_ACTIVITY",
  "STOCK_ADJUSTMENT_ALREADY_POSTED",
  "STOCK_ADJUSTMENT_ALREADY_REVERSED",
  "STOCK_ADJUSTMENT_APPROVAL_ALREADY_SUBMITTED",
  "STOCK_ADJUSTMENT_HAS_NO_LINES",
  "STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING",
  "STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL",
  "STOCK_ADJUSTMENT_POSTING_STATE_CONFLICT",
  "STOCK_ADJUSTMENT_REFERENCE_ALLOCATION_FAILED",
  "STOCK_ADJUSTMENT_REVERSAL_STATE_CONFLICT",
  "STOCK_COUNT_REFERENCE_ALLOCATION_FAILED",
  "SUPPLIER_NOT_ACTIVE_FOR_PO",
  "SUPPLIER_NOT_ACTIVE_FOR_PO_ISSUE",
  "SUPPLIER_QUOTE_LINE_NOT_FOUND",
  "SUPPLIER_QUOTE_LINES_LIMIT_EXCEEDED",
  "TRANSFER_REFERENCE_ALLOCATION_FAILED",
  "TRANSFER_LINE_ALREADY_RECEIVED",
  "UOM_CONVERSION_NOT_FOUND",
  "UOM_HAS_ACTIVE_ITEMS",
  "WASTAGE_APPROVAL_ALREADY_SUBMITTED",
  "WASTAGE_REFERENCE_ALLOCATION_FAILED"
];

describe("action feedback helpers", () => {
  it("turns known service error codes into user-safe feedback", () => {
    expect(
      getActionFeedback({
        error: "WASTAGE_EVIDENCE_REFERENCE_REQUIRED"
      })
    ).toEqual({
      code: "WASTAGE_EVIDENCE_REFERENCE_REQUIRED",
      message: "Evidence is required for this wastage type or policy flag.",
      title: "Action not completed"
    });
  });

  it("keeps unknown but safe service codes generic", () => {
    expect(
      getActionFeedback({
        error: "FUTURE_SAFE_SERVICE_CODE"
      })
    ).toEqual({
      code: "FUTURE_SAFE_SERVICE_CODE",
      message: "The action could not be completed. Review the form and try again.",
      title: "Action not completed"
    });
  });

  it("maps common operational service codes to specific feedback", () => {
    for (const code of mappedOperationalCodes) {
      expect(getActionFeedback({ error: code }), code).toEqual(
        expect.objectContaining({
          code,
          title: "Action not completed",
          message: expect.not.stringContaining(
            "The action could not be completed. Review the form and try again."
          )
        })
      );
    }
  });

  it("maps project tracker service codes to specific feedback", () => {
    const serviceRoot = path.resolve(__dirname);
    const serviceCodes = new Set<string>();

    for (const file of projectServiceFiles) {
      const source = readFileSync(path.join(serviceRoot, file), "utf8");
      for (const match of source.matchAll(/throw new Error\("([A-Z0-9_]+)"\)/g)) {
        const code = match[1];
        if (code) {
          serviceCodes.add(code);
        }
      }
    }

    for (const code of serviceCodes) {
      expect(getActionFeedback({ error: code }), code).toEqual(
        expect.objectContaining({
          code,
          title: "Action not completed",
          message: expect.not.stringContaining(
            "The action could not be completed. Review the form and try again."
          )
        })
      );
    }
  });

  it("maps item master service codes to specific feedback", () => {
    const source = readFileSync(path.resolve(__dirname, "items.ts"), "utf8");
    const serviceCodes = new Set<string>();

    for (const match of source.matchAll(/throw new Error\("([A-Z0-9_]+)"\)/g)) {
      const code = match[1];
      if (code) {
        serviceCodes.add(code);
      }
    }

    for (const code of serviceCodes) {
      expect(getActionFeedback({ error: code }), code).toEqual(
        expect.objectContaining({
          code,
          title: "Action not completed",
          message: expect.not.stringContaining(
            "The action could not be completed. Review the form and try again."
          )
        })
      );
    }
  });

  it("ignores unsafe query-string error values", () => {
    expect(
      getActionFeedback({
        error: "Internal database error: select * from users"
      })
    ).toBeNull();
  });

  it("sanitizes thrown errors before building redirect URLs", () => {
    expect(getActionErrorCode(new Error("TRANSFER_QUANTITY_INVALID"))).toBe(
      "TRANSFER_QUANTITY_INVALID"
    );
    expect(getActionErrorCode(new Error("Internal database error"))).toBe(
      "ACTION_FAILED"
    );
    expect(actionErrorRedirectPath("/transfers", new Error("TRANSFER_QUANTITY_INVALID"))).toBe(
      "/transfers?error=TRANSFER_QUANTITY_INVALID"
    );
    expect(
      actionErrorRedirectPath(
        "/work-calendar?projectId=project-1",
        new Error("PROJECT_MILESTONE_STALE_VERSION")
      )
    ).toBe("/work-calendar?projectId=project-1&error=PROJECT_MILESTONE_STALE_VERSION");
  });

  it("keeps operational action pages wired to sanitized user feedback", () => {
    for (const page of operationalActionPages) {
      const source = readFileSync(path.join(appRoot, page), "utf8");

      expect(source, page).toContain("ActionFeedbackBanner");
      expect(source, page).toContain("getActionFeedback");
      expect(source, page).toContain("actionErrorRedirectPath");
    }
  });
});
