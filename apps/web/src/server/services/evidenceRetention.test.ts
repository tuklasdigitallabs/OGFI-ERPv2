import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissions } from "./authorization";
import {
  isSameEvidenceLegalHold,
  listEvidenceRetentionRegisterForSession,
  setEvidenceLegalHoldForSession,
  setEvidenceLegalHoldSchema,
} from "./evidenceRetention";

const mocks = vi.hoisted(() => ({
  attachmentFindFirst: vi.fn(),
  attachmentCount: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentUpdateMany: vi.fn(),
  transactionAttachmentFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  mfaGuard: vi.fn(),
  requirePermission: vi.fn(),
  requireActiveScopeAssignment: vi.fn(),
}));

const transactionClient = vi.hoisted(() => ({
  attachment: {
    updateMany: mocks.attachmentUpdateMany,
    findFirst: mocks.transactionAttachmentFindFirst,
  },
  auditEvent: { create: mocks.auditCreate },
}));

vi.mock("@ogfi/database", () => ({
  prisma: {
    attachment: {
      findFirst: mocks.attachmentFindFirst,
      count: mocks.attachmentCount,
      findMany: mocks.attachmentFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./authorization", async () => {
  const actual = await vi.importActual<typeof import("./authorization")>(
    "./authorization",
  );
  return {
    ...actual,
    requirePermission: mocks.requirePermission,
    requireActiveScopeAssignment: mocks.requireActiveScopeAssignment,
  };
});

vi.mock("./privilegedMfaGuard", () => ({
  assertPrivilegedMfaForAction: mocks.mfaGuard,
}));

const session = {
  user: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "records.admin@example.test",
    displayName: "Records Administrator",
    role: "CONFIGURED_ADMIN",
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "One Gourmet Foods Inc.",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "Yakiniku Like",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "SM North Edsa",
    locationType: "BRANCH" as const,
  },
  authorizedLocations: [],
  permissionCodes: [permissions.evidenceLegalHoldSet],
};

const attachmentId = "00000000-0000-4000-8000-000000000201";
const holdInput = {
  attachmentId,
  expectedRowVersion: 4,
  authority: "Office of General Counsel",
  caseReference: "CASE-2026-071",
  reason: "Preserve evidence while the internal investigation remains open.",
};

function unheldAttachment() {
  return {
    id: attachmentId,
    legalHold: false,
    legalHoldSetAt: null,
    legalHoldSetByUserId: null,
    legalHoldAuthority: null,
    legalHoldCaseReference: null,
    legalHoldReason: null,
    physicalState: "DURABLE",
    purgedAt: null,
    rowVersion: 4,
  };
}

function heldAttachment() {
  return {
    ...unheldAttachment(),
    legalHold: true,
    legalHoldSetAt: new Date("2026-07-21T10:00:00.000Z"),
    legalHoldSetByUserId: session.user.id,
    legalHoldAuthority: holdInput.authority,
    legalHoldCaseReference: holdInput.caseReference,
    legalHoldReason: holdInput.reason,
    rowVersion: 5,
  };
}

describe("evidence legal-hold preservation controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.requireActiveScopeAssignment.mockResolvedValue(undefined);
    mocks.mfaGuard.mockResolvedValue({ required: true, mode: "runtime_mfa" });
    mocks.transaction.mockImplementation(async (work: unknown) => {
      if (typeof work === "function") {
        return work(transactionClient);
      }
      return Promise.all(work as Promise<unknown>[]);
    });
  });

  it("requires complete authority, case, reason, and optimistic version input", () => {
    expect(
      setEvidenceLegalHoldSchema.safeParse({
        ...holdInput,
        authority: " ",
        caseReference: " ",
        reason: " ",
      }).success,
    ).toBe(false);
  });

  it("recognizes only an exact existing hold as an idempotent replay", () => {
    expect(isSameEvidenceLegalHold(heldAttachment(), holdInput)).toBe(true);
    expect(
      isSameEvidenceLegalHold(heldAttachment(), {
        ...holdInput,
        caseReference: "CASE-OTHER",
      }),
    ).toBe(false);
  });

  it("places a company-scoped hold with MFA, CAS, and one before/after audit", async () => {
    mocks.attachmentFindFirst.mockResolvedValue(unheldAttachment());
    mocks.attachmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transactionAttachmentFindFirst.mockResolvedValue(heldAttachment());
    mocks.auditCreate.mockResolvedValue({ id: "audit-id" });

    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).resolves.toMatchObject({ outcome: "PLACED", rowVersion: 5 });

    expect(mocks.attachmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: attachmentId,
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
        },
      }),
    );
    expect(mocks.mfaGuard).toHaveBeenCalledWith(
      session,
      expect.objectContaining({
        action: "evidence.legal_hold.set",
        permissionCode: permissions.evidenceLegalHoldSet,
        enforcementScope: "admin_security",
      }),
    );
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      session,
      permissions.evidenceLegalHoldSet,
    );
    expect(mocks.requireActiveScopeAssignment).toHaveBeenCalledWith(session, {
      scopeType: "COMPANY",
      scopeId: session.context.companyId,
    });
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          legalHold: false,
          rowVersion: 4,
          purgedAt: null,
        }),
        data: expect.objectContaining({
          legalHold: true,
          legalHoldAuthority: holdInput.authority,
          legalHoldCaseReference: holdInput.caseReference,
          legalHoldReason: holdInput.reason,
          rowVersion: { increment: 1 },
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "evidence.legal_hold.placed",
        beforeData: expect.objectContaining({ legalHold: false, rowVersion: 4 }),
        afterData: expect.objectContaining({ legalHold: true, rowVersion: 5 }),
        metadata: expect.objectContaining({
          preservationOnly: true,
          holdReleaseSupported: false,
          physicalPurgeSupported: false,
        }),
      }),
    });
  });

  it("fails before evidence lookup when live permission or company scope is revoked", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(mocks.attachmentFindFirst).not.toHaveBeenCalled();
    expect(mocks.mfaGuard).not.toHaveBeenCalled();

    mocks.requireActiveScopeAssignment.mockRejectedValueOnce(
      new Error("SCOPE_DENIED"),
    );
    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("SCOPE_DENIED");
    expect(mocks.attachmentFindFirst).not.toHaveBeenCalled();
    expect(mocks.mfaGuard).not.toHaveBeenCalled();
  });

  it("MFA-guards an exact retry and returns it without another mutation", async () => {
    mocks.attachmentFindFirst.mockResolvedValue(heldAttachment());

    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).resolves.toMatchObject({ outcome: "UNCHANGED", rowVersion: 5 });
    expect(mocks.mfaGuard).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not report placement when the transactional audit write fails", async () => {
    mocks.attachmentFindFirst.mockResolvedValue(unheldAttachment());
    mocks.attachmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transactionAttachmentFindFirst.mockResolvedValue(heldAttachment());
    mocks.auditCreate.mockRejectedValue(new Error("AUDIT_WRITE_FAILED"));

    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("fails closed for cross-company absence, conflicting holds, and stale versions", async () => {
    mocks.attachmentFindFirst.mockResolvedValueOnce(null);
    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("EVIDENCE_ATTACHMENT_NOT_FOUND");

    mocks.attachmentFindFirst.mockResolvedValueOnce({
      ...heldAttachment(),
      legalHoldCaseReference: "CASE-OTHER",
    });
    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("EVIDENCE_LEGAL_HOLD_CONFLICT");

    mocks.attachmentFindFirst.mockResolvedValueOnce({
      ...unheldAttachment(),
      rowVersion: 9,
    });
    await expect(
      setEvidenceLegalHoldForSession(session, holdInput),
    ).rejects.toThrow("EVIDENCE_LEGAL_HOLD_CONCURRENT_CHANGE");
  });

  it("keeps the register behind dedicated company-admin metadata authority", () => {
    const source = readFileSync(
      new URL("./evidenceRetention.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("permissions.evidenceRetentionView");
    expect(source).toContain("Generic\n  // source viewers cannot use it");
    expect(source).toContain("includesFileBytes: false");
    expect(source).not.toContain("readAvailableEvidenceAttachmentForSession");
    expect(source).not.toContain("objectKey: true");
    expect(source).toContain("controlledEvidenceLinks");
    expect(source).toContain("archivedAt: true");
    expect(source).not.toMatch(/export async function (release|purge|delete)Evidence/i);
  });

  it("enforces the confidential register permission and current company scope", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
    await expect(
      listEvidenceRetentionRegisterForSession(
        { ...session, permissionCodes: [] },
        {},
      ),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      expect.objectContaining({ user: session.user }),
      permissions.evidenceRetentionView,
    );
    expect(mocks.attachmentFindMany).not.toHaveBeenCalled();

    mocks.attachmentCount.mockResolvedValue(1);
    mocks.attachmentFindMany.mockResolvedValue([heldAttachment()]);
    await expect(
      listEvidenceRetentionRegisterForSession(
        { ...session, permissionCodes: [permissions.evidenceRetentionView] },
        { page: 1, pageSize: 25, heldOnly: true },
      ),
    ).resolves.toMatchObject({
      page: 1,
      pageSize: 25,
      totalCount: 1,
      includesFileBytes: false,
    });
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          legalHold: true,
        },
        skip: 0,
        take: 25,
      }),
    );
    expect(mocks.requireActiveScopeAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ user: session.user }),
      {
        scopeType: "COMPANY",
        scopeId: session.context.companyId,
      },
    );
  });

  it("blocks normal source workflows from archiving held or required evidence", () => {
    const controlledEvidenceSource = readFileSync(
      new URL("./attachments.ts", import.meta.url),
      "utf8",
    );
    const projectTaskSource = readFileSync(
      new URL("./projectTasks.ts", import.meta.url),
      "utf8",
    );
    expect(controlledEvidenceSource).toContain(
      "link.attachment.legalHold || link.requiredForAction",
    );
    expect(projectTaskSource).toContain(
      "link.attachment.legalHold || link.requirement?.isRequired",
    );
    expect(projectTaskSource).toContain(
      "PROJECT_ATTACHMENT_LEGAL_HOLD_ARCHIVE_DENIED",
    );
    expect(projectTaskSource).toContain(
      "PROJECT_REQUIRED_EVIDENCE_ARCHIVE_DENIED",
    );
    expect(controlledEvidenceSource).toContain('FROM "Attachment"');
    expect(controlledEvidenceSource).toContain("FOR UPDATE");
    expect(projectTaskSource).toContain('FROM "Attachment"');
    expect(projectTaskSource).toContain("FOR UPDATE");
  });
});
