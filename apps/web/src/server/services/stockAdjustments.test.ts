import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  assertStockAdjustmentCanCancel,
  assertStockAdjustmentCanPost,
  assertStockAdjustmentCanReverse,
  assertStockAdjustmentCanSubmit,
  assertDedicatedOpeningCutoverRequired,
  assertStockAdjustmentQuantity,
  calculateAdjustmentDelta,
  listStockAdjustmentMyTaskPage,
  resolveStockAdjustmentDashboardProfile,
  stockAdjustmentDashboardProfileHref,
  stockAdjustmentDashboardProfileWhere
} from "./stockAdjustments";

const mockPrisma = vi.hoisted(() => ({
  stockAdjustment: { count: vi.fn(), findMany: vi.fn() }
}));

vi.mock("@ogfi/database", () => ({ prisma: mockPrisma }));

const dashboardSession = {
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    locationId: "00000000-0000-4000-8000-000000000004"
  }
};

describe("stock adjustment controlled workflow rules", () => {
  test("resolves only the closed adjustment exception profile and its canonical scoped predicate", () => {
    expect(
      resolveStockAdjustmentDashboardProfile("stock-adjustment-exceptions-v1")
    ).toBe("stock-adjustment-exceptions-v1");
    expect(resolveStockAdjustmentDashboardProfile("all")).toBeNull();
    expect(resolveStockAdjustmentDashboardProfile(undefined)).toBeNull();
    expect(
      stockAdjustmentDashboardProfileHref("stock-adjustment-exceptions-v1", 2)
    ).toBe("/adjustments?dashboard=stock-adjustment-exceptions-v1&page=2");
    expect(
      stockAdjustmentDashboardProfileWhere(
        dashboardSession as never,
        "stock-adjustment-exceptions-v1"
      )
    ).toEqual({
      tenantId: dashboardSession.context.tenantId,
      companyId: dashboardSession.context.companyId,
      inventoryLocation: { locationId: dashboardSession.context.locationId },
      status: {
        in: ["PENDING_APPROVAL", "APPROVED", "POSTING", "RETURNED"]
      }
    });
  });

  test("dashboard, paged profile, and export use the canonical exception predicate", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/page.tsx"),
      "utf8"
    );
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/export/route.ts"),
      "utf8"
    );

    expect(source).toContain("stockAdjustmentDashboardProfileWhere(");
    expect(source).toContain('"stock-adjustment-exceptions-v1"');
    expect(source).toContain("listStockAdjustmentDashboardProfilePage");
    expect(source).toContain("listStockAdjustmentPage");
    expect(source).toContain("take: stockAdjustmentProfilePageSize");
    expect(page).toContain("!profile && canCreateAdjustments");
    expect(page).toContain("workspacePage?.items");
    expect(page).toContain("read-only profile does not grant adjustment or inventory actions");
    expect(route).toContain("listStockAdjustments(session, profile ?? undefined, {");
    expect(route).toContain("maxRows: exportPolicy.maxRows");
    expect(route).toContain("exportErrorResponse(error)");
    expect(route).toContain("STOCK_ADJUSTMENT_DASHBOARD_PROFILE_UNSUPPORTED");
  });

  test("stock adjustment pages explain approval, posting, and reversal controls", () => {
    const listPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/page.tsx"),
      "utf8"
    );
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/adjustments/[id]/page.tsx"),
      "utf8"
    );

    expect(listPage).toContain("Opening inventory uses its dedicated cutover workflow");
    expect(listPage).not.toContain("OPENING_BALANCE_IN ledger movements");
    expect(detailPage).toContain(
      "Approval does not change stock. Only the separate Post Adjustment action"
    );
    expect(detailPage).toContain("dedicated cutover workspace");
    expect(listPage).not.toContain("This foundation records");
    expect(detailPage).not.toContain("in this foundation");
  });

  test("stock adjustment audit metadata reflects controlled approval and posting", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain("approvalAndPostingRequired: true");
    expect(source).toContain("nonPostingApproval: true");
    expect(source).toContain("StockCountVarianceAdjustment");
    expect(source).toContain("approvalRuleTransactionType: transactionType");
    expect(source).not.toContain("nonPostingFoundation: true");
  });

  test("cancellation uses source lock and graph cleanup before source CAS", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const start = source.indexOf("export async function cancelStockAdjustment");
    const end = source.indexOf("\nexport async function postStockAdjustment", start);
    const action = source.slice(start, end);
    expect(action).toContain("withApprovalProducerTransaction");
    expect(action).toContain("lockStockAdjustmentSourceForCancellation");
    expect(action.indexOf("lockStockAdjustmentSourceForCancellation")).toBeLessThan(
      action.indexOf("lockPendingStockAdjustmentApproval")
    );
    expect(action.indexOf("approvalInstance.updateMany")).toBeLessThan(
      action.indexOf("stockAdjustment.updateMany")
    );
    expect(action).toContain("updatedAt: lockedSource.updatedAt");
  });

  test("posting locks the adjustment before inventory scope", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const start = source.indexOf("export async function postStockAdjustment");
    const action = source.slice(start);
    expect(action).toContain("FOR UPDATE OF adjustment");
    expect(action.indexOf("FOR UPDATE OF adjustment")).toBeLessThan(
      action.indexOf("lockInventoryLocationsForPosting")
    );
    expect(action).toContain("assertFreshStockAdjustmentInventoryAuthority");
    expect(action).toContain('{ transaction: tx }');
  });

  test("reversal is manual-only, MFA-gated, and source/line locked", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const start = source.indexOf("export async function reverseStockAdjustment");
    const action = source.slice(start);
    expect(action).toContain("assertStockAdjustmentReversalType");
    expect(action).toContain('action: "stock_adjustment.reverse"');
    expect(action).toContain("lockStockAdjustmentSourceForReversal");
    expect(action).toContain("FOR UPDATE OF line");
    expect(action).toContain("pg_advisory_xact_lock");
    expect(action).toContain("assertFreshStockAdjustmentInventoryAuthority");
    expect(action).toContain('sourceEventKey: `stock_adjustment_line:${line.id}:reverse`');
    expect(action).not.toContain('"OPENING_BALANCE_IN"].includes');
  });

  test("submission is non-posting and does not require posting MFA", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const start = source.indexOf("export async function submitStockAdjustment");
    const end = source.indexOf("\nexport async function cancelStockAdjustment", start);
    const action = source.slice(start, end);
    expect(action).not.toContain("assertPrivilegedMfaForAction");
    expect(action).toContain("permissions.stockAdjustmentSubmit");
  });

  test("My Tasks returns only authorized unposted approved adjustments with exact count and cursor", async () => {
    mockPrisma.stockAdjustment.count.mockResolvedValue(2);
    mockPrisma.stockAdjustment.findMany.mockResolvedValue([
      {
        id: "adjustment-1",
        publicReference: "ADJ-2026-00001",
        adjustmentType: "DECREASE",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        inventoryLocation: { name: "Branch Stock" }
      },
      {
        id: "adjustment-2",
        publicReference: "ADJ-2026-00002",
        adjustmentType: "INCREASE",
        createdAt: new Date("2026-07-21T00:00:00.000Z"),
        inventoryLocation: { name: "Branch Stock" }
      }
    ]);
    const session = {
      user: { id: "user-1" },
      context: dashboardSession.context,
      permissionCodes: [permissions.stockAdjustmentPost]
    };

    await expect(
      listStockAdjustmentMyTaskPage(session as never, { take: 1 })
    ).resolves.toEqual({
      totalCount: 2,
      items: [
        expect.objectContaining({
          taskId: "stock-adjustment-adjustment-1",
          actionLabel: "Post stock adjustment"
        })
      ],
      nextCursor: {
        createdAt: "2026-07-20T00:00:00.000Z",
        sourceType: "STOCK_ADJUSTMENT",
        recordId: "adjustment-1"
      }
    });
    expect(mockPrisma.stockAdjustment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: dashboardSession.context.tenantId,
        companyId: dashboardSession.context.companyId,
        status: "APPROVED",
        postedAt: null
      })
    });
  });

  test("stock adjustment approval submission uses normalized routing without role fanout", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain("for (const step of routedSteps)");
    expect(source).toContain("configureApprovalStepRouting(tx");
    expect(source).toContain("requiredPermissionCode: permissions.stockAdjustmentApprove");
    expect(source).toContain("dueAt: null");
    expect(source).toContain('source: "stock-adjustment-submission"');
    expect(source).toContain("userId: adjustment.requestedByUserId");
    expect(source).toContain("assertAnyEligibleApprovalActorForStep(tx");
    expect(source.indexOf("const submitted = await tx.stockAdjustment.updateMany")).toBeLessThan(
      source.indexOf("const approval = await tx.approvalInstance.create")
    );
    expect(source.indexOf("const submitted = await tx.stockAdjustment.updateMany")).toBeLessThan(
      source.indexOf("assertAnyEligibleApprovalActorForStep(tx")
    );
    expect(source).toContain('FOR UPDATE OF sa');
    expect(source).toContain('definitionSealed: true');
    expect(source).toContain('status: { in: ["DRAFT", "SUBMITTED", "RETURNED"] }');
    expect(source).toContain("recordWorkflowNotifications");
    expect(source).toContain('notificationType: "APPROVE_STOCK_ADJUSTMENT"');
    expect(source).toContain("locationId: adjustment.inventoryLocation.locationId");
    expect(source).toContain("sourceEventKey: auditEvent.id");
    expect(source).toContain("recipientUserIds: firstStep.userId ? [firstStep.userId] : []");
    expect(source).not.toContain("resolveScopedNotificationRecipients");
    expect(source).toContain("deepLink: `/approvals/${approval.id}`");
    expect(source).toContain('source: "stock-adjustment-approval-submission"');
  });

  test("service and approval wiring expose controlled stock-adjustment actions", () => {
    const service = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    const approvals = readFileSync(path.resolve(__dirname, "approvals.ts"), "utf8");
    const authorization = readFileSync(path.resolve(__dirname, "authorization.ts"), "utf8");

    expect(service).toContain("canUseStockAdjustments(session.permissionCodes)");
    expect(authorization).toContain('stockAdjustmentApprove: "inventory.stock_adjustment.approve"');
    expect(authorization).toContain('stockAdjustmentPost: "inventory.stock_adjustment.post"');
    expect(authorization).toContain('stockAdjustmentReverse: "inventory.stock_adjustment.reverse"');
    expect(approvals).toContain('documentType: "StockAdjustment"');
    expect(approvals).toContain("approveStockAdjustment");
  });

  test("requires nonzero quantity deltas", () => {
    expect(() => assertStockAdjustmentQuantity(1)).not.toThrow();
    expect(() => assertStockAdjustmentQuantity(-1)).not.toThrow();
    expect(() => assertStockAdjustmentQuantity(0)).toThrow(
      "STOCK_ADJUSTMENT_QUANTITY_INVALID"
    );
  });

  test("maps increase and decrease to signed base quantity deltas", () => {
    expect(calculateAdjustmentDelta("INCREASE", 2.5)).toBe(2.5);
    expect(calculateAdjustmentDelta("DECREASE", 2.5)).toBe(-2.5);
    expect(() => calculateAdjustmentDelta("INCREASE", 0)).toThrow(
      "STOCK_ADJUSTMENT_QUANTITY_INVALID"
    );
  });

  test("routes opening inventory away from generic stock adjustments", () => {
    expect(() => assertDedicatedOpeningCutoverRequired("INCREASE")).not.toThrow();
    expect(() => assertDedicatedOpeningCutoverRequired("OPENING_BALANCE")).toThrow(
      "OPENING_BALANCE_REQUIRES_DEDICATED_CUTOVER"
    );
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");
    expect(source).toContain(
      'const manualAdjustmentTypes = ["INCREASE", "DECREASE"] as const'
    );
    expect(source).toContain("assertDedicatedOpeningCutoverRequired(initialAdjustment.adjustmentType)");
    expect(source).toContain("assertDedicatedOpeningCutoverRequired(adjustment.adjustmentType)");
  });

  test("submits draft, submitted, or returned adjustments into approval", () => {
    expect(() => assertStockAdjustmentCanSubmit("DRAFT")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("SUBMITTED")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("RETURNED")).not.toThrow();
    expect(() => assertStockAdjustmentCanSubmit("PENDING_APPROVAL")).toThrow(
      "STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT"
    );
    expect(() => assertStockAdjustmentCanSubmit("CANCELLED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT"
    );
  });

  test("cancels only pre-approved adjustments", () => {
    expect(() => assertStockAdjustmentCanCancel("DRAFT")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("SUBMITTED")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("PENDING_APPROVAL")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("RETURNED")).not.toThrow();
    expect(() => assertStockAdjustmentCanCancel("CANCELLED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );
    expect(() => assertStockAdjustmentCanCancel("POSTED")).toThrow(
      "STOCK_ADJUSTMENT_NOT_CANCELLABLE"
    );
  });

  test("cancel action compare-and-sets the exact preflight state and scope", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain("status: adjustment.status");
    expect(source).toContain("inventoryLocationId: adjustment.inventoryLocationId");
    expect(source).toContain("lockPendingStockAdjustmentApproval");
    expect(source).toContain('status: { in: ["PENDING", "WAITING"] }');
  });

  test("posts only approved unposted adjustments", () => {
    expect(() => assertStockAdjustmentCanPost("APPROVED", null)).not.toThrow();
    expect(() => assertStockAdjustmentCanPost("APPROVED", undefined)).not.toThrow();
    expect(() => assertStockAdjustmentCanPost("PENDING_APPROVAL", null)).toThrow(
      "STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING"
    );
    expect(() => assertStockAdjustmentCanPost("APPROVED", new Date())).toThrow(
      "STOCK_ADJUSTMENT_ALREADY_POSTED"
    );
  });

  test("reverses only posted unreversed adjustments", () => {
    expect(() => assertStockAdjustmentCanReverse("POSTED", null)).not.toThrow();
    expect(() => assertStockAdjustmentCanReverse("APPROVED", null)).toThrow(
      "STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertStockAdjustmentCanReverse("POSTED", new Date())).toThrow(
      "STOCK_ADJUSTMENT_ALREADY_REVERSED"
    );
  });

  test("posting and reversal are source-linked ledger actions", () => {
    const source = readFileSync(path.resolve(__dirname, "stockAdjustments.ts"), "utf8");

    expect(source).toContain('movementType: "REVERSAL"');
    expect(source).not.toContain('"OPENING_BALANCE_IN"');
    expect(source).toContain('quantityDeltaBaseUom > 0');
    expect(source).toContain("sourceEventKey: `stock_adjustment_line:${line.id}:post`");
    expect(source).toContain("sourceEventKey: `stock_adjustment_line:${line.id}:reverse`");
    expect(source).toContain("reversalOfMovementId: original.id");
  });

  test("migration accepts controlled approval, posting, and reversal statuses", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260630220000_stock_adjustment_posting_reversal/migration.sql"
      ),
      "utf8"
    );

    for (const status of [
      "PENDING_APPROVAL",
      "APPROVED",
      "POSTING",
      "POSTED",
      "REVERSING",
      "REVERSED",
      "RETURNED",
      "REJECTED"
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "StockAdjustment_status_check"');
    expect(migration).toContain('"StockAdjustment_posted_fields_check"');
    expect(migration).toContain('"StockAdjustment_reversed_fields_check"');
  });
});
