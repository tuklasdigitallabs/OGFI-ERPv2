import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  applyFoodSafetyLogCorrection,
  closeFoodSafetyLog,
  createFoodSafetyLog,
  filterFoodSafetyLogs,
  listFoodSafetyMyTaskPage,
  reviewFoodSafetyLog,
  returnFoodSafetyLogForCorrection,
  type FoodSafetyLogSummary
} from "./foodSafety";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userRoleAssignment: {
    findMany: vi.fn()
  },
  foodSafetyLog: {
    count: vi.fn(),
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

describe("Food Safety My Tasks adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.foodSafetyLog.count.mockResolvedValue(2);
    mockPrisma.foodSafetyLog.findMany.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000401",
        title: "Opening Temperature Log",
        status: "SUBMITTED",
        businessDate: new Date("2026-07-23T00:00:00.000Z"),
        logType: "TEMPERATURE",
        createdAt: new Date("2026-07-23T01:00:00.000Z"),
        location: { name: "SM North Edsa" }
      },
      {
        id: "00000000-0000-4000-8000-000000000402",
        title: "Closing Sanitation Log",
        status: "RETURNED",
        businessDate: new Date("2026-07-23T00:00:00.000Z"),
        logType: "SANITATION",
        createdAt: new Date("2026-07-23T02:00:00.000Z"),
        location: { name: "SM North Edsa" }
      }
    ]);
  });

  it("uses one scoped predicate for independent review and pooled correction", async () => {
    const actor = {
      ...session,
      permissionCodes: [permissions.foodSafetyReview, permissions.foodSafetyCreate]
    };
    await expect(listFoodSafetyMyTaskPage(actor as never)).resolves.toMatchObject({
      totalCount: 2,
      items: [
        { actionLabel: "Review food-safety log", status: "SUBMITTED" },
        { actionLabel: "Correct and resubmit food-safety log", status: "RETURNED" }
      ]
    });
    const countWhere = mockPrisma.foodSafetyLog.count.mock.calls[0]![0].where;
    const pageQuery = mockPrisma.foodSafetyLog.findMany.mock.calls[0]![0];
    const pageWhere = pageQuery.where;
    expect(pageWhere).toEqual(countWhere);
    expect(countWhere).toMatchObject({
      tenantId: actor.context.tenantId,
      companyId: actor.context.companyId,
      brandId: actor.context.brandId,
      locationId: actor.context.locationId,
      OR: [
        {
          status: { in: ["SUBMITTED", "EXCEPTION_REVIEW"] },
          recordedByUserId: { not: null },
          NOT: { recordedByUserId: actor.user.id }
        },
        { status: "RETURNED" }
      ]
    });
    expect(pageQuery.select).toEqual({
      id: true,
      title: true,
      status: true,
      businessDate: true,
      logType: true,
      createdAt: true,
      location: { select: { name: true } }
    });
    expect(pageQuery.select).not.toHaveProperty("readings");
  });

  it("applies the shared Food Safety cursor without changing the count predicate", async () => {
    const actor = { ...session, permissionCodes: [permissions.foodSafetyReview] };
    const after = {
      createdAt: "2026-07-23T01:00:00.000Z",
      sourceType: "FOOD_SAFETY" as const,
      recordId: "00000000-0000-4000-8000-000000000400"
    };
    await listFoodSafetyMyTaskPage(actor as never, { after, take: 1 });
    const countWhere = mockPrisma.foodSafetyLog.count.mock.calls[0]![0].where;
    const pageQuery = mockPrisma.foodSafetyLog.findMany.mock.calls[0]![0];
    expect(pageQuery.where).toEqual({
      ...countWhere,
      AND: [{
        OR: [
          { createdAt: { gt: new Date(after.createdAt) } },
          { createdAt: new Date(after.createdAt), id: { gt: after.recordId } }
        ]
      }]
    });
    expect(pageQuery.take).toBe(2);
  });

  it("does not query tasks for a view-only user", async () => {
    await expect(
      listFoodSafetyMyTaskPage({ ...session, permissionCodes: [permissions.foodSafetyView] } as never)
    ).resolves.toEqual({ totalCount: 0, items: [], nextCursor: null });
    expect(mockPrisma.foodSafetyLog.count).not.toHaveBeenCalled();
    expect(mockPrisma.foodSafetyLog.findMany).not.toHaveBeenCalled();
  });
});

const serviceSource = readFileSync(new URL("./foodSafety.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703123000_phase2_food_safety_logs/migration.sql"
  ),
  "utf8"
);
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/food-safety/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/food-safety/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/food-safety/export/route.ts"),
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
  permissionCodes: [permissions.foodSafetyCreate]
};

function foodSafetyForm() {
  const form = new FormData();
  form.set("businessDate", "2026-07-03");
  form.set("logType", "TEMPERATURE");
  form.set("title", "Opening Temperature Log");
  form.set("reading.1.station", "Reach-in Chiller");
  form.set("reading.1.readingType", "Cold holding temperature");
  form.set("reading.1.readingValue", "7.2");
  form.set("reading.1.readingUom", "C");
  form.set("reading.1.expectedMinValue", "0");
  form.set("reading.1.expectedMaxValue", "5");
  form.set("reading.1.result", "EXCEPTION");
  form.set("reading.1.severity", "HIGH");
  form.set("reading.1.correctiveAction", "Moved trays to backup chiller.");
  form.set("reading.1.evidenceReference", "TEMP-PHOTO-7");
  form.set("reading.2.station", "Rice Warmer");
  form.set("reading.2.readingType", "Hot holding temperature");
  form.set("reading.2.readingValue", "64");
  form.set("reading.2.readingUom", "C");
  form.set("reading.2.expectedMinValue", "60");
  form.set("reading.2.expectedMaxValue", "90");
  form.set("reading.2.result", "PASS");
  form.set("reading.2.severity", "NORMAL");
  return form;
}

function foodSafetyReviewForm() {
  const form = new FormData();
  form.set("logId", "00000000-0000-4000-8000-000000000401");
  form.set("reviewedAt", "2026-07-03");
  form.set("outcome", "REVIEWED");
  form.set("reviewNote", "Temperature log reviewed by manager.");
  return form;
}

function foodSafetyCloseForm() {
  const form = new FormData();
  form.set("logId", "00000000-0000-4000-8000-000000000401");
  form.set("closeReason", "QA manager verified corrective actions are complete.");
  return form;
}

function foodSafetyReturnCorrectionForm() {
  const form = new FormData();
  form.set("logId", "00000000-0000-4000-8000-000000000401");
  form.set("correctionReason", "Thermometer evidence is missing for exception reading.");
  form.set("evidenceReference", "QA-RETURN-7");
  return form;
}

function foodSafetyApplyCorrectionForm() {
  const form = new FormData();
  form.set("logId", "00000000-0000-4000-8000-000000000401");
  form.set("correctionReason", "Branch added corrected chiller reading and evidence.");
  form.set("evidenceReference", "QA-CORRECTION-7");
  form.set("reading.1.station", "Reach-in Chiller");
  form.set("reading.1.readingType", "Cold holding temperature");
  form.set("reading.1.readingValue", "4.1");
  form.set("reading.1.readingUom", "C");
  form.set("reading.1.expectedMinValue", "0");
  form.set("reading.1.expectedMaxValue", "5");
  form.set("reading.1.result", "PASS");
  form.set("reading.1.severity", "NORMAL");
  form.set("reading.1.correctiveAction", "Backup chiller stabilized stock.");
  form.set("reading.1.evidenceReference", "TEMP-CORRECTED-7");
  form.set("reading.2.station", "Rice Warmer");
  form.set("reading.2.readingType", "Hot holding temperature");
  form.set("reading.2.readingValue", "64");
  form.set("reading.2.readingUom", "C");
  form.set("reading.2.expectedMinValue", "60");
  form.set("reading.2.expectedMaxValue", "90");
  form.set("reading.2.result", "PASS");
  form.set("reading.2.severity", "NORMAL");
  return form;
}

describe("Phase 2 food safety foundation", () => {
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
                code: permissions.foodSafetyCreate
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback({
        foodSafetyLog: {
          create: vi.fn().mockResolvedValue({
            id: "food-log-created",
            status: "SUBMITTED",
            businessDate: new Date("2026-07-03T00:00:00.000Z"),
            logType: "TEMPERATURE",
            exceptionCount: 1
          })
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({})
        }
      })
    );
  });

  it("creates a food-safety log with derived exception metrics and audit history", async () => {
    const tx = {
      foodSafetyLog: {
        create: vi.fn().mockResolvedValue({
          id: "food-log-created",
          status: "SUBMITTED",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          logType: "TEMPERATURE",
          exceptionCount: 1
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(createFoodSafetyLog(foodSafetyForm())).resolves.toBe(
      "food-log-created"
    );

    expect(mockContext.assertAuthorizedLocation).toHaveBeenCalledWith(
      session,
      session.context.locationId
    );
    expect(tx.foodSafetyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUBMITTED",
          title: "Opening Temperature Log",
          recordedByUserId: session.user.id,
          exceptionCount: 1,
          readings: {
            create: expect.arrayContaining([
              expect.objectContaining({
                lineNo: 1,
                result: "EXCEPTION",
                severity: "HIGH",
                readingValue: "7.2",
                expectedMaxValue: "5",
                evidenceReference: "TEMP-PHOTO-7"
              }),
              expect.objectContaining({
                lineNo: 2,
                result: "PASS",
                severity: "NORMAL",
                readingValue: "64"
              })
            ])
          }
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "food_safety_log.created",
          entityId: "food-log-created",
          metadata: expect.objectContaining({
            readingCount: 2,
            boundary: "food_safety_create_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("rejects sparse and out-of-range food-safety reading payloads before writing", async () => {
    const sparseForm = foodSafetyForm();
    sparseForm.delete("reading.2.station");
    sparseForm.delete("reading.2.readingType");
    sparseForm.set("reading.3.station", "Freezer 1");
    sparseForm.set("reading.3.readingType", "Temperature");

    mockPrisma.$transaction.mockClear();
    await expect(createFoodSafetyLog(sparseForm)).rejects.toThrow(
      "FOOD_SAFETY_READING_INDEX_INVALID"
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();

    const outOfRangeForm = foodSafetyForm();
    outOfRangeForm.set("reading.21.station", "Invalid station");
    outOfRangeForm.set("reading.21.readingType", "Temperature");

    mockPrisma.$transaction.mockClear();
    await expect(createFoodSafetyLog(outOfRangeForm)).rejects.toThrow(
      "FOOD_SAFETY_READING_INDEX_INVALID"
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires exception-review outcome for food-safety logs with exceptions", async () => {
    const reviewSession = {
      ...session,
      permissionCodes: [permissions.foodSafetyReview]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(reviewSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.foodSafetyReview
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      foodSafetyLog: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000401",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "SUBMITTED",
          recordedByUserId: "00000000-0000-4000-8000-000000000202",
          reviewedAt: null,
          reviewedByUserId: null,
          exceptionCount: 1
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

    await expect(reviewFoodSafetyLog(foodSafetyReviewForm())).rejects.toThrow(
      "FOOD_SAFETY_EXCEPTION_REVIEW_REQUIRED"
    );

    expect(tx.foodSafetyLog.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("fails review and return closed when recorder lineage is missing", async () => {
    const incomplete = {
      id: "00000000-0000-4000-8000-000000000401",
      businessDate: new Date("2026-07-03T00:00:00.000Z"),
      status: "SUBMITTED",
      recordedByUserId: null,
      reviewedAt: null,
      reviewedByUserId: null,
      exceptionCount: 0
    };
    for (const [permission, action, form] of [
      [permissions.foodSafetyReview, reviewFoodSafetyLog, foodSafetyReviewForm],
      [permissions.foodSafetyCorrect, returnFoodSafetyLogForCorrection, foodSafetyReturnCorrectionForm]
    ] as const) {
      mockContext.requireSessionContext.mockResolvedValueOnce({
        ...session,
        permissionCodes: [permission]
      });
      mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
        { role: { permissions: [{ permission: { tenantId: session.context.tenantId, code: permission } }] } }
      ]);
      const tx = {
        foodSafetyLog: {
          findFirst: vi.fn().mockResolvedValue(incomplete),
          updateMany: vi.fn()
        }
      };
      mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
      await expect(action(form())).rejects.toThrow(
        "FOOD_SAFETY_RECORDER_LINEAGE_REQUIRED"
      );
      expect(tx.foodSafetyLog.updateMany).not.toHaveBeenCalled();
    }
  });

  it("closes reviewed food-safety logs with reason and audit history", async () => {
    const closeSession = {
      ...session,
      permissionCodes: [permissions.foodSafetyReview]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(closeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.foodSafetyReview
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      foodSafetyLog: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000401",
          businessDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "REVIEWED",
          reviewedAt: new Date("2026-07-03T00:00:00.000Z"),
          reviewedByUserId: "00000000-0000-4000-8000-000000000202"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000401",
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

    await expect(closeFoodSafetyLog(foodSafetyCloseForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000401"
    );

    expect(tx.foodSafetyLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000401",
          status: { in: ["REVIEWED", "EXCEPTION_OPEN"] }
        }),
        data: { status: "CLOSED" }
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "food_safety_log.closed",
          entityId: "00000000-0000-4000-8000-000000000401",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            reason: "QA manager verified corrective actions are complete.",
            boundary: "food_safety_close_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("returns a submitted food-safety log for correction with audit and transition history", async () => {
    const reviewSession = {
      ...session,
      user: {
        ...session.user,
        id: "00000000-0000-4000-8000-000000000202"
      },
      permissionCodes: [permissions.foodSafetyCorrect]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(reviewSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.foodSafetyCorrect
              }
            }
          ]
        }
      }
    ]);
    const current = {
      id: "00000000-0000-4000-8000-000000000401",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      status: "SUBMITTED",
      recordedByUserId: session.user.id,
      updatedAt: new Date("2026-07-03T08:00:00.000Z"),
      reviewedAt: null,
      reviewedByUserId: null
    };
    const updated = {
      ...current,
      status: "RETURNED"
    };
    const tx = {
      foodSafetyLog: {
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
      returnFoodSafetyLogForCorrection(foodSafetyReturnCorrectionForm())
    ).resolves.toBe("00000000-0000-4000-8000-000000000401");

    expect(tx.foodSafetyLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: current.id,
          status: { in: ["SUBMITTED", "EXCEPTION_REVIEW"] }
        }),
        data: { status: "RETURNED" }
      })
    );
    expect(tx.foodSafetyLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: session.context.brandId })
      })
    );
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "FoodSafetyLog",
          targetEntityId: current.id,
          correctionType: "RETURN_FOR_CORRECTION",
          status: "REQUESTED",
          requestedByUserId: reviewSession.user.id,
          reason: "Thermometer evidence is missing for exception reading.",
          evidenceReference: "QA-RETURN-7",
          idempotencyKey:
            "FoodSafetyLog:00000000-0000-4000-8000-000000000401:RETURN_FOR_CORRECTION:2026-07-03T08:00:00.000Z"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "food_safety_log.returned_for_correction",
          metadata: expect.objectContaining({
            reason: "Thermometer evidence is missing for exception reading.",
            evidenceReference: "QA-RETURN-7",
            boundary: "food_safety_return_correction_only_no_source_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "FoodSafetyLog",
          action: "RETURN_FOR_CORRECTION",
          fromStatus: "SUBMITTED",
          toStatus: "RETURNED"
        })
      })
    );
  });

  it("applies returned food-safety corrections and resubmits with audit history", async () => {
    const current = {
      id: "00000000-0000-4000-8000-000000000401",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      status: "RETURNED",
      exceptionCount: 1,
      updatedAt: new Date("2026-07-03T09:00:00.000Z"),
      readings: [
        {
          lineNo: 1,
          station: "Reach-in Chiller",
          readingType: "Cold holding temperature",
          readingValue: "7.2",
          readingUom: "C",
          expectedMinValue: "0",
          expectedMaxValue: "5",
          result: "EXCEPTION",
          severity: "HIGH",
          correctiveAction: "Moved trays to backup chiller.",
          evidenceReference: "TEMP-PHOTO-7"
        },
        {
          lineNo: 2,
          station: "Rice Warmer",
          readingType: "Hot holding temperature",
          readingValue: "64",
          readingUom: "C",
          expectedMinValue: "60",
          expectedMaxValue: "90",
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: null,
          evidenceReference: null
        }
      ]
    };
    const updated = {
      ...current,
      status: "SUBMITTED",
      exceptionCount: 0,
      readings: [
        {
          ...current.readings[0],
          readingValue: "4.1",
          result: "PASS",
          severity: "NORMAL",
          correctiveAction: "Backup chiller stabilized stock.",
          evidenceReference: "TEMP-CORRECTED-7"
        },
        current.readings[1]
      ]
    };
    const tx = {
      foodSafetyLog: {
        findFirst: vi.fn().mockResolvedValue(current),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated)
      },
      foodSafetyReading: {
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
      applyFoodSafetyLogCorrection(foodSafetyApplyCorrectionForm())
    ).resolves.toBe("00000000-0000-4000-8000-000000000401");

    expect(tx.foodSafetyLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id, status: "RETURNED" },
        data: expect.objectContaining({
          status: "SUBMITTED",
          recordedByUserId: session.user.id,
          reviewedByUserId: null,
          reviewedAt: null,
          exceptionCount: 0
        })
      })
    );
    expect(tx.foodSafetyLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ brandId: session.context.brandId })
      })
    );
    expect(tx.foodSafetyReading.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "FoodSafetyLog",
          correctionType: "APPLY_CORRECTION",
          status: "APPLIED",
          appliedByUserId: session.user.id,
          reason: "Branch added corrected chiller reading and evidence.",
          evidenceReference: "QA-CORRECTION-7",
          idempotencyKey:
            "FoodSafetyLog:00000000-0000-4000-8000-000000000401:APPLY_CORRECTION:2026-07-03T09:00:00.000Z"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "food_safety_log.correction_applied",
          metadata: expect.objectContaining({
            boundary: "food_safety_correction_no_inventory_finance_mutation"
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

  it("adds scoped food safety logs and readings", () => {
    expect(schemaSource).toContain("model FoodSafetyLog");
    expect(schemaSource).toContain("model FoodSafetyReading");
    expect(schemaSource).toContain("foodSafetyLogs");
    expect(migrationSource).toContain(
      "FoodSafetyLog_companyId_locationId_businessDate_logType_key"
    );
    expect(migrationSource).toContain("FoodSafetyReading_logId_lineNo_key");
  });

  it("keeps food safety controlled and separate from inventory and incidents", () => {
    expect(serviceSource).toContain("getFoodSafetyDashboard");
    expect(serviceSource).toContain("getFoodSafetyDashboardRead");
    expect(serviceSource).toContain("reviewCandidates");
    expect(serviceSource).toContain("exceptionCandidates");
    expect(serviceSource).toContain("take: 3");
    expect(serviceSource).toContain("_sum: { exceptionCount: true }");
    expect(serviceSource).toContain("FoodSafetyStatusCounts");
    expect(serviceSource).toContain("FoodSafetySeverityCounts");
    expect(serviceSource).toContain("statusCounts");
    expect(serviceSource).toContain("severityCounts");
    expect(serviceSource).toContain("createFoodSafetyLog");
    expect(serviceSource).toContain("permissions.foodSafetyCreate");
    expect(serviceSource).toContain("FOOD_SAFETY_READINGS_REQUIRED");
    expect(serviceSource).toContain("FOOD_SAFETY_LOG_ALREADY_EXISTS");
    expect(serviceSource).toContain("food_safety_log.created");
    expect(serviceSource).toContain("food_safety_create_only_no_source_mutation");
    expect(serviceSource).toContain("recordOperationalStatusTransition");
    expect(serviceSource).toContain('targetEntityType: "FoodSafetyLog"');
    expect(serviceSource).toContain('action: "CREATE_SUBMITTED"');
    expect(serviceSource).toContain('action: "REVIEW"');
    expect(serviceSource).toContain('action: "CLOSE"');
    expect(seedSource).toContain("restaurant.food_safety.create");
    expect(seedSource).toContain("foodSafetyCreatePermissionId");
    expect(createPermissionMigrationSource).toContain("restaurant.food_safety.create");
    expect(createPermissionMigrationSource).toContain("CONFIGURED_REQUESTER");
    expect(createPermissionMigrationSource).toContain("restaurant.food_safety.review");
    expect(serviceSource).toContain("getFoodSafetyLogSummary");
    expect(serviceSource).toContain("buildFoodSafetyExportRows");
    expect(serviceSource).toContain("filterFoodSafetyLogs");
    expect(serviceSource).toContain("filters.businessDate");
    expect(serviceSource).toContain("canUseFoodSafety");
    expect(serviceSource).toContain("reviewFoodSafetyLog");
    expect(serviceSource).toContain("requirePermission(session, permissions.foodSafetyReview)");
    expect(serviceSource).toContain("reviewableFoodSafetyStatuses");
    expect(serviceSource).toContain("FOOD_SAFETY_SELF_REVIEW_BLOCKED");
    expect(serviceSource).toContain("FOOD_SAFETY_EXCEPTION_REVIEW_REQUIRED");
    expect(serviceSource).toContain("FOOD_SAFETY_REVIEW_CONFLICT");
    expect(serviceSource).toContain("food_safety_log.reviewed");
    expect(serviceSource).toContain("food_safety_review_only_no_source_mutation");
    expect(serviceSource).toContain("returnFoodSafetyLogForCorrection");
    expect(serviceSource).toContain("returnFoodSafetyCorrectionSchema");
    expect(serviceSource).toContain("operationalCorrectionRecord");
    expect(serviceSource).toContain("food_safety_log.returned_for_correction");
    expect(serviceSource).toContain("food_safety_return_correction_only_no_source_mutation");
    expect(serviceSource).toContain('status: "RETURNED"');
    expect(serviceSource).toContain('action: "RETURN_FOR_CORRECTION"');
    expect(serviceSource).toContain("applyFoodSafetyLogCorrection");
    expect(serviceSource).toContain("applyFoodSafetyCorrectionSchema");
    expect(serviceSource).toContain("FOOD_SAFETY_LOG_STATUS_NOT_CORRECTABLE");
    expect(serviceSource).toContain("FOOD_SAFETY_CORRECTION_CONFLICT");
    expect(serviceSource).toContain("food_safety_log.correction_applied");
    expect(serviceSource).toContain("food_safety_correction_no_inventory_finance_mutation");
    expect(serviceSource).toContain('correctionType: "APPLY_CORRECTION"');
    expect(serviceSource).toContain('action: "APPLY_CORRECTION"');
    expect(serviceSource).toContain("closeFoodSafetyLog");
    expect(serviceSource).toContain("closeableFoodSafetyStatuses");
    expect(serviceSource).toContain("FOOD_SAFETY_LOG_STATUS_NOT_CLOSABLE");
    expect(serviceSource).toContain("FOOD_SAFETY_CLOSE_CONFLICT");
    expect(serviceSource).toContain("food_safety_log.closed");
    expect(serviceSource).toContain("food_safety_close_only_no_source_mutation");
    expect(serviceSource).toContain("tx.foodSafetyLog.updateMany");
    expect(serviceSource).toContain("prisma.foodSafetyLog.findMany");
    expect(serviceSource).toContain("prisma.user.findMany");
    expect(serviceSource).toContain("recordedByUserId: log.recordedByUserId");
    expect(serviceSource).toContain("reviewedByUserId: log.reviewedByUserId");
    expect(serviceSource).toContain("recordedByName");
    expect(serviceSource).toContain("reviewedByName");
    expect(serviceSource).toContain("locationId: session.context.locationId");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("inventoryBalance.update");
    expect(serviceSource).not.toContain("incident.create");
  });

  it("provides a scoped food-safety detail view with controlled review", () => {
    expect(detailPageSource).toContain("getFoodSafetyLogSummary(session, id)");
    expect(detailPageSource).toContain("this log detail captures");
    expect(detailPageSource).toContain("notFound()");
    expect(detailPageSource).toContain("reviewFoodSafetyLogAction");
    expect(detailPageSource).toContain("closeFoodSafetyLogAction");
    expect(detailPageSource).toContain("returnFoodSafetyLogAction");
    expect(detailPageSource).toContain("returnFoodSafetyLogForCorrection");
    expect(detailPageSource).toContain("Return for Correction");
    expect(detailPageSource).toContain("applyFoodSafetyLogCorrectionAction");
    expect(detailPageSource).toContain("applyFoodSafetyLogCorrection");
    expect(detailPageSource).toContain("Correct and Resubmit");
    expect(detailPageSource).toContain("permissions.foodSafetyReview");
    expect(detailPageSource).toContain("permissions.foodSafetyCreate");
    expect(detailPageSource).toContain("log.recordedByUserId !== session.user.id");
    expect(detailPageSource).toContain("<EntryModal title=\"Review Food-Safety Log\"");
    expect(detailPageSource).toContain("<EntryModal title=\"Close Food-Safety Log\"");
    expect(detailPageSource).toContain('name="reviewedAt"');
    expect(detailPageSource).toContain('name="closeReason"');
    expect(detailPageSource).toContain('name="outcome"');
    expect(detailPageSource).toContain('name="reviewNote"');
    expect(detailPageSource).toContain("log.recordedByName");
    expect(detailPageSource).toContain("log.reviewedByName");
    expect(detailPageSource).toContain("log.reviewedAt");
    expect(detailPageSource).toContain('status === "SUBMITTED"');
    expect(detailPageSource).toContain("status.includes(\"EXCEPTION\")");
    expect(detailPageSource).not.toContain("inventoryMovement.create");
    expect(detailPageSource).not.toContain("incident.create");
  });

  it("provides food-safety queue search and filters without mutating source records", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="businessDate"');
    expect(listPageSource).toContain('name="type"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain("workspace");
    expect(listPageSource).toContain("PAGE_SIZE = 25");
    expect(listPageSource).toContain("normalizePage");
    expect(listPageSource).toContain("paginatedLogs");
    expect(listPageSource).toContain("pageHref");
    expect(listPageSource).toContain("workspace.page");
    expect(listPageSource).toContain("Page {workspace.page} of {workspace.totalPages}");
    expect(listPageSource).toContain("listFoodSafetyLogPage");
    expect(listPageSource).toContain("log.recordedByName");
    expect(listPageSource).toContain("log.reviewedByName");
    expect(listPageSource).toContain("buildQueryHref(\"/food-safety/export\"");
    expect(exportRouteSource).toContain("getStrictDateSearchParam");
    expect(exportRouteSource).toContain('"businessDate"');
    expect(exportRouteSource).toContain("FOOD_SAFETY_BUSINESS_DATE_INVALID");
    expect(serviceSource).toContain('"Recorded By"');
    expect(serviceSource).toContain('"Reviewed By"');
    expect(serviceSource).toContain('"Reviewed At"');
    expect(serviceSource).toContain('"Exception Review Count"');
    expect(serviceSource).toContain('"Critical Exception Count"');
    expect(listPageSource).not.toContain("log.readings.map");
    expect(listPageSource).not.toContain("Evidence: {reading.evidenceReference}");
    expect(listPageSource).toContain('"IN_PROGRESS"');
    expect(listPageSource).toContain('"EXCEPTION_OPEN"');
    expect(listPageSource).toContain('"RETURNED"');
    expect(listPageSource).toContain('"EXCEPTION_REVIEW"');
    expect(listPageSource).toContain('status === "SUBMITTED"');
    expect(listPageSource).toContain("status.includes(\"EXCEPTION\")");
    expect(listPageSource).toContain("No food-safety logs match the filters");
    expect(listPageSource).toContain("getFoodSafetyDashboardRead(session)");
    expect(listPageSource).toContain("Record Food-Safety Log");
    expect(listPageSource).toContain("createFoodSafetyLogAction");
    expect(listPageSource).toContain("permissions.foodSafetyCreate");
    expect(listPageSource).toContain("ActionFeedbackBanner");
    expect(listPageSource).toContain("action={createFoodSafetyLogAction}");
    expect(listPageSource).toContain("FoodSafetyReadingsEditor");
    expect(listPageSource).not.toContain("[1, 2, 3, 4, 5]");
    expect(listPageSource).not.toContain("foodSafetyLog.update");
  });

  it("filters food-safety logs by nested evidence, actors, and combined queue facets", () => {
    const logs: FoodSafetyLogSummary[] = [
      {
        id: "safety-1",
        title: "Opening Temperature Log",
        locationName: "SM North Edsa",
        businessDate: "2026-07-03",
        logType: "TEMPERATURE",
        status: "SUBMITTED",
        recordedByName: "Bianca Reyes",
        reviewedByName: null,
        reviewedAt: null,
        exceptionCount: 1,
        readings: [
          {
            id: "reading-1",
            lineNo: 1,
            station: "Chiller 2",
            readingType: "TEMPERATURE",
            readingValue: 9,
            readingUom: "C",
            expectedMinValue: 0,
            expectedMaxValue: 5,
            result: "EXCEPTION",
            severity: "HIGH",
            correctiveAction: "Transferred beef trays to backup chiller",
            evidenceReference: "temp-photo-chiller-2"
          }
        ]
      },
      {
        id: "safety-2",
        title: "Closing Sanitation Log",
        locationName: "SM Mall of Asia",
        businessDate: "2026-07-04",
        logType: "SANITATION",
        status: "REVIEWED",
        recordedByName: "Paolo Cruz",
        reviewedByName: "Alyssa Tan",
        reviewedAt: "2026-07-04",
        exceptionCount: 0,
        readings: [
          {
            id: "reading-2",
            lineNo: 1,
            station: "Dish area",
            readingType: "VISUAL",
            readingValue: null,
            readingUom: null,
            expectedMinValue: null,
            expectedMaxValue: null,
            result: "PASS",
            severity: "LOW",
            correctiveAction: null,
            evidenceReference: null
          }
        ]
      }
    ];

    expect(
      filterFoodSafetyLogs(logs, { q: "backup chiller" }).map((log) => log.id)
    ).toEqual(["safety-1"]);
    expect(filterFoodSafetyLogs(logs, { q: "alyssa" }).map((log) => log.id))
      .toEqual(["safety-2"]);
    expect(
      filterFoodSafetyLogs(logs, {
        businessDate: "2026-07-03",
        type: "TEMPERATURE",
        status: "SUBMITTED"
      }).map((log) => log.id)
    ).toEqual(["safety-1"]);
    expect(
      filterFoodSafetyLogs(logs, {
        businessDate: "2026-07-03",
        type: "SANITATION",
        status: "SUBMITTED"
      })
    ).toEqual([]);
    expect(
      filterFoodSafetyLogs(logs, {
        q: "",
        type: "ALL",
        status: "ALL"
      }).map((log) => log.id)
    ).toEqual(["safety-1", "safety-2"]);
  });
});
