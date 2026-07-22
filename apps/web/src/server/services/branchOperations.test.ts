import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  applyBranchOperationChecklistCorrection,
  closeBranchOperationChecklist,
  createBranchOperationChecklist,
  filterBranchOperationChecklists,
  reviewBranchOperationChecklist,
  returnBranchOperationChecklistForCorrection,
  type BranchOperationChecklistSummary
} from "./branchOperations";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userRoleAssignment: {
    findMany: vi.fn()
  }
}));
const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn(),
  assertAuthorizedLocation: vi.fn()
}));

vi.mock("@ogfi/database", () => ({
  prisma: mockPrisma
}));

vi.mock("./context", async () => {
  const actual = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext,
    assertAuthorizedLocation: mockContext.assertAuthorizedLocation
  };
});

const serviceSource = readFileSync(
  new URL("./branchOperations.ts", import.meta.url),
  "utf8"
);
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703113000_phase2_branch_operations_checklists/migration.sql"
  ),
  "utf8"
);
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/branch-operations/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/branch-operations/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/branch-operations/export/route.ts"),
  "utf8"
);
const seedSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/src/seed.ts"),
  "utf8"
);
const createPermissionMigrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703150000_phase2_branch_food_create_permissions/migration.sql"
  ),
  "utf8"
);

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "storekeeper@example.test",
    displayName: "Store Keeper"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "One Gourmet Foods Inc.",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "Yakiniku Like",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "SM North Edsa",
    locationType: "BRANCH"
  },
  permissionCodes: [permissions.branchOperationsCreate]
};

function branchChecklistForm() {
  const form = new FormData();
  form.set("businessDate", "2026-07-03");
  form.set("shiftType", "OPENING");
  form.set("checklistName", "Opening Readiness");
  form.set("line.1.area", "Dining");
  form.set("line.1.checkName", "Table grills ready");
  form.set("line.1.expectedResult", "All grills clean and heating");
  form.set("line.1.result", "PASS");
  form.set("line.1.severity", "NORMAL");
  form.set("line.2.area", "Kitchen");
  form.set("line.2.checkName", "Reach-in chiller checked");
  form.set("line.2.expectedResult", "Cold holding within range");
  form.set("line.2.result", "EXCEPTION");
  form.set("line.2.severity", "HIGH");
  form.set("line.2.evidenceReference", "TEMP-PHOTO-7");
  form.set("line.2.notes", "Moved trays to backup chiller.");
  return form;
}

function branchReviewForm() {
  const form = new FormData();
  form.set("checklistId", "00000000-0000-4000-8000-000000000301");
  form.set("reviewedAt", "2026-07-03");
  form.set("outcome", "REVIEWED");
  form.set("reviewNote", "Checklist reviewed by manager.");
  return form;
}

function branchCloseForm() {
  const form = new FormData();
  form.set("checklistId", "00000000-0000-4000-8000-000000000301");
  form.set("closeReason", "Manager verified all exception follow-ups are complete.");
  return form;
}

function branchReturnCorrectionForm() {
  const form = new FormData();
  form.set("checklistId", "00000000-0000-4000-8000-000000000301");
  form.set("correctionReason", "Opening evidence was incomplete for chiller exception.");
  form.set("evidenceReference", "MANAGER-RETURN-7");
  return form;
}

function branchApplyCorrectionForm() {
  const form = new FormData();
  form.set("checklistId", "00000000-0000-4000-8000-000000000301");
  form.set("correctionReason", "Branch updated the chiller exception evidence.");
  form.set("evidenceReference", "BRANCH-CORRECTION-7");
  form.set("line.1.area", "Dining");
  form.set("line.1.checkName", "Table grills ready");
  form.set("line.1.expectedResult", "All grills clean and heating");
  form.set("line.1.result", "PASS");
  form.set("line.1.severity", "NORMAL");
  form.set("line.2.area", "Kitchen");
  form.set("line.2.checkName", "Reach-in chiller checked");
  form.set("line.2.expectedResult", "Cold holding within range");
  form.set("line.2.result", "PASS");
  form.set("line.2.severity", "NORMAL");
  form.set("line.2.evidenceReference", "TEMP-CORRECTED-7");
  form.set("line.2.notes", "Corrected after moving trays and rechecking temperature.");
  return form;
}

describe("Phase 2 branch operations foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.requireSessionContext.mockResolvedValue(session);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.branchOperationsCreate
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback({
        branchOperationalChecklist: {
          create: vi.fn().mockResolvedValue({
            id: "checklist-created",
            status: "SUBMITTED",
            businessDate: new Date("2026-07-03T00:00:00.000Z"),
            shiftType: "OPENING",
            exceptionCount: 1,
            completionPercent: 100
          })
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({})
        }
      })
    );
  });

  it("creates a branch checklist with derived exception metrics and audit history", async () => {
    const tx = {
      branchOperationalChecklist: {
        create: vi.fn().mockResolvedValue({
          id: "checklist-created",
          status: "SUBMITTED",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          shiftType: "OPENING",
          exceptionCount: 1,
          completionPercent: 100
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(createBranchOperationChecklist(branchChecklistForm())).resolves.toBe(
      "checklist-created"
    );

    expect(mockContext.assertAuthorizedLocation).toHaveBeenCalledWith(
      session,
      session.context.locationId
    );
    expect(tx.branchOperationalChecklist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUBMITTED",
          checklistName: "Opening Readiness",
          openedByUserId: session.user.id,
          submittedByUserId: session.user.id,
          exceptionCount: 1,
          completionPercent: 100,
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({
                lineNo: 1,
                result: "PASS",
                severity: "NORMAL"
              }),
              expect.objectContaining({
                lineNo: 2,
                result: "EXCEPTION",
                severity: "HIGH",
                evidenceReference: "TEMP-PHOTO-7"
              })
            ])
          }
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "branch_checklist.created",
          entityId: "checklist-created",
          metadata: expect.objectContaining({
            lineCount: 2,
            boundary: "branch_checklist_create_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("rejects sparse and out-of-range branch checklist line payloads before writing", async () => {
    const sparseForm = branchChecklistForm();
    sparseForm.delete("line.2.area");
    sparseForm.delete("line.2.checkName");
    sparseForm.delete("line.2.expectedResult");
    sparseForm.set("line.3.area", "Service");
    sparseForm.set("line.3.checkName", "Queue stanchions ready");
    sparseForm.set("line.3.expectedResult", "Queue area is safe and clear");

    mockPrisma.$transaction.mockClear();
    await expect(createBranchOperationChecklist(sparseForm)).rejects.toThrow(
      "BRANCH_CHECKLIST_LINE_INDEX_INVALID"
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    const outOfRangeForm = branchChecklistForm();
    outOfRangeForm.set("line.21.area", "Kitchen");
    outOfRangeForm.set("line.21.checkName", "Invalid row");
    outOfRangeForm.set("line.21.expectedResult", "Should be rejected");

    mockPrisma.$transaction.mockClear();
    await expect(createBranchOperationChecklist(outOfRangeForm)).rejects.toThrow(
      "BRANCH_CHECKLIST_LINE_INDEX_INVALID"
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks branch checklist self-review before status update", async () => {
    const reviewSession = {
      ...session,
      permissionCodes: [permissions.branchOperationsReview]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(reviewSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.branchOperationsReview
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000301",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "SUBMITTED",
          openedByUserId: session.user.id,
          submittedByUserId: "00000000-0000-4000-8000-000000000202",
          reviewedAt: null,
          reviewedByUserId: null,
          exceptionCount: 0
        }),
        updateMany: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(reviewBranchOperationChecklist(branchReviewForm())).rejects.toThrow(
      "BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED"
    );

    expect(tx.branchOperationalChecklist.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("closes reviewed branch checklists with reason and audit history", async () => {
    const closeSession = {
      ...session,
      permissionCodes: [permissions.branchOperationsReview]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(closeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.branchOperationsReview
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000301",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "REVIEWED",
          reviewedAt: new Date("2026-07-03T00:00:00.000Z"),
          reviewedByUserId: "00000000-0000-4000-8000-000000000202"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000301",
          locationId: session.context.locationId,
          status: "CLOSED",
          reviewedAt: new Date("2026-07-03T00:00:00.000Z"),
          reviewedByUserId: "00000000-0000-4000-8000-000000000202"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(
      closeBranchOperationChecklist(branchCloseForm())
    ).resolves.toBe("00000000-0000-4000-8000-000000000301");

    expect(tx.branchOperationalChecklist.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000301",
          status: { in: ["REVIEWED", "EXCEPTION_OPEN"] }
        }),
        data: { status: "CLOSED" }
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "branch_checklist.closed",
          entityId: "00000000-0000-4000-8000-000000000301",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            reason: "Manager verified all exception follow-ups are complete.",
            boundary: "branch_checklist_close_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("returns a submitted branch checklist for correction with audit and transition history", async () => {
    const reviewSession = {
      ...session,
      user: {
        ...session.user,
        id: "00000000-0000-4000-8000-000000000202"
      },
      permissionCodes: [permissions.branchOperationsCorrect]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(reviewSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.branchOperationsCorrect
              }
            }
          ]
        }
      }
    ]);
    const current = {
      id: "00000000-0000-4000-8000-000000000301",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      status: "SUBMITTED",
      openedByUserId: session.user.id,
      submittedByUserId: session.user.id,
      updatedAt: new Date("2026-07-03T08:00:00.000Z"),
      reviewedAt: null,
      reviewedByUserId: null
    };
    const updated = {
      ...current,
      status: "RETURNED"
    };
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue(current),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated)
      },
      operationalCorrectionRecord: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        create: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(
      returnBranchOperationChecklistForCorrection(branchReturnCorrectionForm())
    ).resolves.toBe("00000000-0000-4000-8000-000000000301");

    expect(tx.branchOperationalChecklist.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: current.id,
          status: { in: ["SUBMITTED", "MANAGER_REVIEW"] }
        }),
        data: { status: "RETURNED" }
      })
    );
    expect(tx.branchOperationalChecklist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: session.context.brandId })
      })
    );
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "BranchOperationalChecklist",
          targetEntityId: current.id,
          correctionType: "RETURN_FOR_CORRECTION",
          status: "REQUESTED",
          requestedByUserId: reviewSession.user.id,
          reason: "Opening evidence was incomplete for chiller exception.",
          evidenceReference: "MANAGER-RETURN-7",
          idempotencyKey:
            "BranchOperationalChecklist:00000000-0000-4000-8000-000000000301:RETURN_FOR_CORRECTION:2026-07-03T08:00:00.000Z"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "branch_checklist.returned_for_correction",
          metadata: expect.objectContaining({
            reason: "Opening evidence was incomplete for chiller exception.",
            evidenceReference: "MANAGER-RETURN-7",
            boundary: "branch_checklist_return_correction_only_no_source_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "BranchOperationalChecklist",
          action: "RETURN_FOR_CORRECTION",
          fromStatus: "SUBMITTED",
          toStatus: "RETURNED"
        })
      })
    );
  });

  it("applies returned branch checklist corrections and resubmits with audit history", async () => {
    const current = {
      id: "00000000-0000-4000-8000-000000000301",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      status: "RETURNED",
      exceptionCount: 1,
      completionPercent: 100,
      updatedAt: new Date("2026-07-03T09:00:00.000Z"),
      lines: [
        {
          lineNo: 1,
          area: "Dining",
          checkName: "Table grills ready",
          expectedResult: "All grills clean and heating",
          result: "PASS",
          severity: "NORMAL",
          evidenceReference: null,
          notes: null
        },
        {
          lineNo: 2,
          area: "Kitchen",
          checkName: "Reach-in chiller checked",
          expectedResult: "Cold holding within range",
          result: "EXCEPTION",
          severity: "HIGH",
          evidenceReference: "TEMP-PHOTO-7",
          notes: "Moved trays to backup chiller."
        }
      ]
    };
    const updated = {
      ...current,
      status: "SUBMITTED",
      exceptionCount: 0,
      lines: [
        current.lines[0],
        {
          ...current.lines[1],
          result: "PASS",
          severity: "NORMAL",
          evidenceReference: "TEMP-CORRECTED-7",
          notes: "Corrected after moving trays and rechecking temperature."
        }
      ]
    };
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue(current),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated)
      },
      branchOperationalChecklistLine: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      operationalCorrectionRecord: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        create: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(
      applyBranchOperationChecklistCorrection(branchApplyCorrectionForm())
    ).resolves.toBe("00000000-0000-4000-8000-000000000301");

    expect(tx.branchOperationalChecklist.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id, status: "RETURNED" },
        data: expect.objectContaining({
          status: "SUBMITTED",
          submittedByUserId: session.user.id,
          reviewedByUserId: null,
          reviewedAt: null,
          exceptionCount: 0,
          completionPercent: 100
        })
      })
    );
    expect(tx.branchOperationalChecklist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: session.context.brandId })
      })
    );
    expect(tx.branchOperationalChecklistLine.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "BranchOperationalChecklist",
          correctionType: "APPLY_CORRECTION",
          status: "APPLIED",
          appliedByUserId: session.user.id,
          reason: "Branch updated the chiller exception evidence.",
          evidenceReference: "BRANCH-CORRECTION-7",
          idempotencyKey:
            "BranchOperationalChecklist:00000000-0000-4000-8000-000000000301:APPLY_CORRECTION:2026-07-03T09:00:00.000Z"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "branch_checklist.correction_applied",
          metadata: expect.objectContaining({
            boundary: "branch_checklist_correction_no_inventory_finance_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPLY_CORRECTION",
          fromStatus: "RETURNED",
          toStatus: "SUBMITTED"
        })
      })
    );
  });

  it("adds scoped branch checklist records and lines", () => {
    expect(schemaSource).toContain("model BranchOperationalChecklist");
    expect(schemaSource).toContain("model BranchOperationalChecklistLine");
    expect(schemaSource).toContain("branchOperationalChecklists");
    expect(migrationSource).toContain(
      "BranchOperationalChecklist_companyId_locationId_businessDate_shiftType_key"
    );
    expect(migrationSource).toContain(
      "BranchOperationalChecklistLine_checklistId_lineNo_key"
    );
  });

  it("keeps branch operations controlled and source-record based", () => {
    expect(serviceSource).toContain("getBranchOperationsDashboard");
    expect(serviceSource).toContain("getBranchOperationsDashboardRead");
    expect(serviceSource).toContain("reviewCandidates");
    expect(serviceSource).toContain("exceptionCandidates");
    expect(serviceSource).toContain("take: 3");
    expect(serviceSource).toContain("_sum: { exceptionCount: true }");
    expect(serviceSource).toContain("_avg: { completionPercent: true }");
    expect(serviceSource).toContain("BranchChecklistStatusCounts");
    expect(serviceSource).toContain("BranchChecklistSeverityCounts");
    expect(serviceSource).toContain("statusCounts");
    expect(serviceSource).toContain("severityCounts");
    expect(serviceSource).toContain("createBranchOperationChecklist");
    expect(serviceSource).toContain("permissions.branchOperationsCreate");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_LINES_REQUIRED");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_ALREADY_EXISTS");
    expect(serviceSource).toContain("branch_checklist.created");
    expect(serviceSource).toContain("branch_checklist_create_only_no_source_mutation");
    expect(serviceSource).toContain("recordOperationalStatusTransition");
    expect(serviceSource).toContain('targetEntityType: "BranchOperationalChecklist"');
    expect(serviceSource).toContain('action: "CREATE_SUBMITTED"');
    expect(serviceSource).toContain('action: "REVIEW"');
    expect(serviceSource).toContain('action: "CLOSE"');
    expect(seedSource).toContain("restaurant.branch_operations.create");
    expect(seedSource).toContain("branchOperationsCreatePermissionId");
    expect(createPermissionMigrationSource).toContain(
      "restaurant.branch_operations.create"
    );
    expect(createPermissionMigrationSource).toContain("CONFIGURED_REQUESTER");
    expect(createPermissionMigrationSource).toContain(
      "restaurant.branch_operations.review"
    );
    expect(serviceSource).toContain("getBranchOperationChecklistSummary");
    expect(serviceSource).toContain("buildBranchOperationsExportRows");
    expect(serviceSource).toContain("filterBranchOperationChecklists");
    expect(serviceSource).toContain("filters.businessDate");
    expect(serviceSource).toContain("canUseBranchOperations");
    expect(serviceSource).toContain("reviewBranchOperationChecklist");
    expect(serviceSource).toContain("requirePermission(session, permissions.branchOperationsReview)");
    expect(serviceSource).toContain("reviewableChecklistStatuses");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_EXCEPTION_REVIEW_REQUIRED");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_REVIEW_CONFLICT");
    expect(serviceSource).toContain("branch_checklist.reviewed");
    expect(serviceSource).toContain("branch_checklist_review_only_no_source_mutation");
    expect(serviceSource).toContain("returnBranchOperationChecklistForCorrection");
    expect(serviceSource).toContain("returnBranchChecklistCorrectionSchema");
    expect(serviceSource).toContain("operationalCorrectionRecord");
    expect(serviceSource).toContain("branch_checklist.returned_for_correction");
    expect(serviceSource).toContain("branch_checklist_return_correction_only_no_source_mutation");
    expect(serviceSource).toContain('status: "RETURNED"');
    expect(serviceSource).toContain('action: "RETURN_FOR_CORRECTION"');
    expect(serviceSource).toContain("applyBranchOperationChecklistCorrection");
    expect(serviceSource).toContain("applyBranchChecklistCorrectionSchema");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_STATUS_NOT_CORRECTABLE");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_CORRECTION_CONFLICT");
    expect(serviceSource).toContain("branch_checklist.correction_applied");
    expect(serviceSource).toContain("branch_checklist_correction_no_inventory_finance_mutation");
    expect(serviceSource).toContain('correctionType: "APPLY_CORRECTION"');
    expect(serviceSource).toContain('action: "APPLY_CORRECTION"');
    expect(serviceSource).toContain("closeBranchOperationChecklist");
    expect(serviceSource).toContain("closeableChecklistStatuses");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_STATUS_NOT_CLOSABLE");
    expect(serviceSource).toContain("BRANCH_CHECKLIST_CLOSE_CONFLICT");
    expect(serviceSource).toContain("branch_checklist.closed");
    expect(serviceSource).toContain("branch_checklist_close_only_no_source_mutation");
    expect(serviceSource).toContain("tx.branchOperationalChecklist.updateMany");
    expect(serviceSource).toContain("prisma.branchOperationalChecklist.findMany");
    expect(serviceSource).toContain("prisma.user.findMany");
    expect(serviceSource).toContain("openedByUserId: checklist.openedByUserId");
    expect(serviceSource).toContain("submittedByUserId: checklist.submittedByUserId");
    expect(serviceSource).toContain("reviewedByUserId: checklist.reviewedByUserId");
    expect(serviceSource).toContain("openedByName");
    expect(serviceSource).toContain("submittedByName");
    expect(serviceSource).toContain("reviewedByName");
    expect(serviceSource).toContain("locationId: session.context.locationId");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("inventoryBalance.update");
    expect(serviceSource).not.toContain("approvalInstance.create");
  });

  it("provides a scoped branch checklist detail view with controlled review", () => {
    expect(detailPageSource).toContain("getBranchOperationChecklistSummary(session, id)");
    expect(detailPageSource).toContain("this checklist detail captures");
    expect(detailPageSource).toContain("notFound()");
    expect(detailPageSource).toContain("reviewBranchOperationChecklistAction");
    expect(detailPageSource).toContain("closeBranchOperationChecklistAction");
    expect(detailPageSource).toContain("returnBranchOperationChecklistAction");
    expect(detailPageSource).toContain("returnBranchOperationChecklistForCorrection");
    expect(detailPageSource).toContain("Return for Correction");
    expect(detailPageSource).toContain("applyBranchOperationChecklistCorrectionAction");
    expect(detailPageSource).toContain("applyBranchOperationChecklistCorrection");
    expect(detailPageSource).toContain("Correct and Resubmit");
    expect(detailPageSource).toContain("permissions.branchOperationsReview");
    expect(detailPageSource).toContain("permissions.branchOperationsCreate");
    expect(detailPageSource).toContain(
      "checklist.openedByUserId !== session.user.id"
    );
    expect(detailPageSource).toContain(
      "checklist.submittedByUserId !== session.user.id"
    );
    expect(detailPageSource).toContain("<EntryModal title=\"Review Branch Checklist\"");
    expect(detailPageSource).toContain("<EntryModal title=\"Close Branch Checklist\"");
    expect(detailPageSource).toContain('name="reviewedAt"');
    expect(detailPageSource).toContain('name="closeReason"');
    expect(detailPageSource).toContain('name="outcome"');
    expect(detailPageSource).toContain('name="reviewNote"');
    expect(detailPageSource).toContain("checklist.openedByName");
    expect(detailPageSource).toContain("checklist.submittedByName");
    expect(detailPageSource).toContain("checklist.reviewedByName");
    expect(detailPageSource).toContain("checklist.reviewedAt");
    expect(detailPageSource).toContain('status === "SUBMITTED"');
    expect(detailPageSource).toContain('status === "MANAGER_REVIEW"');
    expect(detailPageSource).toContain('status === "REVIEWED" || status === "CLOSED"');
    expect(detailPageSource).not.toContain("inventoryMovement.create");
  });

  it("provides branch checklist queue search and filters without mutating source records", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="businessDate"');
    expect(listPageSource).toContain('name="shift"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain("visibleChecklists");
    expect(listPageSource).toContain("PAGE_SIZE = 10");
    expect(listPageSource).toContain("normalizePage");
    expect(listPageSource).toContain("paginatedChecklists");
    expect(listPageSource).toContain("pageHref");
    expect(listPageSource).toContain("Showing {showingStart}-{showingEnd} of {visibleChecklists.length} checklists");
    expect(listPageSource).toContain("Page {currentPage} of {totalPages}");
    expect(listPageSource).toContain(
      "filterBranchOperationChecklists(dashboard.checklists"
    );
    expect(listPageSource).toContain("checklist.openedByName");
    expect(listPageSource).toContain("checklist.reviewedByName");
    expect(listPageSource).toContain("buildQueryHref(\"/branch-operations/export\"");
    expect(exportRouteSource).toContain("getStrictDateSearchParam");
    expect(exportRouteSource).toContain('"businessDate"');
    expect(exportRouteSource).toContain("BRANCH_OPERATIONS_BUSINESS_DATE_INVALID");
    expect(serviceSource).toContain('"Opened By"');
    expect(serviceSource).toContain('"Submitted By"');
    expect(serviceSource).toContain('"Reviewed By"');
    expect(serviceSource).toContain('"Reviewed At"');
    expect(serviceSource).toContain('"Manager Review Count"');
    expect(serviceSource).toContain('"Critical Exception Count"');
    expect(listPageSource).not.toContain("checklist.lines.map");
    expect(listPageSource).not.toContain("Evidence: {line.evidenceReference}");
    expect(listPageSource).toContain('"MANAGER_REVIEW"');
    expect(listPageSource).toContain('"EXCEPTION_OPEN"');
    expect(listPageSource).toContain('"RETURNED"');
    expect(listPageSource).toContain('status === "SUBMITTED"');
    expect(listPageSource).toContain('status === "MANAGER_REVIEW"');
    expect(listPageSource).toContain('status === "REVIEWED" || status === "CLOSED"');
    expect(listPageSource).toContain("No checklists match the filters");
    expect(listPageSource).toContain("getBranchOperationsDashboard(session)");
    expect(listPageSource).toContain("Create Branch Checklist");
    expect(listPageSource).toContain("createBranchChecklistAction");
    expect(listPageSource).toContain("permissions.branchOperationsCreate");
    expect(listPageSource).toContain("ActionFeedbackBanner");
    expect(listPageSource).toContain("action={createBranchChecklistAction}");
    expect(listPageSource).toContain("BranchChecklistLinesEditor");
    expect(listPageSource).not.toContain("[1, 2, 3, 4, 5]");
    expect(listPageSource).not.toContain("branchOperationalChecklist.update");
  });

  it("filters branch checklists by nested evidence, actors, and combined queue facets", () => {
    const checklists: BranchOperationChecklistSummary[] = [
      {
        id: "checklist-1",
        checklistName: "Opening Checklist",
        locationName: "SM North Edsa",
        businessDate: "2026-07-03",
        shiftType: "OPENING",
        status: "SUBMITTED",
        openedByName: "Bianca Reyes",
        submittedByName: "Paolo Cruz",
        reviewedByName: null,
        reviewedAt: null,
        exceptionCount: 1,
        completionPercent: 92,
        lines: [
          {
            id: "line-1",
            lineNo: 1,
            area: "Dining",
            checkName: "Table grills ready",
            expectedResult: "All grills clean",
            result: "EXCEPTION",
            severity: "CRITICAL",
            evidenceReference: "photo-grill-7",
            notes: "Igniter needs follow-up"
          }
        ]
      },
      {
        id: "checklist-2",
        checklistName: "Closing Checklist",
        locationName: "SM Mall of Asia",
        businessDate: "2026-07-04",
        shiftType: "CLOSING",
        status: "REVIEWED",
        openedByName: "Lia Mendoza",
        submittedByName: "Marco Santos",
        reviewedByName: "Alyssa Tan",
        reviewedAt: "2026-07-04",
        exceptionCount: 0,
        completionPercent: 100,
        lines: [
          {
            id: "line-2",
            lineNo: 1,
            area: "Kitchen",
            checkName: "Freezers locked",
            expectedResult: "Locked",
            result: "PASS",
            severity: "LOW",
            evidenceReference: null,
            notes: null
          }
        ]
      }
    ];

    expect(
      filterBranchOperationChecklists(checklists, { q: "photo-grill" }).map(
        (checklist) => checklist.id
      )
    ).toEqual(["checklist-1"]);
    expect(
      filterBranchOperationChecklists(checklists, { q: "alyssa" }).map(
        (checklist) => checklist.id
      )
    ).toEqual(["checklist-2"]);
    expect(
      filterBranchOperationChecklists(checklists, {
        businessDate: "2026-07-03",
        shift: "OPENING",
        status: "SUBMITTED"
      }).map((checklist) => checklist.id)
    ).toEqual(["checklist-1"]);
    expect(
      filterBranchOperationChecklists(checklists, {
        businessDate: "2026-07-03",
        shift: "CLOSING",
        status: "SUBMITTED"
      })
    ).toEqual([]);
    expect(
      filterBranchOperationChecklists(checklists, {
        q: "",
        shift: "ALL",
        status: "ALL"
      }).map((checklist) => checklist.id)
    ).toEqual(["checklist-1", "checklist-2"]);
  });
});
