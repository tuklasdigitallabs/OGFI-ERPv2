CREATE TABLE "MaintenanceTicket" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "ticketNumber" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "assetArea" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reportedByUserId" UUID,
  "ownerUserId" UUID,
  "sourceIncidentId" UUID,
  "downtimeMinutes" INTEGER,
  "targetDueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "correctiveAction" TEXT,
  "evidenceReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceTicket_companyId_ticketNumber_key"
  ON "MaintenanceTicket"("companyId", "ticketNumber");

CREATE INDEX "MaintenanceTicket_tenantId_companyId_brandId_locationId_requestedAt_status_idx"
  ON "MaintenanceTicket"("tenantId", "companyId", "brandId", "locationId", "requestedAt", "status");

CREATE INDEX "MaintenanceTicket_priority_status_idx"
  ON "MaintenanceTicket"("priority", "status");

CREATE INDEX "MaintenanceTicket_sourceIncidentId_idx"
  ON "MaintenanceTicket"("sourceIncidentId");

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
