import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  cancelMaintenanceTicket,
  completeMaintenanceTicket,
  correctMaintenanceTicket,
  createMaintenanceTicket,
  filterMaintenanceTickets,
  type MaintenanceTicketSummary
} from "./maintenance";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  maintenanceTicket: {
    count: vi.fn()
  },
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

const serviceSource = readFileSync(new URL("./maintenance.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703143000_phase2_maintenance_tickets/migration.sql"
  ),
  "utf8"
);
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/maintenance/export/route.ts"),
  "utf8"
);

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "manager@example.test",
    displayName: "Branch Manager"
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
  permissionCodes: [permissions.maintenanceCreate, permissions.incidentView]
};

function maintenanceFormWithInvalidTargetDate() {
  const form = new FormData();
  form.set("requestedAt", "2026-07-03");
  form.set("targetDueAt", "2026-07-02");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "HIGH");
  form.set("title", "Ignition issue");
  form.set("description", "Table grill ignition did not start during opening checks.");
  form.set("downtimeMinutes", "45");
  form.set("correctiveAction", "Technician to inspect igniter and gas connection.");
  form.set("evidenceReference", "GRILL-PHOTO-4");
  form.set("sourceIncidentId", "24000000-0000-4000-8000-000000000001");
  return form;
}

function validMaintenanceForm() {
  const form = new FormData();
  form.set("requestedAt", "2026-07-03");
  form.set("targetDueAt", "2026-07-04");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "HIGH");
  form.set("title", "Ignition issue");
  form.set("description", "Table grill ignition did not start during opening checks.");
  form.set("downtimeMinutes", "45");
  form.set("correctiveAction", "Technician to inspect igniter and gas connection.");
  form.set("evidenceReference", "GRILL-PHOTO-4");
  form.set("sourceIncidentId", "24000000-0000-4000-8000-000000000001");
  return form;
}

function completeMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("completedAt", "2026-07-04");
  form.set("downtimeMinutes", "35");
  form.set("correctiveAction", "Technician replaced igniter and verified grill startup.");
  form.set("evidenceReference", "MT-COMPLETE-4");
  return form;
}

function cancelMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("cancelReason", "Duplicate ticket created for the same grill issue.");
  return form;
}

function correctMaintenanceForm() {
  const form = new FormData();
  form.set("ticketId", "00000000-0000-4000-8000-000000000801");
  form.set("requestedAt", "2026-07-05");
  form.set("targetDueAt", "2026-07-06");
  form.set("category", "EQUIPMENT");
  form.set("assetName", "Table Grill 4");
  form.set("assetArea", "Dining Room");
  form.set("priority", "CRITICAL");
  form.set("title", "Ignition issue corrected");
  form.set("description", "Corrected maintenance detail after vendor triage.");
  form.set("downtimeMinutes", "60");
  form.set("correctiveAction", "Vendor to replace ignition assembly.");
  form.set("evidenceReference", "MT-CORRECTED-4");
  form.set("correctionReason", "Vendor triage changed priority and target due date.");
  form.set("correctionEvidenceReference", "MT-CORRECTION-EVIDENCE-4");
  return form;
}

describe("Phase 2 maintenance foundation", () => {
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
                code: permissions.maintenanceCreate
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.maintenanceTicket.count.mockResolvedValue(12);
  });

  it("rejects maintenance target dates before the request date before writing", async () => {
    await expect(
      createMaintenanceTicket(maintenanceFormWithInvalidTargetDate())
    ).rejects.toThrow("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");

    expect(mockContext.assertAuthorizedLocation).toHaveBeenCalledWith(
      session,
      session.context.locationId
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects maintenance source incidents that are missing or outside scope", async () => {
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      maintenanceTicket: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(createMaintenanceTicket(validMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED"
    );

    expect(tx.operationalIncident.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "24000000-0000-4000-8000-000000000001",
          locationId: session.context.locationId
        })
      })
    );
    expect(tx.maintenanceTicket.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("requires permission to view the linked source incident", async () => {
    const tx = {
      operationalIncident: {
        findFirst: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      permissionCodes: [permissions.maintenanceCreate]
    });

    await expect(createMaintenanceTicket(validMaintenanceForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(tx.operationalIncident.findFirst).not.toHaveBeenCalled();
  });

  it("retries maintenance ticket creation after document-number collision", async () => {
    const firstTx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-incident" })
      },
      maintenanceTicket: {
        create: vi.fn().mockRejectedValue({ code: "P2002" })
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    const secondTx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-incident" })
      },
      maintenanceTicket: {
        create: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000601",
          locationId: session.context.locationId,
          ticketNumber: "MT-2026-00013",
          status: "OPEN",
          priority: "HIGH",
          category: "EQUIPMENT"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction
      .mockImplementationOnce(async (callback) => callback(firstTx))
      .mockImplementationOnce(async (callback) => callback(secondTx));

    await expect(createMaintenanceTicket(validMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000601"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(firstTx.operationalIncident.findFirst).toHaveBeenCalled();
    expect(secondTx.operationalIncident.findFirst).toHaveBeenCalled();
    expect(firstTx.auditEvent.create).not.toHaveBeenCalled();
    expect(secondTx.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketNumber: "MT-2026-00013",
          status: "OPEN",
          reportedByUserId: session.user.id,
          ownerUserId: session.user.id,
          sourceIncidentId: "24000000-0000-4000-8000-000000000001",
          downtimeMinutes: 45
        })
      })
    );
    expect(secondTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.created",
          entityId: "00000000-0000-4000-8000-000000000601",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            sourceIncidentId: "24000000-0000-4000-8000-000000000001",
            boundary: "maintenance_create_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("completes a maintenance ticket with optimistic status update and audit history", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          locationId: session.context.locationId,
          status: "COMPLETED",
          completedAt: new Date("2026-07-04T00:00:00.000Z"),
          downtimeMinutes: 35,
          correctiveAction: "Technician replaced igniter and verified grill startup.",
          evidenceReference: "MT-COMPLETE-4"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000801",
          completedAt: null
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          downtimeMinutes: 35,
          ownerUserId: session.user.id,
          evidenceReference: "MT-COMPLETE-4"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.completed",
          entityId: "00000000-0000-4000-8000-000000000801",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            boundary: "maintenance_completion_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("cancels a maintenance ticket with reason, audit history, and source boundaries", async () => {
    const cancelSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(cancelSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          locationId: session.context.locationId,
          sourceIncidentId: "24000000-0000-4000-8000-000000000001",
          status: "CANCELLED",
          completedAt: null,
          downtimeMinutes: 45,
          correctiveAction: "Duplicate ticket created for the same grill issue.",
          evidenceReference: "MT-OPEN-4"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(cancelMaintenanceTicket(cancelMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000801",
          completedAt: null
        }),
        data: expect.objectContaining({
          status: "CANCELLED",
          ownerUserId: session.user.id,
          correctiveAction: "Duplicate ticket created for the same grill issue."
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.cancelled",
          entityId: "00000000-0000-4000-8000-000000000801",
          metadata: expect.objectContaining({
            locationId: session.context.locationId,
            sourceIncidentId: "24000000-0000-4000-8000-000000000001",
            reason: "Duplicate ticket created for the same grill issue.",
            boundary: "maintenance_cancellation_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("treats an already-recorded maintenance completion as idempotent before policy validation", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          status: "COMPLETED"
        }),
        updateMany: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-transition" }),
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: "00000000-0000-4000-8000-000000000801"
        })
      })
    );
  });

  it("denies high-priority ticket completion by the reporting user", async () => {
    const completeSession = {
      ...session,
      permissionCodes: [permissions.maintenanceComplete]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(completeSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.maintenanceComplete
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          priority: "HIGH",
          reportedByUserId: session.user.id
        }),
        updateMany: vi.fn()
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(completeMaintenanceTicket(completeMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_INDEPENDENT_REVIEW_REQUIRED"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("corrects non-terminal maintenance ticket details with correction, audit, and transition history", async () => {
    const currentTicket = {
      id: "00000000-0000-4000-8000-000000000801",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      requestedAt: new Date("2026-07-03T00:00:00.000Z"),
      category: "EQUIPMENT",
      assetName: "Table Grill 4",
      assetArea: "Dining Room",
      priority: "HIGH",
      status: "OPEN",
      title: "Ignition issue",
      description: "Table grill ignition did not start during opening checks.",
      downtimeMinutes: 45,
      targetDueAt: new Date("2026-07-04T00:00:00.000Z"),
      completedAt: null,
      correctiveAction: "Technician assigned.",
      evidenceReference: "MT-OPEN-4",
      sourceIncidentId: "24000000-0000-4000-8000-000000000001"
    };
    const updatedTicket = {
      ...currentTicket,
      requestedAt: new Date("2026-07-05T00:00:00.000Z"),
      priority: "CRITICAL",
      title: "Ignition issue corrected",
      description: "Corrected maintenance detail after vendor triage.",
      downtimeMinutes: 60,
      targetDueAt: new Date("2026-07-06T00:00:00.000Z"),
      correctiveAction: "Vendor to replace ignition assembly.",
      evidenceReference: "MT-CORRECTED-4"
    };
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue(currentTicket),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTicket)
      },
      operationalCorrectionRecord: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({})
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000801"
    );

    expect(tx.maintenanceTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: currentTicket.id,
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"] },
          completedAt: null
        }),
        data: expect.objectContaining({
          requestedAt: new Date("2026-07-05T00:00:00.000Z"),
          priority: "CRITICAL",
          title: "Ignition issue corrected",
          ownerUserId: session.user.id
        })
      })
    );
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: currentTicket.id,
          correctionType: "DETAIL_CORRECTION",
          status: "APPLIED",
          requestedByUserId: session.user.id,
          appliedByUserId: session.user.id,
          reason: "Vendor triage changed priority and target due date.",
          evidenceReference: "MT-CORRECTION-EVIDENCE-4"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "maintenance_ticket.corrected",
          beforeData: expect.objectContaining({
            priority: "HIGH",
            title: "Ignition issue"
          }),
          afterData: expect.objectContaining({
            priority: "CRITICAL",
            title: "Ignition issue corrected"
          }),
          metadata: expect.objectContaining({
            reason: "Vendor triage changed priority and target due date.",
            evidenceReference: "MT-CORRECTION-EVIDENCE-4",
            boundary: "maintenance_detail_correction_no_source_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "MaintenanceTicket",
          targetEntityId: currentTicket.id,
          action: "DETAIL_CORRECTION",
          fromStatus: "OPEN",
          toStatus: "OPEN",
          reason: "Vendor triage changed priority and target due date.",
          evidenceReference: "MT-CORRECTION-EVIDENCE-4"
        })
      })
    );
  });

  it("blocks maintenance corrections for terminal statuses before mutation", async () => {
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          status: "COMPLETED"
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

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE"
    );

    expect(tx.maintenanceTicket.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects stale maintenance correction attempts without audit writes", async () => {
    const tx = {
      maintenanceTicket: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000801",
          brandId: session.context.brandId,
          locationId: session.context.locationId,
          requestedAt: new Date("2026-07-03T00:00:00.000Z"),
          category: "EQUIPMENT",
          assetName: "Table Grill 4",
          assetArea: "Dining Room",
          priority: "HIGH",
          status: "OPEN",
          title: "Ignition issue",
          description: "Table grill ignition did not start during opening checks.",
          downtimeMinutes: 45,
          targetDueAt: new Date("2026-07-04T00:00:00.000Z"),
          completedAt: null,
          correctiveAction: "Technician assigned.",
          evidenceReference: "MT-OPEN-4"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn()
      },
      operationalCorrectionRecord: {
        create: vi.fn()
      },
      operationalStatusTransition: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(correctMaintenanceTicket(correctMaintenanceForm())).rejects.toThrow(
      "MAINTENANCE_TICKET_CORRECTION_CONFLICT"
    );

    expect(tx.operationalCorrectionRecord.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("adds scoped maintenance ticket records", () => {
    expect(schemaSource).toContain("model MaintenanceTicket");
    expect(schemaSource).toContain("maintenanceTickets");
    expect(migrationSource).toContain(
      "MaintenanceTicket_companyId_ticketNumber_key"
    );
    expect(migrationSource).toContain("MaintenanceTicket_priority_status_idx");
  });

  it("keeps maintenance controlled and separate from purchasing, inventory, and incidents", () => {
    expect(serviceSource).toContain("getMaintenanceDashboard");
    expect(serviceSource).toContain("getMaintenanceTicketSummary");
    expect(serviceSource).toContain("getMaintenanceTicketDetail");
    expect(serviceSource).toContain("buildMaintenanceExportRows");
    expect(serviceSource).toContain("filterMaintenanceTickets");
    expect(serviceSource).toContain("filters.requestedAt");
    expect(serviceSource).toContain("prisma.user.findMany");
    expect(serviceSource).toContain("reportedByName");
    expect(serviceSource).toContain("ownerName");
    expect(serviceSource).toContain("dateOnlyInTimeZone(new Date())");
    expect(serviceSource).toContain("dateOrNull(ticket.targetDueAt)! < todayDate");
    expect(serviceSource).toContain("statusCounts");
    expect(serviceSource).toContain("priorityCounts");
    expect(serviceSource).toContain("Open Count");
    expect(serviceSource).toContain("Critical Count");
    expect(serviceSource).toContain("createMaintenanceTicket");
    expect(serviceSource).toContain("assertSourceIncidentVisible");
    expect(serviceSource).toContain("MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceCreate)");
    expect(serviceSource).toContain("assertAuthorizedLocation(session, session.context.locationId)");
    expect(serviceSource).toContain("MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT");
    expect(serviceSource).toContain("targetDueAt && targetDueAt < requestedAt");
    expect(serviceSource).toContain("maintenance_ticket.created");
    expect(serviceSource).toContain("recordOperationalStatusTransition");
    expect(serviceSource).toContain('targetEntityType: "MaintenanceTicket"');
    expect(serviceSource).toContain('action: "CREATE_OPEN"');
    expect(serviceSource).toContain('action: "COMPLETE"');
    expect(serviceSource).toContain('action: "CANCEL"');
    expect(serviceSource).toContain("maintenance_create_only_no_source_mutation");
    expect(serviceSource).toContain("completeMaintenanceTicket");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceComplete)");
    expect(serviceSource).toContain("completableMaintenanceStatuses");
    expect(serviceSource).toContain("MAINTENANCE_COMPLETED_AT_BEFORE_REQUESTED_AT");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_COMPLETION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.completed");
    expect(serviceSource).toContain("maintenance_completion_only_no_source_mutation");
    expect(serviceSource).toContain("cancelMaintenanceTicket");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_STATUS_NOT_CANCELLABLE");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_CANCELLATION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.cancelled");
    expect(serviceSource).toContain("maintenance_cancellation_only_no_source_mutation");
    expect(serviceSource).toContain("correctMaintenanceTicket");
    expect(serviceSource).toContain("correctMaintenanceTicketSchema");
    expect(serviceSource).toContain("correctableMaintenanceStatuses");
    expect(serviceSource).toContain("requirePermission(session, permissions.maintenanceCreate)");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE");
    expect(serviceSource).toContain("MAINTENANCE_TICKET_CORRECTION_CONFLICT");
    expect(serviceSource).toContain("maintenance_ticket.corrected");
    expect(serviceSource).toContain("operationalCorrectionRecord");
    expect(serviceSource).toContain('targetEntityType: "MaintenanceTicket"');
    expect(serviceSource).toContain('correctionType: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain('action: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain("maintenance_detail_correction_no_source_mutation");
    expect(serviceSource).toContain("canUseMaintenance");
    expect(serviceSource).toContain("prisma.maintenanceTicket.findMany");
    expect(serviceSource).toContain("tx.maintenanceTicket.updateMany");
    expect(serviceSource).toContain("locationId: session.context.locationId");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("purchaseOrder.create");
    expect(serviceSource).not.toContain("operationalIncident.update");
  });

  it("provides a scoped maintenance detail view with controlled completion", () => {
    expect(detailPageSource).toContain("getMaintenanceTicketDetail(session, id)");
    expect(detailPageSource).toContain("this detail view tracks the");
    expect(detailPageSource).toContain("notFound()");
    expect(detailPageSource).toContain("completeMaintenanceTicketAction");
    expect(detailPageSource).toContain("cancelMaintenanceTicketAction");
    expect(detailPageSource).toContain("correctMaintenanceTicketAction");
    expect(detailPageSource).toContain("correctMaintenanceTicket");
    expect(detailPageSource).toContain("permissions.maintenanceComplete");
    expect(detailPageSource).toContain("permissions.maintenanceCreate");
    expect(detailPageSource).toContain("<EntryModal title=\"Complete Maintenance Ticket\"");
    expect(detailPageSource).toContain("<EntryModal title=\"Cancel Maintenance Ticket\"");
    expect(detailPageSource).toContain("Correct Maintenance Details");
    expect(detailPageSource).toContain("Save Maintenance Correction");
    expect(detailPageSource).toContain('name="completedAt"');
    expect(detailPageSource).toContain('name="cancelReason"');
    expect(detailPageSource).toContain('name="correctiveAction"');
    expect(detailPageSource).toContain('name="evidenceReference"');
    expect(detailPageSource).toContain('name="correctionReason"');
    expect(detailPageSource).toContain('name="correctionEvidenceReference"');
    expect(detailPageSource).toContain('name="downtimeMinutes"');
    expect(detailPageSource).toContain("ticket.reportedByName");
    expect(detailPageSource).toContain("ticket.ownerName");
    expect(detailPageSource).toContain("ticket.sourceIncidentId");
    expect(detailPageSource).toContain('status === "PENDING_VENDOR"');
    expect(detailPageSource).toContain('status === "COMPLETED" || status === "CANCELLED"');
    expect(detailPageSource).toContain("sourceIncidentHref");
    expect(detailPageSource).toContain("/incidents/${sourceIncidentId}");
    expect(detailPageSource).toContain("Source incident (read-only reference)");
    expect(detailPageSource).toContain("Open Source Incident");
    expect(detailPageSource).not.toContain("purchaseOrder.create");
  });

  it("shows scoped same-location and same-asset maintenance history", () => {
    expect(serviceSource).toContain("locationId: current.locationId");
    expect(serviceSource).toContain("assetName: current.assetName");
    expect(serviceSource).toContain("assetArea: current.assetArea");
    expect(serviceSource).toContain("requestedAt: { lt: current.requestedAt }");
    expect(detailPageSource).toContain("Same Asset History");
    expect(detailPageSource).toContain("ticket.history.map");
    expect(detailPageSource).toContain("historyTicket.status");
    expect(detailPageSource).toContain("historyTicket.downtimeMinutes");
    expect(detailPageSource).toContain("historyTicket.correctiveAction");
    expect(detailPageSource).toContain("historyTicket.evidenceReference");
    expect(detailPageSource).toContain('href={`/maintenance/${historyTicket.id}`}');
  });

  it("provides maintenance queue search and filters without mutating source records", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="requestedAt"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain('name="priority"');
    expect(listPageSource).toContain("<TaskSheet");
    expect(listPageSource).toContain('title="Create Maintenance Ticket"');
    expect(listPageSource).toContain("createMaintenanceTicketAction");
    expect(listPageSource).toContain("permissions.maintenanceCreate");
    expect(listPageSource).toContain('name="requestedAt"');
    expect(listPageSource).toContain('name="assetName"');
    expect(listPageSource).toContain('name="downtimeMinutes"');
    expect(listPageSource).toContain('name="sourceIncidentId"');
    expect(listPageSource).toContain("visibleTickets");
    expect(listPageSource).toContain("PAGE_SIZE = 10");
    expect(listPageSource).toContain("normalizePage");
    expect(listPageSource).toContain("paginatedTickets");
    expect(listPageSource).toContain("pageHref");
    expect(listPageSource).toContain("Showing {showingStart}-{showingEnd} of {visibleTickets.length} tickets");
    expect(listPageSource).toContain("Page {currentPage} of {totalPages}");
    expect(listPageSource).toContain("filterMaintenanceTickets(dashboard.tickets");
    expect(listPageSource).toContain("ticket.ownerName");
    expect(listPageSource).toContain("buildQueryHref(\"/maintenance/export\"");
    expect(exportRouteSource).toContain("getStrictDateSearchParam");
    expect(exportRouteSource).toContain('"requestedAt"');
    expect(exportRouteSource).toContain("MAINTENANCE_REQUESTED_AT_FILTER_INVALID");
    expect(serviceSource).toContain('"Reported By"');
    expect(serviceSource).toContain('"Owner"');
    expect(serviceSource).toContain('"Source Incident ID"');
    expect(serviceSource).toContain('"Cancelled Count"');
    expect(listPageSource).toContain('"CANCELLED"');
    expect(listPageSource).not.toContain('"CLOSED"');
    expect(listPageSource).toContain('status === "PENDING_VENDOR"');
    expect(listPageSource).toContain('status === "COMPLETED" || status === "CANCELLED"');
    expect(listPageSource).toContain("sourceIncidentHref");
    expect(listPageSource).toContain("/incidents/${sourceIncidentId}");
    expect(listPageSource).toContain("Source");
    expect(listPageSource).toContain("No tickets match the filters");
    expect(listPageSource).toContain("getMaintenanceDashboard(session)");
    expect(listPageSource).not.toContain("maintenanceTicket.update");
    expect(serviceSource).not.toContain("operationalIncident.update");
  });

  it("filters maintenance tickets by actors, asset context, and combined queue facets", () => {
    const tickets: MaintenanceTicketSummary[] = [
      {
        id: "ticket-1",
        ticketNumber: "MT-001",
        requestedAt: "2026-07-03",
        category: "EQUIPMENT",
        assetName: "Grill table 4",
        assetArea: "Dining",
        priority: "CRITICAL",
        status: "OPEN",
        title: "Ignition issue",
        description: "Pilot will not light during opening checks",
        locationName: "SM North Edsa",
        reportedByName: "Bianca Reyes",
        ownerName: "Alyssa Tan",
        sourceIncidentId: "24000000-0000-4000-8000-000000000001",
        downtimeMinutes: 45,
        targetDueAt: "2026-07-03",
        completedAt: null,
        correctiveAction: null,
        evidenceReference: "grill-photo-4"
      },
      {
        id: "ticket-2",
        ticketNumber: "MT-002",
        requestedAt: "2026-07-04",
        category: "FACILITY",
        assetName: "Dining exhaust fan",
        assetArea: "Dining",
        priority: "HIGH",
        status: "COMPLETED",
        title: "Noisy exhaust fan",
        description: "Fan vibration near counter seats",
        locationName: "SM Mall of Asia",
        reportedByName: "Paolo Cruz",
        ownerName: "Marco Santos",
        sourceIncidentId: "24000000-0000-4000-8000-000000000002",
        downtimeMinutes: 20,
        targetDueAt: "2026-07-04",
        completedAt: "2026-07-04",
        correctiveAction: "Vendor tightened loose bracket",
        evidenceReference: "vendor-report-44"
      },
      {
        id: "ticket-3",
        ticketNumber: "MT-003",
        requestedAt: "2026-07-05",
        category: "OTHER",
        assetName: "Duplicate asset",
        assetArea: "Back Office",
        priority: "LOW",
        status: "CANCELLED",
        title: "Duplicate ticket",
        description: "Duplicate maintenance ticket was cancelled",
        locationName: "SM North Edsa",
        reportedByName: "Lia Mendoza",
        ownerName: "Nico Valdez",
        sourceIncidentId: null,
        downtimeMinutes: 0,
        targetDueAt: null,
        completedAt: null,
        correctiveAction: "Duplicate record cancelled.",
        evidenceReference: null
      }
    ];

    expect(
      filterMaintenanceTickets(tickets, { q: "alyssa" }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1"]);
    expect(
      filterMaintenanceTickets(tickets, { q: "exhaust" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-2"]);
    expect(
      filterMaintenanceTickets(tickets, { q: "24000000-0000" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-1", "ticket-2"]);
    expect(
      filterMaintenanceTickets(tickets, {
        requestedAt: "2026-07-03",
        priority: "CRITICAL",
        status: "OPEN"
      }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1"]);
    expect(
      filterMaintenanceTickets(tickets, { status: "CANCELLED" }).map(
        (ticket) => ticket.id
      )
    ).toEqual(["ticket-3"]);
    expect(
      filterMaintenanceTickets(tickets, {
        requestedAt: "2026-07-03",
        priority: "HIGH",
        status: "OPEN"
      })
    ).toEqual([]);
    expect(
      filterMaintenanceTickets(tickets, {
        q: "",
        priority: "ALL",
        status: "ALL"
      }).map((ticket) => ticket.id)
    ).toEqual(["ticket-1", "ticket-2", "ticket-3"]);
  });
});
