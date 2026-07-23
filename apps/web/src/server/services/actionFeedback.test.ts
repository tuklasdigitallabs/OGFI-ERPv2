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
  "branch-operations/[id]/page.tsx",
  "food-safety/[id]/page.tsx",
  "incidents/page.tsx",
  "incidents/[id]/page.tsx",
  "items/page.tsx",
  "maintenance/page.tsx",
  "maintenance/[id]/page.tsx",
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
  "AUTHENTICATION_CAPACITY_TEMPORARILY_UNAVAILABLE",
  "GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED",
  "GOODS_RECEIPT_DISCREPANCY_CONFLICT",
  "GOODS_RECEIPT_PURCHASE_ORDER_LINE_MISMATCH",
  "INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED",
  "INVENTORY_LOCATION_SCOPE_DENIED",
  "INVENTORY_MOVEMENT_BASE_QUANTITY_INVALID",
  "INVENTORY_MOVEMENT_FROZEN_BY_STOCK_COUNT",
  "INVENTORY_SEARCH_QUERY_TOO_LONG",
  "INVALID_STATUS_TRANSITION",
  "MFA_CHALLENGE_TEMPORARILY_THROTTLED",
  "ITEM_CATEGORY_HAS_ACTIVE_ITEMS",
  "ITEM_NOT_TRACKED_FOR_INVENTORY",
  "BRANCH_CHECKLIST_EXCEPTION_REVIEW_REQUIRED",
  "BRANCH_CHECKLIST_ALREADY_EXISTS",
  "BRANCH_CHECKLIST_LINES_REQUIRED",
  "BRANCH_CHECKLIST_LINE_INDEX_INVALID",
  "BRANCH_BUSINESS_DATE_INVALID",
  "BRANCH_CHECKLIST_NOT_FOUND",
  "BRANCH_REVIEWED_AT_INVALID",
  "BRANCH_CHECKLIST_REVIEW_CONFLICT",
  "BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED",
  "BRANCH_CHECKLIST_STATUS_NOT_REVIEWABLE",
  "BRANCH_CHECKLIST_STATUS_NOT_CLOSABLE",
  "BRANCH_CHECKLIST_CLOSE_CONFLICT",
  "BRANCH_CHECKLIST_STATUS_NOT_CORRECTABLE",
  "BRANCH_CHECKLIST_CORRECTION_CONFLICT",
  "BRANCH_REVIEWED_AT_BEFORE_BUSINESS_DATE",
  "FOOD_SAFETY_EXCEPTION_REVIEW_REQUIRED",
  "FOOD_SAFETY_LOG_ALREADY_EXISTS",
  "FOOD_SAFETY_READINGS_REQUIRED",
  "FOOD_SAFETY_READING_INDEX_INVALID",
  "FOOD_SAFETY_BUSINESS_DATE_INVALID",
  "FOOD_SAFETY_READING_VALUE_INVALID",
  "FOOD_SAFETY_LOG_NOT_FOUND",
  "FOOD_SAFETY_LOG_STATUS_NOT_REVIEWABLE",
  "FOOD_SAFETY_REVIEWED_AT_INVALID",
  "FOOD_SAFETY_REVIEW_CONFLICT",
  "FOOD_SAFETY_REVIEWED_AT_BEFORE_BUSINESS_DATE",
  "FOOD_SAFETY_SELF_REVIEW_BLOCKED",
  "FOOD_SAFETY_LOG_STATUS_NOT_CLOSABLE",
  "FOOD_SAFETY_CLOSE_CONFLICT",
  "FOOD_SAFETY_LOG_STATUS_NOT_CORRECTABLE",
  "FOOD_SAFETY_CORRECTION_CONFLICT",
  "INCIDENT_NOT_FOUND",
  "INCIDENT_DATE_INVALID",
  "INCIDENT_DUE_DATE_INVALID",
  "INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE",
  "INCIDENT_RESOLVED_AT_INVALID",
  "INCIDENT_RESOLVED_AT_BEFORE_INCIDENT_DATE",
  "INCIDENT_RESOLUTION_CONFLICT",
  "INCIDENT_NUMBER_GENERATION_FAILED",
  "INCIDENT_STATUS_NOT_RESOLVABLE",
  "INCIDENT_STATUS_NOT_CANCELLABLE",
  "INCIDENT_CANCELLATION_CONFLICT",
  "INCIDENT_STATUS_NOT_CORRECTABLE",
  "INCIDENT_CORRECTION_CONFLICT",
  "INCIDENT_SOURCE_RECORD_NOT_FOUND_OR_UNSCOPED",
  "MAINTENANCE_COMPLETED_AT_INVALID",
  "MAINTENANCE_COMPLETED_AT_BEFORE_REQUESTED_AT",
  "MAINTENANCE_REQUESTED_AT_INVALID",
  "MAINTENANCE_TARGET_DUE_AT_INVALID",
  "MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT",
  "MAINTENANCE_TICKET_COMPLETION_CONFLICT",
  "MAINTENANCE_TICKET_NUMBER_RETRY_EXHAUSTED",
  "MAINTENANCE_TICKET_NOT_FOUND",
  "MAINTENANCE_TICKET_STATUS_NOT_COMPLETABLE",
  "MAINTENANCE_TICKET_STATUS_NOT_CANCELLABLE",
  "MAINTENANCE_TICKET_CANCELLATION_CONFLICT",
  "MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE",
  "MAINTENANCE_TICKET_CORRECTION_CONFLICT",
  "MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED",
  "PERMISSION_DENIED",
  "PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED",
  "PHASE2_WORKFLOW_REASON_REQUIRED",
  "PHASE2_WORKFLOW_EVIDENCE_REQUIRED",
  "RECIPE_VERSION_NOT_FOUND",
  "RECIPE_VERSION_SELF_APPROVAL_BLOCKED",
  "RECIPE_VERSION_TRANSITION_CONFLICT",
  "RECIPE_NOT_FOUND",
  "RECIPE_ARCHIVED_NOT_EDITABLE",
  "RECIPE_OPEN_VERSION_EXISTS",
  "RECIPE_OPEN_VERSION_BLOCKS_ARCHIVE",
  "RECIPE_ALREADY_ARCHIVED",
  "RECIPE_ARCHIVE_CONFLICT",
  "RECIPE_REVISION_LINE_QUANTITY_INVALID",
  "RECIPE_DUPLICATE_LINE_NOT_ALLOWED",
  "RECIPE_LINE_SORT_ORDER_INVALID",
  "RECIPE_SUB_RECIPE_VERSION_NOT_FOUND",
  "RECIPE_CODE_DUPLICATE",
  "RECIPE_LINES_REQUIRED",
  "RECIPE_LINES_LIMIT_EXCEEDED",
  "RECIPE_LINE_INDEX_INVALID",
  "RECIPE_LINE_ITEM_NOT_FOUND",
  "RECIPE_LINE_UOM_NOT_FOUND",
  "RECIPE_TARGET_FOOD_COST_INVALID",
  "MENU_PRICE_DECISION_NOT_FOUND",
  "MENU_PRICE_DECISION_EFFECTIVE_RANGE_INVALID",
  "MENU_PRICE_DECISION_SELF_APPROVAL_BLOCKED",
  "MENU_PRICE_DECISION_TRANSITION_CONFLICT",
  "MENU_ITEM_NOT_FOUND",
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
  "RECEIVING_STATUS_FILTER_INVALID",
  "RECEIVING_DATE_FILTER_INVALID",
  "RECEIVING_DATE_FILTER_RANGE_INVALID",
  "RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG",
  "RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED",
  "RECEIVING_FOLLOW_UP_REASON_UNAVAILABLE",
  "RECEIVING_SEARCH_QUERY_TOO_LONG",
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
  it("provides specific user-safe messages for Receiving validation and conflict errors", () => {
    const codes = [
      "RECEIVING_STATUS_FILTER_INVALID",
      "RECEIVING_DATE_FILTER_INVALID",
      "RECEIVING_DATE_FILTER_RANGE_INVALID",
      "RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG",
      "RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED",
      "RECEIVING_FOLLOW_UP_REASON_UNAVAILABLE",
      "RECEIVING_SEARCH_QUERY_TOO_LONG",
      "GOODS_RECEIPT_DISCREPANCY_CONFLICT",
      "GOODS_RECEIPT_PURCHASE_ORDER_LINE_MISMATCH"
    ];
    for (const code of codes) {
      const feedback = getActionFeedback({ error: code });
      expect(feedback?.message).toBeTruthy();
      expect(feedback?.message).not.toBe("The action could not be completed. Review the form and try again.");
    }
  });

  it("does not distinguish missing local accounts from invalid credentials", () => {
    expect(getActionFeedback({ error: "LOGIN_ACCOUNT_NOT_FOUND" })?.message).toBe(
      getActionFeedback({ error: "LOGIN_CREDENTIALS_INVALID" })?.message
    );
  });

  it("maps approval routing races and deployment gates to safe guidance", () => {
    for (const code of [
      "APPROVAL_AUTHORITY_STALE",
      "APPROVAL_NEXT_STEP_ROUTING_CHANGED",
      "APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE",
      "APPROVAL_ROUTING_BACKFILL_REQUIRED",
      "APPROVAL_ROUTING_V1_DISABLED"
    ]) {
      const feedback = getActionFeedback({ error: code });
      expect(feedback?.message, code).not.toContain("The action could not be completed");
      expect(feedback?.message, code).not.toMatch(/database|tenant|row|flag/i);
    }
  });

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
