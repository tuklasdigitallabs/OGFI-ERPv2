import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { PURCHASE_REQUEST_MAX_LINES } from "../../lib/workflowLimits";
import { defaultPolicySettings } from "./policySettings";
import {
  getCatalogLineUomRequirementIssue,
  getPurchaseRequestSlaLabel,
  getPurchaseRequestSlaStatus,
  isEmergencyPurchaseUrgency,
  purchaseRequestDashboardProfileHref,
  purchaseRequestDashboardProfiles,
  resolvePurchaseRequestDashboardProfile,
  resolvePurchaseRequestApprovalRule
} from "./purchaseRequests";

describe("purchase request workflow controls", () => {
  test("keeps the dashboard open-PR contract closed and includes approved requests", () => {
    expect(resolvePurchaseRequestDashboardProfile("purchase-request-open-v1")).toBe(
      "purchase-request-open-v1",
    );
    expect(resolvePurchaseRequestDashboardProfile("open")).toBeNull();
    expect(
      resolvePurchaseRequestDashboardProfile("purchase-request-open-v1&status=CANCELLED"),
    ).toBeNull();
    expect(purchaseRequestDashboardProfileHref("purchase-request-open-v1")).toBe(
      "/purchase-requests?dashboard=purchase-request-open-v1",
    );
    expect(purchaseRequestDashboardProfiles).toEqual(["purchase-request-open-v1"]);
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8",
    );
    expect(serviceSource).toContain(
      '[{ requiredDate: "asc" }, { createdAt: "asc" }, { id: "asc" }]',
    );
  });

  test("initial approval routing is normalized and fails before source transition", () => {
    const source = readFileSync(path.resolve(__dirname, "purchaseRequests.ts"), "utf8");
    const start = source.indexOf("export async function submitPurchaseRequest");
    const end = source.indexOf("export function assertCanReopenReturnedPurchaseRequest", start);
    const submit = source.slice(start, end);

    expect(submit).toContain("for (const step of routedSteps)");
    expect(submit).toContain("configureApprovalStepRouting(tx");
    expect(submit).toContain("requiredPermissionCode: permissions.purchaseRequestApprove");
    expect(submit).toContain("dueAt: new Date(`${existing.requiredDate}T00:00:00.000Z`)");
    expect(submit).toContain('source: "purchase-request-submission"');
    expect(submit).toContain('scopeType: "LOCATION"');
    expect(submit).toContain("locationId: existing.requestLocationId");
    expect(submit).toContain("userId: existing.requesterUserId");
    expect(submit).toContain("assertAnyEligibleApprovalActorForStep(tx");
    expect(submit.indexOf("assertAnyEligibleApprovalActorForStep(tx")).toBeLessThan(
      submit.indexOf("await tx.purchaseRequest.update")
    );
    expect(submit).toContain("if (existing.requesterUserId !== session.user.id)");
    expect(submit).toContain('throw new Error("PERMISSION_DENIED")');
    expect(submit).toContain("actorUserId: firstRoutedStep.userId");
    expect(submit).toContain("if (firstRoutedStep.userId)");
    expect(submit).toContain("recordApprovalStepReadyNotification(tx");
    expect(submit).toContain("recipientUserId: firstRoutedStep.userId");
    expect(submit).toContain("approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId");
    expect(submit).toContain("requiredPermissionCode: permissions.purchaseRequestApprove");
    expect(submit).not.toContain("firstEligibleActor.userId");
    expect(submit).not.toContain('recipientBasis: "assigned_role"');
    expect(submit).not.toContain("resolveScopedNotificationRecipients");
  });

  test("keeps My Tasks draft submission requester-owned and excludes on-behalf inference", () => {
    const source = readFileSync(path.resolve(__dirname, "purchaseRequests.ts"), "utf8");
    const start = source.indexOf("export async function listPurchaseRequestMyTaskPage");
    const end = source.indexOf("export async function getPurchaseRequestDashboardRead", start);
    const taskPage = source.slice(start, end);

    expect(taskPage).toContain("requesterUserId: session.user.id");
    expect(taskPage).toContain('status: "DRAFT"');
    expect(taskPage).toContain("purchaseRequestSubmit");
  });

  test("purchase request creation uses a task sheet with bounded multi-line entry", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );
    const editorSource = readFileSync(
      path.resolve(__dirname, "../../components/PurchaseRequestLinesEditor.tsx"),
      "utf8"
    );
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );

    expect(pageSource).toContain("<TaskSheet title=\"Create Draft PR\"");
    expect(pageSource).toContain('size="workspace" bodyScroll="contained"');
    expect(pageSource).toContain("<PurchaseRequestLinesEditor");
    expect(editorSource).toContain("PURCHASE_REQUEST_MAX_LINES");
    expect(editorSource).toContain("Add line");
    expect(editorSource).toContain("overflow-y-auto");
    expect(editorSource).toContain("Editing line");
    expect(editorSource).toContain('name="lineDescription"');
    expect(editorSource).toContain('name="lineRequestedQty"');
    expect(editorSource).toContain('name="lineEstimatedUnitCost"');
    expect(editorSource).toContain('name="lineBudgetLineId"');
    expect(editorSource).toContain("Finance to classify");
    expect(editorSource).toContain('name="lineItemId"');
    expect(editorSource).toContain('name="lineUomId"');
    expect(editorSource).toContain('name="lineUomCode"');
    expect(editorSource).toContain('name="linePurpose"');
    expect(editorSource).toContain('name="emergencyReason"');
    expect(editorSource).toContain('name="emergencyEvidenceReference"');
    expect(serviceSource).toContain("parsePurchaseRequestLineInputs(formData)");
    expect(serviceSource).toContain("lineBudgetLineId");
    expect(serviceSource).toContain("PR_LINE_BUDGET_LINE_NOT_FOUND");
    expect(serviceSource).toContain("budgetLineCodes: resolvedLines.map");
    expect(serviceSource).toContain("PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED");
    expect(serviceSource).toContain("estimatedUnitCost");
    expect(serviceSource).toContain("estimatedLineTotal");
    expect(PURCHASE_REQUEST_MAX_LINES).toBe(100);
  });

  test("purchase request list keeps multi-line summaries visible without expanding every line", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("request.lines.slice(0, 3)");
    expect(pageSource).toContain("request.lines.length > 3");
    expect(pageSource).toContain("more line");
    expect(pageSource).toContain("data-testid=\"purchase-request-row\"");
  });

  test("purchase request cancellation reverses budget source projections without source mutation", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );

    expect(serviceSource).toContain(
      "reverseBudgetCommitmentFromApprovedSourceEvent"
    );
    expect(serviceSource).toContain('sourceType: "PURCHASE_REQUEST"');
    expect(serviceSource).toContain("purchase_request.approved:${line.id}");
    expect(serviceSource).toContain("purchase_request.cancelled:${line.id}");
    expect(serviceSource).toContain("purchase_request.cancelled");
  });

  test("catalog and free-text UOM requirements stay explicit at validation boundary", () => {
    expect(
      getCatalogLineUomRequirementIssue({
        itemId: "00000000-0000-0000-0000-000000000001",
        uomId: undefined,
        uomCode: "CASE"
      })
    ).toEqual({
      path: "uomId",
      message: "Catalog item lines require a catalog UOM."
    });

    expect(
      getCatalogLineUomRequirementIssue({
        itemId: undefined,
        uomId: undefined,
        uomCode: ""
      })
    ).toEqual({
      path: "uomCode",
      message: "Free-text lines require a UOM code."
    });

    expect(
      getCatalogLineUomRequirementIssue({
        itemId: undefined,
        uomId: undefined,
        uomCode: "tray"
      })
    ).toBeNull();
  });

  test("purchase request audit metadata records source and line-level lineage", () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );

    expect(serviceSource).toContain('eventType: "purchase_request.created"');
    expect(serviceSource).toContain('source: "purchase-request-draft"');
    expect(serviceSource).toContain("lineCount: resolvedLines.length");
    expect(serviceSource).toContain("lineItemCodes: resolvedLines.map");
    expect(serviceSource).toContain("lineUomCodes: resolvedLines.map");
  });

  test("purchase request workspace consumes DEC-0036 purchasing policy context", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );
    const policySource = readFileSync(
      path.resolve(__dirname, "policySettings.ts"),
      "utf8"
    );
    const policyKeys = defaultPolicySettings.map((setting) => setting.key);

    for (const key of [
      "purchasing.approval.standard_threshold_php",
      "purchasing.approval.high_value_threshold_php",
      "purchasing.approval.senior_threshold_php",
      "purchasing.emergency.max_amount_php",
      "purchasing.quotation.required_threshold_php",
      "purchasing.quotation.minimum_quotes"
    ]) {
      expect(policyKeys).toContain(key);
      expect(policySource).toContain(key);
    }

    expect(pageSource).toContain("getPurchasingControlPolicy");
    expect(pageSource).toContain("Current purchasing policy");
    expect(serviceSource).toContain("getPurchasingControlPolicy");
    expect(serviceSource).toContain("purchasingPolicy");
    expect(serviceSource).toContain("standardApprovalThresholdPhp");
    expect(serviceSource).toContain("seniorApprovalThresholdPhp");
    expect(serviceSource).toContain("emergencyMaxAmountPhp");
    expect(serviceSource).toContain("quotationRequiredThresholdPhp");
  });

  test("emergency purchase requests derive same-day SLA status without changing approval routing", () => {
    expect(isEmergencyPurchaseUrgency("Emergency - stockout")).toBe(true);
    expect(isEmergencyPurchaseUrgency("Normal")).toBe(false);

    expect(
      getPurchaseRequestSlaStatus({
        urgency: "Emergency",
        requiredDate: new Date("2026-07-07T00:00:00.000Z"),
        status: "PENDING_APPROVAL",
        now: new Date("2026-07-07T13:00:00.000Z")
      })
    ).toBe("DUE_TODAY");
    expect(
      getPurchaseRequestSlaStatus({
        urgency: "Emergency",
        requiredDate: new Date("2026-07-06T00:00:00.000Z"),
        status: "PENDING_APPROVAL",
        now: new Date("2026-07-07T13:00:00.000Z")
      })
    ).toBe("OVERDUE");
    expect(
      getPurchaseRequestSlaStatus({
        urgency: "Emergency",
        requiredDate: new Date("2026-07-06T00:00:00.000Z"),
        status: "APPROVED",
        now: new Date("2026-07-07T13:00:00.000Z")
      })
    ).toBe("RESOLVED");
    expect(getPurchaseRequestSlaLabel("OVERDUE")).toBe("Emergency SLA overdue");

    const pageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/page.tsx"),
      "utf8"
    );
    const detailPageSource = readFileSync(
      path.resolve(__dirname, "../../app/(app)/purchase-requests/[id]/page.tsx"),
      "utf8"
    );
    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );
    const feedbackSource = readFileSync(path.resolve(__dirname, "actionFeedback.ts"), "utf8");
    const schemaSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const migrationSource = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260707133000_purchase_request_estimated_amounts/migration.sql"
      ),
      "utf8"
    );

    expect(pageSource).toContain("request.isEmergency");
    expect(pageSource).toContain("request.slaLabel");
    expect(pageSource).toContain("slaBadgeTone");
    expect(detailPageSource).toContain("request.emergencyReason");
    expect(detailPageSource).toContain("request.emergencyEvidenceReference");
    expect(detailPageSource).toContain("Complete Post-Review");
    expect(detailPageSource).toContain("request.emergencyPostReviewCompleted");
    expect(detailPageSource).toContain("completeEmergencyPostReview");
    expect(serviceSource).toContain("EMERGENCY_PURCHASE_REASON_REQUIRED");
    expect(serviceSource).toContain("EMERGENCY_PURCHASE_EVIDENCE_REQUIRED");
    expect(serviceSource).toContain("EMERGENCY_PURCHASE_ESTIMATE_REQUIRED");
    expect(serviceSource).toContain("EMERGENCY_PURCHASE_CAP_EXCEEDED");
    expect(serviceSource).toContain("completeEmergencyPurchasePostReview");
    expect(serviceSource).toContain("purchase_request.emergency_post_review.completed");
    expect(serviceSource).toContain("emergency-purchase-post-review");
    expect(serviceSource).toContain("estimatedTotalAmount > purchasingPolicy.emergencyMaxAmountPhp");
    expect(serviceSource).toContain("emergencyReviewMetadata");
    expect(serviceSource).toContain("emergencyPostReviewMetadata");
    expect(serviceSource).toContain("emergencyReview");
    expect(serviceSource).toContain("getPurchaseRequestSlaStatus");
    expect(serviceSource).toContain("getPurchaseRequestSlaLabel");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_REASON_REQUIRED");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_EVIDENCE_REQUIRED");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_ESTIMATE_REQUIRED");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_CAP_EXCEEDED");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_POST_REVIEW_NOT_READY");
    expect(feedbackSource).toContain("EMERGENCY_PURCHASE_POST_REVIEW_ALREADY_COMPLETED");
    expect(schemaSource).toContain("estimatedUnitCost");
    expect(schemaSource).toContain("estimatedLineTotal");
    expect(migrationSource).toContain('ADD COLUMN "estimatedUnitCost"');
    expect(migrationSource).toContain('ADD COLUMN "estimatedLineTotal"');
  });

  test("emergency purchase requests prefer an explicit emergency approval route", () => {
    const normalRule = {
      id: "normal-rule",
      scopeFilters: { source: "test" },
      steps: [{ stepOrder: 1 }]
    };
    const emergencyRule = {
      id: "emergency-rule",
      scopeFilters: { route: "emergency_purchase", emergency: true },
      steps: [{ stepOrder: 1 }]
    };

    expect(
      resolvePurchaseRequestApprovalRule({
        rules: [emergencyRule, normalRule] as never,
        isEmergency: true
      })
    ).toMatchObject({
      approvalRule: emergencyRule,
      routeType: "emergency",
      fallbackUsed: false
    });
    expect(
      resolvePurchaseRequestApprovalRule({
        rules: [normalRule] as never,
        isEmergency: true
      })
    ).toMatchObject({
      approvalRule: normalRule,
      routeType: "emergency_fallback",
      fallbackUsed: true
    });
    expect(
      resolvePurchaseRequestApprovalRule({
        rules: [emergencyRule, normalRule] as never,
        isEmergency: false
      })
    ).toMatchObject({
      approvalRule: normalRule,
      routeType: "normal",
      fallbackUsed: false
    });

    const serviceSource = readFileSync(
      path.resolve(__dirname, "purchaseRequests.ts"),
      "utf8"
    );
    const seedSource = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/src/seed.ts"),
      "utf8"
    );

    expect(serviceSource).toContain("approvalRouteType");
    expect(serviceSource).toContain("emergencyFallbackUsed");
    expect(seedSource).toContain("emergencyPurchaseRequestApprovalRuleId");
    expect(seedSource).toContain('route: "emergency_purchase"');
  });
});
