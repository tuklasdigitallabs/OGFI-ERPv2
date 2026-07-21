import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  attachmentMaxSizeBytes,
  buildEvidenceReadinessRows,
  buildEvidenceSourceKey,
  evidenceSourceMatchesActiveScope,
  phase3EvidenceUploadBlockerId,
  resolveEvidenceReadiness,
  validateAttachmentMetadata,
  validateEvidenceAttachmentLinkInput,
} from "./attachments";

const serviceSource = readFileSync(
  path.resolve(__dirname, "attachments.ts"),
  "utf8",
);

function functionSlice(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  if (start === -1) {
    return "";
  }
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe("attachment evidence foundation", () => {
  it("requires an exact active organizational scope for source evidence", () => {
    const source = {
      tenantId: "tenant-a",
      companyId: "company-a",
      brandId: "brand-a",
      locationId: "location-a",
      departmentId: "department-a",
      projectId: null,
    };

    expect(
      evidenceSourceMatchesActiveScope(source, [
        { scopeType: "BRAND", scopeId: "brand-a" },
        { scopeType: "LOCATION", scopeId: "location-a" },
        { scopeType: "DEPARTMENT", scopeId: "department-a" },
      ]),
    ).toBe(true);
    expect(
      evidenceSourceMatchesActiveScope(source, [
        { scopeType: "LOCATION", scopeId: "location-a" },
      ]),
    ).toBe(false);
    expect(
      evidenceSourceMatchesActiveScope(source, [
        { scopeType: "LOCATION", scopeId: "location-b" },
        { scopeType: "DEPARTMENT", scopeId: "department-b" },
      ]),
    ).toBe(false);
    expect(
      evidenceSourceMatchesActiveScope(source, [
        { scopeType: "COMPANY", scopeId: "company-a" },
      ]),
    ).toBe(false);
    expect(
      evidenceSourceMatchesActiveScope(
        {
          ...source,
          brandId: null,
          locationId: null,
          departmentId: null,
        },
        [],
      ),
    ).toBe(true);
  });

  it("treats a reference-only evidence record as demo-complete but upload-deferred", () => {
    expect(
      resolveEvidenceReadiness({
        evidenceReference: "BANK-TRANSFER-SCREENSHOT-001",
      }),
    ).toEqual({
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "REFERENCE_ONLY",
      evidenceProductionReadiness: "BINARY_UPLOAD_DEFERRED_BY_P3_BLOCK_002",
      evidenceBlockerId: phase3EvidenceUploadBlockerId,
    });
  });

  it("treats attachment metadata as ready without claiming binary upload is production-ready", () => {
    expect(
      resolveEvidenceReadiness({
        attachmentCount: 2,
      }),
    ).toEqual({
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "ATTACHMENT_METADATA_READY",
      evidenceProductionReadiness: "BINARY_UPLOAD_DEFERRED_BY_P3_BLOCK_002",
      evidenceBlockerId: phase3EvidenceUploadBlockerId,
    });
  });

  it("keeps missing evidence distinct from the binary upload blocker", () => {
    expect(resolveEvidenceReadiness({ evidenceReference: "   " })).toEqual({
      evidenceState: "MISSING",
      evidenceCaptureMode: "MISSING",
      evidenceProductionReadiness: "NEEDS_EVIDENCE_REFERENCE",
      evidenceBlockerId: null,
    });
  });

  it("validates evidence metadata without accepting public URLs or path traversal", () => {
    expect(
      validateAttachmentMetadata({
        originalFilename: "deposit-slip.pdf",
        mimeType: "application/pdf",
        sizeBytes: 240_000,
        storageProvider: "local-private",
        objectKey: "finance/evidence/deposit-slip.pdf",
        checksum: "sha256-demo",
      }),
    ).toMatchObject({
      isValid: true,
      normalized: {
        originalFilename: "deposit-slip.pdf",
        mimeType: "application/pdf",
      },
      errors: [],
    });

    const invalid = validateAttachmentMetadata({
      originalFilename: "../deposit-slip.exe",
      mimeType: "application/x-msdownload",
      sizeBytes: attachmentMaxSizeBytes + 1,
      storageProvider: "local-private",
      objectKey: "https://public.example.test/deposit-slip.exe",
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        "Attachment filename must not include path separators.",
        "Attachment file type is not allowed for evidence.",
        "Attachment exceeds the configured evidence size limit.",
        "Attachment object key must be an internal storage key, not a public path or URL.",
      ]),
    );
  });

  it("builds readiness rows from existing evidence references and scoped attachment counts", () => {
    const rows = buildEvidenceReadinessRows(
      [
        { id: "record-1", evidenceReference: null },
        { id: "record-2", evidenceReference: "OR-001" },
      ],
      {
        attachmentCountById: new Map([["record-1", 1]]),
      },
    );

    expect(rows[0]).toMatchObject({
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "ATTACHMENT_METADATA_READY",
    });
    expect(rows[1]).toMatchObject({
      evidenceState: "COMPLETE",
      evidenceCaptureMode: "REFERENCE_ONLY",
    });
  });

  it("normalizes controlled evidence attachment source links without source payload snapshots", () => {
    const sourceRecordId = "11111111-1111-4111-8111-111111111111";
    const sourceLineId = "22222222-2222-4222-8222-222222222222";

    expect(
      buildEvidenceSourceKey({
        sourceRecordId,
        sourceLineId,
      }),
    ).toBe(`${sourceRecordId}:${sourceLineId}`);
    expect(buildEvidenceSourceKey({ sourceRecordId })).toBe(
      `${sourceRecordId}:HEADER`,
    );

    const validation = validateEvidenceAttachmentLinkInput({
      tenantId: "33333333-3333-4333-8333-333333333333",
      companyId: "44444444-4444-4444-8444-444444444444",
      sourceType: "PAYMENT_RELEASE",
      sourceRecordId,
      sourceLineId,
      attachmentId: "55555555-5555-4555-8555-555555555555",
      purpose: "PAYMENT_PROOF",
      caption: " Offline transfer confirmation ",
      requiredForAction: "EXECUTE",
    });

    expect(validation).toMatchObject({
      isValid: true,
      normalized: {
        sourceType: "PAYMENT_RELEASE",
        sourceRecordId,
        sourceLineId,
        sourceKey: `${sourceRecordId}:${sourceLineId}`,
        purpose: "PAYMENT_PROOF",
        caption: "Offline transfer confirmation",
        requiredForAction: "EXECUTE",
      },
      errors: [],
    });
    expect(JSON.stringify(validation.normalized)).not.toContain(
      "sourceDocumentSnapshot",
    );
  });

  it("rejects unsupported source attachment links before persistence", () => {
    const validation = validateEvidenceAttachmentLinkInput({
      tenantId: "not-a-uuid",
      companyId: "44444444-4444-4444-8444-444444444444",
      sourceType: "UNSUPPORTED" as "PAYMENT_RELEASE",
      sourceRecordId: "11111111-1111-4111-8111-111111111111",
      attachmentId: "55555555-5555-4555-8555-555555555555",
    });

    expect(validation.isValid).toBe(false);
    expect(validation.normalized).toBeNull();
    expect(validation.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("defines permissioned controlled source-record link actions without binary upload behavior", () => {
    const linkSlice = functionSlice(
      serviceSource,
      "linkControlledEvidenceAttachment",
    );
    const archiveSlice = functionSlice(
      serviceSource,
      "archiveControlledEvidenceAttachment",
    );

    expect(serviceSource).toContain("listControlledEvidenceAttachments");
    expect(serviceSource).toContain(
      "createControlledEvidenceAttachmentMetadataLink",
    );
    expect(linkSlice).toContain("requireSessionContext");
    expect(linkSlice).toContain("authorizeControlledEvidenceSourceAction");
    expect(linkSlice).toContain("assertCompanySession");
    expect(linkSlice).toContain("prisma.attachment.findFirst");
    expect(linkSlice).toContain('status: "ACTIVE"');
    expect(linkSlice).toContain("tx.controlledEvidenceAttachment.create");
    expect(linkSlice).toContain("tx.auditEvent.create");
    expect(linkSlice).toContain("noSourceMutation");
    expect(linkSlice).toContain("noBinaryUpload");
    expect(archiveSlice).toContain("archiveReason");
    expect(archiveSlice).toContain("noBinaryDelete");
    expect(linkSlice).not.toContain("objectKey");
    expect(archiveSlice).not.toContain("objectKey");
    expect(serviceSource).not.toContain("createWriteStream");
  });

  it("creates metadata-only evidence links with audit and no source mutation", () => {
    const createMetadataLinkSlice = functionSlice(
      serviceSource,
      "createControlledEvidenceAttachmentMetadataLink",
    );

    expect(createMetadataLinkSlice).toContain("validateAttachmentMetadata");
    expect(createMetadataLinkSlice).toContain("tx.attachment.create");
    expect(createMetadataLinkSlice).toContain(
      "tx.controlledEvidenceAttachment.create",
    );
    expect(createMetadataLinkSlice).toContain(
      'eventType: "controlled_evidence_attachment.metadata_linked"',
    );
    expect(createMetadataLinkSlice).toContain("metadataOnly: true");
    expect(createMetadataLinkSlice).toContain("noSourceMutation");
    expect(createMetadataLinkSlice).toContain("noBinaryUpload");
    expect(createMetadataLinkSlice).toContain(
      "phase3EvidenceUploadBlockerId",
    );
    expect(createMetadataLinkSlice).not.toContain("writeFile");
    expect(createMetadataLinkSlice).not.toContain("createWriteStream");
  });

  it("defines private binary upload and audited download controls", () => {
    const uploadSlice = functionSlice(
      serviceSource,
      "createControlledEvidenceAttachmentUploadLink",
    );
    const downloadSlice = functionSlice(
      serviceSource,
      "downloadControlledEvidenceAttachmentForSession",
    );

    expect(serviceSource).toContain("privateAttachmentStorageProvider");
    expect(serviceSource).toContain("getControlledEvidenceStoragePolicy");
    expect(uploadSlice).toContain("validateAttachmentMetadata");
    expect(uploadSlice).toContain("policyMaxSizeBytes");
    expect(uploadSlice).toContain("arrayBuffer");
    expect(uploadSlice).toContain("createHash");
    expect(uploadSlice).toContain("writeFile");
    expect(uploadSlice).toContain(
      'eventType: "controlled_evidence_attachment.uploaded"',
    );
    expect(uploadSlice).toContain("downloadAuditRequired");
    expect(uploadSlice).toContain("malwareScanMode");
    expect(uploadSlice).toContain("malwareScanWaiverReason");
    expect(uploadSlice).toContain("retentionPolicy");
    expect(uploadSlice).toContain("recoveryPolicy");
    expect(uploadSlice).toContain("noSourceMutation");
    expect(downloadSlice).toContain("requireAnyPermission");
    expect(downloadSlice).toContain("requiredViewPermissionsForSourceType");
    expect(downloadSlice).toContain("assertControlledEvidenceSourceAccess");
    expect(downloadSlice).toContain("readFile");
    expect(downloadSlice).toContain(
      'eventType: "controlled_evidence_attachment.downloaded"',
    );
    expect(downloadSlice).toContain("checksumVerified");
  });
});
