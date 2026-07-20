-- Additive Phase 3 evidence-link foundation.
-- This table links existing Attachment metadata to controlled source records.
-- It does not introduce binary upload/download, malware scanning, retention policy, or source-record mutation.

CREATE TABLE "ControlledEvidenceAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRecordId" UUID NOT NULL,
    "sourceLineId" UUID,
    "sourceKey" TEXT NOT NULL,
    "attachmentId" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "caption" TEXT,
    "requiredForAction" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" UUID,
    "archiveReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlledEvidenceAttachment_sourceKey_attachment_key"
    ON "ControlledEvidenceAttachment"("tenantId", "companyId", "sourceType", "sourceKey", "attachmentId");

CREATE INDEX "ControlledEvidenceAttachment_sourceRecord_status_idx"
    ON "ControlledEvidenceAttachment"("tenantId", "companyId", "sourceType", "sourceRecordId", "status");

CREATE INDEX "ControlledEvidenceAttachment_sourceLine_status_idx"
    ON "ControlledEvidenceAttachment"("tenantId", "companyId", "sourceLineId", "status");

CREATE INDEX "ControlledEvidenceAttachment_attachmentId_status_idx"
    ON "ControlledEvidenceAttachment"("attachmentId", "status");

CREATE INDEX "ControlledEvidenceAttachment_createdByUserId_createdAt_idx"
    ON "ControlledEvidenceAttachment"("createdByUserId", "createdAt");

ALTER TABLE "ControlledEvidenceAttachment"
    ADD CONSTRAINT "ControlledEvidenceAttachment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlledEvidenceAttachment"
    ADD CONSTRAINT "ControlledEvidenceAttachment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlledEvidenceAttachment"
    ADD CONSTRAINT "ControlledEvidenceAttachment_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlledEvidenceAttachment"
    ADD CONSTRAINT "ControlledEvidenceAttachment_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ControlledEvidenceAttachment"
    ADD CONSTRAINT "ControlledEvidenceAttachment_archivedByUserId_fkey"
    FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
