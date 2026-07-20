CREATE TABLE "OperationalIncident" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "incidentNumber" TEXT NOT NULL,
  "incidentDate" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "reportedByUserId" UUID,
  "ownerUserId" UUID,
  "sourceRecordType" TEXT,
  "sourceRecordId" UUID,
  "correctiveAction" TEXT,
  "evidenceReference" TEXT,
  "dueAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalIncident_companyId_incidentNumber_key"
  ON "OperationalIncident"("companyId", "incidentNumber");

CREATE INDEX "OperationalIncident_tenantId_companyId_brandId_locationId_incidentDate_status_idx"
  ON "OperationalIncident"("tenantId", "companyId", "brandId", "locationId", "incidentDate", "status");

CREATE INDEX "OperationalIncident_severity_status_idx"
  ON "OperationalIncident"("severity", "status");

CREATE INDEX "OperationalIncident_sourceRecordType_sourceRecordId_idx"
  ON "OperationalIncident"("sourceRecordType", "sourceRecordId");

ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
