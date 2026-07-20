ALTER TABLE "ProjectTemplate"
ADD COLUMN "sourceTemplateId" UUID,
ADD COLUMN "lineageRootTemplateId" UUID,
ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "publishReason" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archiveReason" TEXT;

CREATE UNIQUE INDEX "ProjectTemplate_companyId_lineageRootTemplateId_revisionNumber_key"
ON "ProjectTemplate"("companyId", "lineageRootTemplateId", "revisionNumber");

CREATE INDEX "ProjectTemplate_tenantId_companyId_lineageRootTemplateId_revisionNumber_idx"
ON "ProjectTemplate"("tenantId", "companyId", "lineageRootTemplateId", "revisionNumber");

CREATE INDEX "ProjectTemplate_sourceTemplateId_idx"
ON "ProjectTemplate"("sourceTemplateId");

ALTER TABLE "ProjectTemplate"
ADD CONSTRAINT "ProjectTemplate_sourceTemplateId_fkey"
FOREIGN KEY ("sourceTemplateId") REFERENCES "ProjectTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplate"
ADD CONSTRAINT "ProjectTemplate_lineageRootTemplateId_fkey"
FOREIGN KEY ("lineageRootTemplateId") REFERENCES "ProjectTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
