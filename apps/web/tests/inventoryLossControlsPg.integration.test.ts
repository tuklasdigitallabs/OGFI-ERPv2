import { createSealedApprovalRuleFixture } from "./helpers/approvalRulePgFixtures";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, test, vi } from "vitest";
import { prisma } from "@ogfi/database";
import { permissions } from "../src/server/services/authorization";
import { createStockAdjustment, submitStockAdjustment } from "../src/server/services/stockAdjustments";
import { createWastageReport, submitWastageReport } from "../src/server/services/wastage";
import { assertDisposableAuthorizationDatabaseConfigured, assertDisposableAuthorizationDatabaseMarker } from "./authorizationDatabaseSafety";
import { createApprovalDecisionPgFixture, createSharedProcurementInventorySource } from "./helpers/approvalDecisionPgFixtures";
const context = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../src/server/services/context", async () => ({ ...await vi.importActual<typeof import("../src/server/services/context")>("../src/server/services/context"), requireSessionContext: context.session }));
const enabled = process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";
const suite = enabled ? describe : describe.skip;
suite("inventory loss source evidence and operational scope", () => {
  beforeAll(async () => {
    assertDisposableAuthorizationDatabaseConfigured(process.env);
    await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  test("wastage applicable-line coverage is consistent at creation and submission", async () => {
    const f = await createApprovalDecisionPgFixture({ family: "WastageReport", extraPermissionCodes: [permissions.wastageCreate, permissions.wastageSubmit], createSource: input => createSharedProcurementInventorySource("WastageReport", input) });
    context.session.mockResolvedValue(f.sessionFor(1));
    const source = await prisma.wastageReport.findUniqueOrThrow({ where: { id: f.sourceId }, include: { lines: { include: { item: true } } } });
    const line = source.lines[0]!;
    await prisma.itemCategory.update({ where: { id: line.item.itemCategoryId }, data: { defaultWastageRequiresPhoto: true } });
    const category = await prisma.itemCategory.create({ data: { tenantId: f.tenantId, companyId: f.companyId, categoryCode: "PACK", categoryName: "Packaging", inventoryClass: "PACKAGING", defaultWastageRequiresPhoto: false } });
    const itemB = await prisma.item.create({ data: { tenantId: f.tenantId, companyId: f.companyId, itemCode: "PACK", itemName: "Package", itemCategoryId: category.id, itemType: "INVENTORY", baseUomId: line.uomId } });
    await prisma.operationalReasonCode.updateMany({ where: { companyId: f.companyId, code: "TEST" }, data: { inventoryClasses: ["FOOD", "PACKAGING"] } });
    const policy = await prisma.wastagePolicy.create({ data: { tenantId: f.tenantId, companyId: f.companyId, name: "Evidence fixture", requiresEvidence: false } });
    await createSealedApprovalRuleFixture(prisma, { data: { tenantId: f.tenantId, companyId: f.companyId, transactionType: "WastageReport", steps: { create: { stepOrder: 1, approverType: "USER", userId: f.approverUserIds[1] } } } });
    for (const c of [
      { reason: false, global: false, header: "", a: "photo-A", b: "", pass: true },
      { reason: false, global: false, header: "", a: "", b: "photo-B", pass: false },
      { reason: false, global: false, header: "header", a: "", b: "", pass: true },
      { reason: true, global: false, header: "", a: "photo-A", b: "", pass: false },
      { reason: true, global: false, header: "", a: "photo-A", b: "photo-B", pass: true },
      { reason: false, global: true, header: "", a: "photo-A", b: "", pass: false },
      { reason: false, global: true, header: "header", a: "", b: "", pass: true },
      { reason: false, global: false, header: "  ", a: "  ", b: "", pass: false },
    ]) {
      await prisma.operationalReasonCode.updateMany({ where: { companyId: f.companyId, code: "TEST" }, data: { requiresEvidence: c.reason } });
      await prisma.wastagePolicy.update({ where: { id: policy.id }, data: { requiresEvidence: c.global } });
      const form = new FormData();
      for (const [key,value] of Object.entries({ inventoryLocationId: source.inventoryLocationId, wastageType: "SPOILAGE_EXPIRY", reasonCode: "TEST", evidenceReference: c.header })) form.set(key,value);
      for (const [item,reference] of [[line.itemId,c.a],[itemB.id,c.b]]) { form.append("lineItemId",item!); form.append("lineQuantity","1"); form.append("lineEvidenceReference",reference!); }
      const countBefore = await prisma.wastageReport.count({ where: { companyId: f.companyId } });
      if (!c.pass) {
        await expect(createWastageReport(form)).rejects.toThrow("WASTAGE_EVIDENCE_REFERENCE_REQUIRED");
        expect(await prisma.wastageReport.count({ where: { companyId: f.companyId } })).toBe(countBefore);
      }
      // Build a valid draft, then model pre-existing deficient reference fields for submission.
      if (!c.pass) form.set("evidenceReference","fixture header");
      const id = await createWastageReport(form);
      await prisma.wastageReport.update({ where: { id }, data: { evidenceReference: c.header } });
      for (const [lineNumber,reference] of [[1,c.a],[2,c.b]] as const) await prisma.wastageLine.updateMany({ where: { wastageReportId: id, lineNumber }, data: { evidenceReference: reference } });
      const action = new FormData(); action.set("id",id);
      if (c.pass) {
        await submitWastageReport(action);
        expect((await prisma.wastageReport.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_APPROVAL");
        expect(await prisma.approvalInstance.count({ where: { documentId: id } })).toBe(1);
      } else {
        await expect(submitWastageReport(action)).rejects.toThrow("WASTAGE_EVIDENCE_REFERENCE_REQUIRED");
        expect((await prisma.wastageReport.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
        expect(await prisma.approvalInstance.count({ where: { documentId: id } })).toBe(0);
      }
      expect(await prisma.inventoryMovement.count({ where: { companyId: f.companyId } })).toBe(0);
    }
  }, 120_000);

  for (const family of ["WastageReport", "StockAdjustment"] as const) {
    test(`${family}: configured evidence and live VIEW denial leave no source mutation`, async () => {
      const isWastage = family === "WastageReport";
      const fixture = await createApprovalDecisionPgFixture({
        family,
        extraPermissionCodes: isWastage ? [permissions.wastageCreate, permissions.wastageSubmit] : [permissions.stockAdjustmentCreate, permissions.stockAdjustmentSubmit],
        createSource: (input) => createSharedProcurementInventorySource(family, input),
      });
      const session = fixture.sessionFor(1);
      context.session.mockResolvedValue(session);
      const source = isWastage
        ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: fixture.sourceId }, include: { lines: true } })
        : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: fixture.sourceId }, include: { lines: true } });
      const line = source.lines[0]!;
      const workflow = isWastage ? "WASTAGE" : "STOCK_ADJUSTMENT";
      const existing = await prisma.operationalReasonCode.findFirst({ where: { companyId: fixture.companyId, workflow, code: "TEST" } });
      if (existing) await prisma.operationalReasonCode.update({ where: { id: existing.id }, data: { requiresEvidence: true } });
      else await prisma.operationalReasonCode.create({ data: { tenantId: fixture.tenantId, companyId: fixture.companyId, workflow, code: "TEST", label: "Evidence required", requiresEvidence: true, wastageTypes: ["SPOILAGE_EXPIRY"], inventoryClasses: ["FOOD"] } });
      const form = new FormData();
      form.set("inventoryLocationId", source.inventoryLocationId);
      form.set("reasonCode", "TEST");
      form.set("reasonDescription", "Independent inventory evidence test");
      form.set("wastageType", "SPOILAGE_EXPIRY");
      form.set("adjustmentType", "INCREASE");
      form.set("lineItemId", line.itemId);
      form.set("lineQuantity", "1");
      const create = isWastage ? createWastageReport : createStockAdjustment;
      const submit = isWastage ? submitWastageReport : submitStockAdjustment;
      const snapshot = async () => ({
        wastage: await prisma.wastageReport.count({ where: { tenantId: fixture.tenantId } }),
        adjustments: await prisma.stockAdjustment.count({ where: { tenantId: fixture.tenantId } }),
        approvals: await prisma.approvalInstance.count({ where: { tenantId: fixture.tenantId } }),
        movements: await prisma.inventoryMovement.count({ where: { tenantId: fixture.tenantId } }),
      });
      const before = await snapshot();
      await expect(create(form)).rejects.toThrow(isWastage ? "WASTAGE_EVIDENCE_REFERENCE_REQUIRED" : "STOCK_ADJUSTMENT_EVIDENCE_REFERENCE_REQUIRED");
      expect(await snapshot()).toEqual(before);
      form.set("evidenceReference", "Independently retained external fixture reference");
      const createdId = await create(form);
      const created = isWastage ? await prisma.wastageReport.findUniqueOrThrow({ where: { id: createdId } }) : await prisma.stockAdjustment.findUniqueOrThrow({ where: { id: createdId } });
      expect(created.status).toBe("DRAFT");
      // Simulate legacy deficient draft data without invoking privileged workflow transitions.
      if (isWastage) {
        await prisma.wastageReport.update({ where: { id: createdId }, data: { evidenceReference: null } });
        await prisma.wastageLine.updateMany({ where: { wastageReportId: createdId }, data: { evidenceReference: null } });
      } else {
        await prisma.stockAdjustment.update({ where: { id: createdId }, data: { evidenceReference: null } });
        await prisma.stockAdjustmentLine.updateMany({ where: { stockAdjustmentId: createdId }, data: { evidenceReference: null } });
      }
      const action = new FormData(); action.set("id", createdId);
      const beforeSubmit = await snapshot();
      await expect(submit(action)).rejects.toThrow(isWastage ? "WASTAGE_EVIDENCE_REFERENCE_REQUIRED" : "STOCK_ADJUSTMENT_EVIDENCE_REFERENCE_REQUIRED");
      expect(await snapshot()).toEqual(beforeSubmit);
      await prisma.userScopeAssignment.updateMany({ where: { userId: session.user.id }, data: { accessLevel: "VIEW" } });
      const unrelatedLocation = await prisma.location.create({ data: { tenantId: fixture.tenantId, companyId: fixture.companyId, brandId: fixture.brandId, code: `OTHER-${randomUUID().slice(0,8)}`, name: "Unrelated operating branch", locationType: "BRANCH" } });
      await prisma.userScopeAssignment.create({ data: { userId: session.user.id, scopeType: "LOCATION", scopeId: unrelatedLocation.id, accessLevel: "OPERATE" } });
      await expect(create(form)).rejects.toThrow("SCOPE_DENIED");
      await expect(submit(action)).rejects.toThrow("SCOPE_DENIED");
      expect(await snapshot()).toEqual(beforeSubmit);
    }, 30_000);
  }
});
