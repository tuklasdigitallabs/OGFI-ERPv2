import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  cancelOperationalIncident,
  correctOperationalIncident,
  createOperationalIncident,
  filterIncidents,
  getOperationalIncidentSummary,
  listIncidentMyTaskPage,
  resolveOperationalIncident,
  type OperationalIncidentSummary
} from "./incidents";

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  operationalIncident: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn()
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

describe("Incident My Tasks adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.operationalIncident.count.mockResolvedValue(1);
    mockPrisma.operationalIncident.findMany.mockImplementation(({ where }) =>
      where.severity === "CRITICAL"
        ? Promise.resolve([{
            id: "00000000-0000-4000-8000-000000000701",
            incidentNumber: "INC-2026-0001",
            status: "OPEN",
            severity: "CRITICAL",
            dueAt: new Date("2026-07-23T00:00:00.000Z"),
            createdAt: new Date("2026-07-20T00:00:00.000Z")
          }])
        : Promise.resolve([])
    );
  });

  it("returns one bounded role-pooled resolution stream with exact eligibility", async () => {
    const actor = { ...session, permissionCodes: [permissions.incidentResolve] };
    await expect(listIncidentMyTaskPage(actor as never, { take: 2 })).resolves.toMatchObject({
      totalCount: 1,
      items: [{
        publicReference: "INC-2026-0001",
        priority: "CRITICAL",
        actionLabel: "Resolve incident"
      }]
    });
    const baseWhere = mockPrisma.operationalIncident.count.mock.calls[0]![0].where;
    expect(baseWhere).toMatchObject({
      tenantId: actor.context.tenantId,
      companyId: actor.context.companyId,
      brandId: actor.context.brandId,
      locationId: actor.context.locationId,
      status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"] },
      resolvedAt: null,
      OR: [
        { severity: { in: ["MEDIUM", "LOW"] } },
        expect.objectContaining({
          severity: { in: ["CRITICAL", "HIGH"] },
          reportedByUserId: { not: null },
          NOT: { reportedByUserId: actor.user.id }
        })
      ]
    });
    expect(mockPrisma.operationalIncident.findMany).toHaveBeenCalledTimes(4);
    for (const [query] of mockPrisma.operationalIncident.findMany.mock.calls) {
      expect(query.where).toMatchObject(baseWhere);
      expect(query.take).toBe(3);
      expect(query.select).toEqual({
        id: true,
        incidentNumber: true,
        status: true,
        severity: true,
        dueAt: true,
        createdAt: true
      });
    }
  });

  it("does not query incidents without resolution authority", async () => {
    await expect(
      listIncidentMyTaskPage({ ...session, permissionCodes: [permissions.incidentView] } as never)
    ).resolves.toEqual({ totalCount: 0, items: [], nextCursor: null });
    expect(mockPrisma.operationalIncident.count).not.toHaveBeenCalled();
    expect(mockPrisma.operationalIncident.findMany).not.toHaveBeenCalled();
  });

  it("continues the matching severity and due-date stream after a v2 anchor", async () => {
    const actor = { ...session, permissionCodes: [permissions.incidentResolve] };
    const after = {
      priority: "CRITICAL" as const,
      dueAt: "2026-07-23T00:00:00.000Z",
      createdAt: "2026-07-20T00:00:00.000Z",
      sourceType: "INCIDENT" as const,
      recordId: "00000000-0000-4000-8000-000000000700"
    };
    await listIncidentMyTaskPage(actor as never, { after, take: 1 });
    const criticalQuery = mockPrisma.operationalIncident.findMany.mock.calls
      .map(([query]) => query)
      .find((query) => query.where.severity === "CRITICAL");
    expect(criticalQuery.where.AND).toEqual([
      {
        OR: [
          { dueAt: null },
          { dueAt: { gt: new Date(after.dueAt) } },
          {
            dueAt: new Date(after.dueAt),
            AND: [{
              OR: [
                { createdAt: { gt: new Date(after.createdAt) } },
                { createdAt: new Date(after.createdAt), id: { gt: after.recordId } }
              ]
            }]
          }
        ]
      }
    ]);
  });
});

const serviceSource = readFileSync(new URL("./incidents.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(
  path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
  "utf8"
);
const migrationSource = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20260703133000_phase2_operational_incidents/migration.sql"
  ),
  "utf8"
);
const detailPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/incidents/[id]/page.tsx"),
  "utf8"
);
const listPageSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/incidents/page.tsx"),
  "utf8"
);
const exportRouteSource = readFileSync(
  path.resolve(__dirname, "../../app/(app)/incidents/export/route.ts"),
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
  permissionCodes: [permissions.incidentCreate, permissions.branchOperationsView]
};

function incidentFormWithInvalidDueDate() {
  const form = new FormData();
  form.set("incidentDate", "2026-07-03");
  form.set("dueAt", "2026-07-02");
  form.set("category", "SERVICE");
  form.set("severity", "HIGH");
  form.set("title", "Guest complaint escalation");
  form.set("summary", "Guest waited too long for table grill changeover.");
  form.set("correctiveAction", "Shift lead to review service station handoff.");
  form.set("evidenceReference", "GUEST-NOTE-17");
  return form;
}

function validIncidentForm() {
  const form = new FormData();
  form.set("incidentDate", "2026-07-03");
  form.set("dueAt", "2026-07-04");
  form.set("category", "SERVICE");
  form.set("severity", "HIGH");
  form.set("title", "Guest complaint escalation");
  form.set("summary", "Guest waited too long for table grill changeover.");
  form.set("correctiveAction", "Shift lead to review service station handoff.");
  form.set("evidenceReference", "GUEST-NOTE-17");
  form.set("sourceRecordType", "BranchOperationalChecklist");
  form.set("sourceRecordId", "00000000-0000-4000-8000-000000000301");
  return form;
}

function incidentFormWithSourceTypeOnly() {
  const form = validIncidentForm();
  form.delete("sourceRecordId");
  return form;
}

function incidentFormWithSourceIdOnly() {
  const form = validIncidentForm();
  form.delete("sourceRecordType");
  return form;
}

function resolveIncidentForm() {
  const form = new FormData();
  form.set("incidentId", "00000000-0000-4000-8000-000000000701");
  form.set("resolvedAt", "2026-07-04");
  form.set("correctiveAction", "Manager coached the team and verified station handoff.");
  form.set("evidenceReference", "INC-RESOLUTION-17");
  return form;
}

function cancelIncidentForm() {
  const form = new FormData();
  form.set("incidentId", "00000000-0000-4000-8000-000000000701");
  form.set("cancelReason", "Duplicate incident logged during shift handover.");
  return form;
}

function correctIncidentForm() {
  const form = new FormData();
  form.set("incidentId", "00000000-0000-4000-8000-000000000701");
  form.set("incidentDate", "2026-07-05");
  form.set("dueAt", "2026-07-06");
  form.set("category", "SERVICE");
  form.set("severity", "CRITICAL");
  form.set("title", "Guest complaint corrected");
  form.set("summary", "Corrected incident details after manager review.");
  form.set("correctiveAction", "Assign shift lead to verify table handoff checklist.");
  form.set("evidenceReference", "INC-CORRECTED-17");
  form.set("correctionReason", "Original incident details used the wrong severity.");
  form.set("correctionEvidenceReference", "INC-CORRECTION-EVIDENCE-17");
  return form;
}

describe("Phase 2 incident management foundation", () => {
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
                code: permissions.incidentCreate
              }
            }
          ]
        }
      }
    ]);
    mockPrisma.operationalIncident.count.mockResolvedValue(12);
  });

  it("rejects incident due dates before the incident date before writing", async () => {
    await expect(
      createOperationalIncident(incidentFormWithInvalidDueDate())
    ).rejects.toThrow("INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE");

    expect(mockContext.assertAuthorizedLocation).toHaveBeenCalledWith(
      session,
      session.context.locationId
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires incident source links to include both supported type and ID", async () => {
    await expect(
      createOperationalIncident(incidentFormWithSourceTypeOnly())
    ).rejects.toThrow("INCIDENT_SOURCE_LINK_INCOMPLETE");
    await expect(
      createOperationalIncident(incidentFormWithSourceIdOnly())
    ).rejects.toThrow("INCIDENT_SOURCE_LINK_INCOMPLETE");

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects incident source links that are missing or outside scope", async () => {
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      operationalIncident: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );

    await expect(createOperationalIncident(validIncidentForm())).rejects.toThrow(
      "INCIDENT_SOURCE_RECORD_NOT_FOUND_OR_UNSCOPED"
    );

    expect(tx.branchOperationalChecklist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000301",
          locationId: session.context.locationId
        })
      })
    );
    expect(tx.operationalIncident.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("requires permission to view the linked incident source record type", async () => {
    const tx = {
      branchOperationalChecklist: {
        findFirst: vi.fn()
      }
    };
    mockPrisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(tx)
    );
    mockContext.requireSessionContext.mockResolvedValueOnce({
      ...session,
      permissionCodes: [permissions.incidentCreate]
    });

    await expect(createOperationalIncident(validIncidentForm())).rejects.toThrow(
      "PERMISSION_DENIED"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(tx.branchOperationalChecklist.findFirst).not.toHaveBeenCalled();
  });

  it("retries incident creation after document-number collision", async () => {
    const firstTx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-checklist" })
      },
      operationalIncident: {
        create: vi.fn().mockRejectedValue({ code: "P2002" })
      },
      auditEvent: {
        create: vi.fn()
      }
    };
    const secondTx = {
      branchOperationalChecklist: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-checklist" })
      },
      operationalIncident: {
        create: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000501",
          incidentNumber: "INC-2026-00013",
          status: "OPEN",
          severity: "HIGH",
          category: "SERVICE"
        })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({})
      },
      operationalStatusTransition: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    mockPrisma.$transaction
      .mockImplementationOnce(async (callback) => callback(firstTx))
      .mockImplementationOnce(async (callback) => callback(secondTx));

    await expect(createOperationalIncident(validIncidentForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000501"
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(firstTx.branchOperationalChecklist.findFirst).toHaveBeenCalled();
    expect(secondTx.branchOperationalChecklist.findFirst).toHaveBeenCalled();
    expect(firstTx.auditEvent.create).not.toHaveBeenCalled();
    expect(secondTx.operationalIncident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incidentNumber: "INC-2026-00013",
          status: "OPEN",
          reportedByUserId: session.user.id,
          ownerUserId: session.user.id,
          sourceRecordType: "BranchOperationalChecklist",
          sourceRecordId: "00000000-0000-4000-8000-000000000301"
        })
      })
    );
    expect(secondTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "operational_incident.created",
          entityId: "00000000-0000-4000-8000-000000000501",
          metadata: expect.objectContaining({
            sourceRecordType: "BranchOperationalChecklist",
            sourceRecordId: "00000000-0000-4000-8000-000000000301",
            evidenceReference: "GUEST-NOTE-17",
            boundary: "incident_create_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("resolves an incident with optimistic status update and audit history", async () => {
    const resolveSession = {
      ...session,
      permissionCodes: [permissions.incidentResolve]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(resolveSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.incidentResolve
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          incidentDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          resolvedAt: null,
          correctiveAction: "Initial action pending.",
          evidenceReference: "INC-OPEN-17"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          locationId: session.context.locationId,
          sourceRecordType: "BranchOperationalChecklist",
          sourceRecordId: "00000000-0000-4000-8000-000000000301",
          status: "RESOLVED",
          resolvedAt: new Date("2026-07-04T00:00:00.000Z"),
          correctiveAction: "Manager coached the team and verified station handoff.",
          evidenceReference: "INC-RESOLUTION-17"
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

    await expect(resolveOperationalIncident(resolveIncidentForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000701"
    );

    expect(tx.operationalIncident.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000701",
          resolvedAt: null
        }),
        data: expect.objectContaining({
          status: "RESOLVED",
          ownerUserId: session.user.id,
          evidenceReference: "INC-RESOLUTION-17"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "operational_incident.resolved",
          entityId: "00000000-0000-4000-8000-000000000701",
          metadata: expect.objectContaining({
            sourceRecordType: "BranchOperationalChecklist",
            sourceRecordId: "00000000-0000-4000-8000-000000000301",
            boundary: "incident_resolution_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("cancels an incident with reason, audit history, and source boundaries", async () => {
    const cancelSession = {
      ...session,
      permissionCodes: [permissions.incidentResolve]
    };
    mockContext.requireSessionContext.mockResolvedValueOnce(cancelSession);
    mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
      {
        role: {
          permissions: [
            {
              permission: {
                tenantId: session.context.tenantId,
                code: permissions.incidentResolve
              }
            }
          ]
        }
      }
    ]);
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          incidentDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "OPEN",
          resolvedAt: null,
          correctiveAction: "Initial action pending.",
          evidenceReference: "INC-OPEN-17"
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          locationId: session.context.locationId,
          sourceRecordType: "BranchOperationalChecklist",
          sourceRecordId: "00000000-0000-4000-8000-000000000301",
          status: "CANCELLED",
          resolvedAt: null,
          correctiveAction: "Duplicate incident logged during shift handover.",
          evidenceReference: "INC-OPEN-17"
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

    await expect(cancelOperationalIncident(cancelIncidentForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000701"
    );

    expect(tx.operationalIncident.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000701",
          resolvedAt: null
        }),
        data: expect.objectContaining({
          status: "CANCELLED",
          ownerUserId: session.user.id,
          correctiveAction: "Duplicate incident logged during shift handover."
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "operational_incident.cancelled",
          entityId: "00000000-0000-4000-8000-000000000701",
          metadata: expect.objectContaining({
            sourceRecordType: "BranchOperationalChecklist",
            sourceRecordId: "00000000-0000-4000-8000-000000000301",
            reason: "Duplicate incident logged during shift handover.",
            boundary: "incident_cancellation_only_no_source_mutation"
          })
        })
      })
    );
  });

  it("corrects non-terminal incident details with correction, audit, and transition history", async () => {
    const currentIncident = {
      id: "00000000-0000-4000-8000-000000000701",
      brandId: session.context.brandId,
      locationId: session.context.locationId,
      incidentDate: new Date("2026-07-03T00:00:00.000Z"),
      category: "SERVICE",
      severity: "HIGH",
      status: "OPEN",
      title: "Guest complaint escalation",
      summary: "Guest waited too long for table grill changeover.",
      correctiveAction: "Initial action pending.",
      evidenceReference: "INC-OPEN-17",
      dueAt: new Date("2026-07-04T00:00:00.000Z"),
      resolvedAt: null,
      sourceRecordType: "BranchOperationalChecklist",
      sourceRecordId: "00000000-0000-4000-8000-000000000301"
    };
    const updatedIncident = {
      ...currentIncident,
      incidentDate: new Date("2026-07-05T00:00:00.000Z"),
      severity: "CRITICAL",
      title: "Guest complaint corrected",
      summary: "Corrected incident details after manager review.",
      correctiveAction: "Assign shift lead to verify table handoff checklist.",
      evidenceReference: "INC-CORRECTED-17",
      dueAt: new Date("2026-07-06T00:00:00.000Z")
    };
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue(currentIncident),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedIncident)
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

    await expect(correctOperationalIncident(correctIncidentForm())).resolves.toBe(
      "00000000-0000-4000-8000-000000000701"
    );

    expect(tx.operationalIncident.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: currentIncident.id,
          status: { in: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"] },
          resolvedAt: null
        }),
        data: expect.objectContaining({
          incidentDate: new Date("2026-07-05T00:00:00.000Z"),
          severity: "CRITICAL",
          title: "Guest complaint corrected",
          ownerUserId: session.user.id
        })
      })
    );
    expect(tx.operationalCorrectionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "OperationalIncident",
          targetEntityId: currentIncident.id,
          correctionType: "DETAIL_CORRECTION",
          status: "APPLIED",
          requestedByUserId: session.user.id,
          appliedByUserId: session.user.id,
          reason: "Original incident details used the wrong severity.",
          evidenceReference: "INC-CORRECTION-EVIDENCE-17"
        })
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "operational_incident.corrected",
          beforeData: expect.objectContaining({
            severity: "HIGH",
            title: "Guest complaint escalation"
          }),
          afterData: expect.objectContaining({
            severity: "CRITICAL",
            title: "Guest complaint corrected"
          }),
          metadata: expect.objectContaining({
            reason: "Original incident details used the wrong severity.",
            evidenceReference: "INC-CORRECTION-EVIDENCE-17",
            boundary: "incident_detail_correction_no_source_mutation"
          })
        })
      })
    );
    expect(tx.operationalStatusTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEntityType: "OperationalIncident",
          targetEntityId: currentIncident.id,
          action: "DETAIL_CORRECTION",
          fromStatus: "OPEN",
          toStatus: "OPEN",
          reason: "Original incident details used the wrong severity.",
          evidenceReference: "INC-CORRECTION-EVIDENCE-17"
        })
      })
    );
  });

  it("blocks incident corrections for terminal statuses before mutation", async () => {
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          status: "RESOLVED"
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

    await expect(correctOperationalIncident(correctIncidentForm())).rejects.toThrow(
      "INCIDENT_STATUS_NOT_CORRECTABLE"
    );

    expect(tx.operationalIncident.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects stale incident correction attempts without audit writes", async () => {
    const tx = {
      operationalIncident: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000701",
          brandId: session.context.brandId,
          locationId: session.context.locationId,
          incidentDate: new Date("2026-07-03T00:00:00.000Z"),
          category: "SERVICE",
          severity: "HIGH",
          status: "OPEN",
          title: "Guest complaint escalation",
          summary: "Guest waited too long for table grill changeover.",
          correctiveAction: "Initial action pending.",
          evidenceReference: "INC-OPEN-17",
          dueAt: new Date("2026-07-04T00:00:00.000Z"),
          resolvedAt: null
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

    await expect(correctOperationalIncident(correctIncidentForm())).rejects.toThrow(
      "INCIDENT_CORRECTION_CONFLICT"
    );

    expect(tx.operationalCorrectionRecord.create).not.toHaveBeenCalled();
    expect(tx.operationalStatusTransition.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("adds scoped operational incident records", () => {
    expect(schemaSource).toContain("model OperationalIncident");
    expect(schemaSource).toContain("operationalIncidents");
    expect(migrationSource).toContain(
      "OperationalIncident_companyId_incidentNumber_key"
    );
    expect(migrationSource).toContain(
      "OperationalIncident_sourceRecordType_sourceRecordId_idx"
    );
  });

  it("keeps incidents controlled and separate from controlled source records", () => {
    expect(serviceSource).toContain("getIncidentDashboard");
    expect(serviceSource).toContain("getIncidentDashboardRead");
    expect(serviceSource).toContain("followUpCandidates");
    expect(serviceSource).toContain("take: 3");
    expect(serviceSource).toContain('by: ["status"]');
    expect(serviceSource).toContain("getOperationalIncidentSummary");
    expect(serviceSource).toContain("buildIncidentExportRows");
    expect(serviceSource).toContain("filterIncidents");
    expect(serviceSource).toContain("filters.incidentDate");
    expect(serviceSource).toContain("prisma.user.findMany");
    expect(serviceSource).toContain("reportedByName");
    expect(serviceSource).toContain("ownerName");
    expect(serviceSource).toContain("dateOnlyInTimeZone(new Date())");
    expect(serviceSource).toContain("dateOrNull(incident.dueAt)! < todayDate");
    expect(serviceSource).toContain("statusCounts");
    expect(serviceSource).toContain("severityCounts");
    expect(serviceSource).toContain("Open Count");
    expect(serviceSource).toContain("Critical Count");
    expect(serviceSource).toContain("createOperationalIncident");
    expect(serviceSource).toContain("incidentSourceRecordTypes");
    expect(serviceSource).toContain("INCIDENT_SOURCE_LINK_INCOMPLETE");
    expect(serviceSource).toContain("assertIncidentSourceRecordVisible");
    expect(serviceSource).toContain("INCIDENT_SOURCE_RECORD_NOT_FOUND_OR_UNSCOPED");
    expect(serviceSource).toContain("const sourceRecordId = values.sourceRecordId || null");
    expect(serviceSource).toContain("requirePermission(session, permissions.incidentCreate)");
    expect(serviceSource).toContain("assertAuthorizedLocation(session, session.context.locationId)");
    expect(serviceSource).toContain("INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE");
    expect(serviceSource).toContain("dueAt && dueAt < incidentDate");
    expect(serviceSource).toContain("operational_incident.created");
    expect(serviceSource).toContain("recordOperationalStatusTransition");
    expect(serviceSource).toContain('targetEntityType: "OperationalIncident"');
    expect(serviceSource).toContain('action: "CREATE_OPEN"');
    expect(serviceSource).toContain('action: "RESOLVE"');
    expect(serviceSource).toContain('action: "CANCEL"');
    expect(serviceSource).toContain("resolveOperationalIncident");
    expect(serviceSource).toContain("requirePermission(session, permissions.incidentResolve)");
    expect(serviceSource).toContain("resolvableIncidentStatuses");
    expect(serviceSource).toContain("INCIDENT_RESOLVED_AT_BEFORE_INCIDENT_DATE");
    expect(serviceSource).toContain("INCIDENT_RESOLUTION_CONFLICT");
    expect(serviceSource).toContain("operational_incident.resolved");
    expect(serviceSource).toContain("incident_resolution_only_no_source_mutation");
    expect(serviceSource).toContain("cancelOperationalIncident");
    expect(serviceSource).toContain("INCIDENT_STATUS_NOT_CANCELLABLE");
    expect(serviceSource).toContain("INCIDENT_CANCELLATION_CONFLICT");
    expect(serviceSource).toContain("operational_incident.cancelled");
    expect(serviceSource).toContain("incident_cancellation_only_no_source_mutation");
    expect(serviceSource).toContain("correctOperationalIncident");
    expect(serviceSource).toContain("correctOperationalIncidentSchema");
    expect(serviceSource).toContain("correctableIncidentStatuses");
    expect(serviceSource).toContain("requirePermission(session, permissions.incidentCreate)");
    expect(serviceSource).toContain("INCIDENT_STATUS_NOT_CORRECTABLE");
    expect(serviceSource).toContain("INCIDENT_CORRECTION_CONFLICT");
    expect(serviceSource).toContain("operational_incident.corrected");
    expect(serviceSource).toContain("operationalCorrectionRecord");
    expect(serviceSource).toContain('targetEntityType: "OperationalIncident"');
    expect(serviceSource).toContain('correctionType: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain('action: "DETAIL_CORRECTION"');
    expect(serviceSource).toContain("incident_detail_correction_no_source_mutation");
    expect(serviceSource).toContain("tx.operationalIncident.updateMany");
    expect(serviceSource).toContain("canUseIncidents");
    expect(serviceSource).toContain("prisma.operationalIncident.findMany");
    expect(serviceSource).toContain("locationId: session.context.locationId");
    expect(serviceSource).not.toContain("inventoryMovement.create");
    expect(serviceSource).not.toContain("foodSafetyLog.update");
    expect(serviceSource).not.toContain("approvalInstance.create");
    expect(serviceSource).not.toContain("maintenanceTicket.update");
    expect(serviceSource).not.toContain("maintenanceTicket.create");
  });

  it("provides a scoped incident detail view with controlled resolution", () => {
    expect(detailPageSource).toContain("getOperationalIncidentSummary(session, id)");
    expect(detailPageSource).toContain("this detail view tracks the");
    expect(detailPageSource).toContain("notFound()");
    expect(detailPageSource).toContain("resolveOperationalIncidentAction");
    expect(detailPageSource).toContain("cancelOperationalIncidentAction");
    expect(detailPageSource).toContain("correctOperationalIncidentAction");
    expect(detailPageSource).toContain("correctOperationalIncident");
    expect(detailPageSource).toContain("permissions.incidentResolve");
    expect(detailPageSource).toContain("permissions.incidentCreate");
    expect(detailPageSource).toContain("<EntryModal title=\"Resolve Incident\"");
    expect(detailPageSource).toContain("<EntryModal title=\"Cancel Incident\"");
    expect(detailPageSource).toContain("<TaskSheet");
    expect(detailPageSource).toContain('title="Correct Incident Details"');
    expect(detailPageSource).toContain("Save Incident Correction");
    expect(detailPageSource).toContain('name="resolvedAt"');
    expect(detailPageSource).toContain('name="cancelReason"');
    expect(detailPageSource).toContain('name="correctiveAction"');
    expect(detailPageSource).toContain('name="evidenceReference"');
    expect(detailPageSource).toContain('name="correctionReason"');
    expect(detailPageSource).toContain('name="correctionEvidenceReference"');
    expect(detailPageSource).toContain("incident.reportedByName");
    expect(detailPageSource).toContain("incident.ownerName");
    expect(detailPageSource).toContain("incident.sourceRecordId");
    expect(detailPageSource).toContain('status === "PENDING_REVIEW"');
    expect(detailPageSource).toContain('status === "RESOLVED" || status === "CANCELLED"');
    expect(detailPageSource).toContain("sourceRecordHref");
    expect(detailPageSource).toContain("/branch-operations/${sourceRecordId}");
    expect(detailPageSource).toContain("Source record (read-only reference)");
    expect(detailPageSource).toContain("Open Source Record");
    expect(detailPageSource).toContain("Source link unavailable");
    expect(detailPageSource).not.toContain("inventoryMovement.create");
  });

  it("provides incident queue search and filters without mutating source records", () => {
    expect(listPageSource).toContain("searchParams");
    expect(listPageSource).toContain('name="q"');
    expect(listPageSource).toContain('name="incidentDate"');
    expect(listPageSource).toContain('name="status"');
    expect(listPageSource).toContain('name="severity"');
    expect(listPageSource).toContain("workspace");
    expect(listPageSource).toContain("PAGE_SIZE = 25");
    expect(listPageSource).toContain("normalizePage");
    expect(listPageSource).toContain("paginatedIncidents");
    expect(listPageSource).toContain("pageHref");
    expect(listPageSource).toContain("workspace.page");
    expect(listPageSource).toContain("Page {workspace.page} of {workspace.totalPages}");
    expect(listPageSource).toContain("listIncidentPage");
    expect(listPageSource).toContain("incident.ownerName");
    expect(listPageSource).toContain("buildQueryHref(\"/incidents/export\"");
    expect(exportRouteSource).toContain("getStrictDateSearchParam");
    expect(exportRouteSource).toContain('"incidentDate"');
    expect(exportRouteSource).toContain("INCIDENT_FILTER_DATE_INVALID");
    expect(serviceSource).toContain('"Reported By"');
    expect(serviceSource).toContain('"Owner"');
    expect(serviceSource).toContain('"Source Record ID"');
    expect(serviceSource).toContain('"Cancelled Count"');
    expect(listPageSource).toContain('"CANCELLED"');
    expect(listPageSource).not.toContain('"CLOSED"');
    expect(listPageSource).toContain('status === "PENDING_REVIEW"');
    expect(listPageSource).toContain('status === "RESOLVED" || status === "CANCELLED"');
    expect(listPageSource).toContain("sourceRecordHref");
    expect(listPageSource).toContain("/branch-operations/${sourceRecordId}");
    expect(listPageSource).toContain("Source");
    expect(listPageSource).toContain("Unavailable");
    expect(listPageSource).toContain("<TaskSheet");
    expect(listPageSource).toContain('title="Log Incident"');
    expect(listPageSource).toContain("createIncidentAction");
    expect(listPageSource).toContain("permissions.incidentCreate");
    expect(listPageSource).toContain('name="incidentDate"');
    expect(listPageSource).toContain('name="sourceRecordType"');
    expect(listPageSource).toContain('name="sourceRecordId"');
    expect(listPageSource).toContain('name="category"');
    expect(listPageSource).toContain('name="correctiveAction"');
    expect(listPageSource).toContain("No incidents match the filters");
    expect(listPageSource).toContain("getIncidentDashboardRead(session)");
    expect(listPageSource).not.toContain("operationalIncident.update");
  });

  it("filters incidents by actors, source context, and combined queue facets", () => {
    const incidents: OperationalIncidentSummary[] = [
      {
        id: "incident-1",
        incidentNumber: "INC-001",
        incidentDate: "2026-07-03",
        category: "SERVICE",
        severity: "CRITICAL",
        status: "OPEN",
        title: "Guest complaint escalation",
        summary: "Guest waited too long for Karubi set",
        locationName: "SM North Edsa",
        reportedByName: "Bianca Reyes",
        ownerName: "Alyssa Tan",
        sourceRecordType: "BranchOperationalChecklist",
        sourceRecordId: "22000000-0000-4000-8000-000000000001",
        correctiveAction: null,
        evidenceReference: "complaint-form-17",
        dueAt: null,
        resolvedAt: null
      },
      {
        id: "incident-2",
        incidentNumber: "INC-002",
        incidentDate: "2026-07-04",
        category: "EQUIPMENT",
        severity: "HIGH",
        status: "RESOLVED",
        title: "Exhaust fan issue",
        summary: "Dining exhaust fan was noisy",
        locationName: "SM Mall of Asia",
        reportedByName: "Paolo Cruz",
        ownerName: "Marco Santos",
        sourceRecordType: "MaintenanceTicket",
        sourceRecordId: "25000000-0000-4000-8000-000000000001",
        correctiveAction: "Vendor tightened loose bracket",
        evidenceReference: "vendor-report-44",
        dueAt: "2026-07-05",
        resolvedAt: "2026-07-04"
      },
      {
        id: "incident-3",
        incidentNumber: "INC-003",
        incidentDate: "2026-07-05",
        category: "OTHER",
        severity: "LOW",
        status: "CANCELLED",
        title: "Duplicate report",
        summary: "Duplicate incident report was cancelled",
        locationName: "SM North Edsa",
        reportedByName: "Lia Mendoza",
        ownerName: "Nico Valdez",
        sourceRecordType: null,
        sourceRecordId: null,
        correctiveAction: "Duplicate record cancelled.",
        evidenceReference: null,
        dueAt: null,
        resolvedAt: null
      }
    ];

    expect(filterIncidents(incidents, { q: "alyssa" }).map((incident) => incident.id))
      .toEqual(["incident-1"]);
    expect(
      filterIncidents(incidents, { q: "maintenance" }).map(
        (incident) => incident.id
      )
    ).toEqual(["incident-2"]);
    expect(
      filterIncidents(incidents, { q: "25000000-0000" }).map(
        (incident) => incident.id
      )
    ).toEqual(["incident-2"]);
    expect(
      filterIncidents(incidents, {
        incidentDate: "2026-07-03",
        severity: "CRITICAL",
        status: "OPEN"
      }).map((incident) => incident.id)
    ).toEqual(["incident-1"]);
    expect(
      filterIncidents(incidents, { status: "CANCELLED" }).map(
        (incident) => incident.id
      )
    ).toEqual(["incident-3"]);
    expect(
      filterIncidents(incidents, {
        incidentDate: "2026-07-03",
        severity: "HIGH",
        status: "OPEN"
      })
    ).toEqual([]);
    expect(
      filterIncidents(incidents, {
        q: "",
        severity: "ALL",
        status: "ALL"
      }).map((incident) => incident.id)
    ).toEqual(["incident-1", "incident-2", "incident-3"]);
  });
});

describe("Incident independent-review lineage", () => {
  it("fails high-risk resolve and cancel closed when reporter lineage is missing", async () => {
    for (const [action, form] of [
      [resolveOperationalIncident, resolveIncidentForm],
      [cancelOperationalIncident, cancelIncidentForm]
    ] as const) {
      vi.clearAllMocks();
      mockContext.requireSessionContext.mockResolvedValueOnce({
        ...session,
        permissionCodes: [permissions.incidentResolve]
      });
      mockPrisma.userRoleAssignment.findMany.mockResolvedValueOnce([
        { role: { permissions: [{ permission: { tenantId: session.context.tenantId, code: permissions.incidentResolve } }] } }
      ]);
      const tx = {
        operationalIncident: {
          findFirst: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000701",
            incidentDate: new Date("2026-07-03T00:00:00.000Z"),
            status: "OPEN",
            severity: "CRITICAL",
            reportedByUserId: null,
            resolvedAt: null
          }),
          updateMany: vi.fn()
        }
      };
      mockPrisma.$transaction.mockImplementationOnce(async (callback) => callback(tx));
      await expect(action(form())).rejects.toThrow("INCIDENT_INDEPENDENT_REVIEW_REQUIRED");
      expect(tx.operationalIncident.updateMany).not.toHaveBeenCalled();
    }
  });
});

describe("Incident detail scope", () => {
  it("requires the exact null-aware brand and location before loading detail", async () => {
    vi.clearAllMocks();
    mockPrisma.operationalIncident.findFirst.mockResolvedValueOnce(null);
    const nullBrandSession = {
      ...session,
      context: { ...session.context, brandId: null, brandName: "All Brands" }
    };
    await expect(
      getOperationalIncidentSummary(nullBrandSession as never, "00000000-0000-4000-8000-000000000701")
    ).resolves.toBeNull();
    expect(mockPrisma.operationalIncident.findFirst).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000701",
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: null,
        locationId: session.context.locationId
      },
      select: { id: true }
    });
    expect(mockPrisma.operationalIncident.findMany).not.toHaveBeenCalled();
  });
});
