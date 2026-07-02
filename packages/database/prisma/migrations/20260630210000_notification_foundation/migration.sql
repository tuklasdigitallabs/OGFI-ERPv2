CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID,
  "locationId" UUID,
  "recipientUserId" UUID NOT NULL,
  "notificationType" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "channel" TEXT NOT NULL DEFAULT 'IN_APP',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "deepLink" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID,
  "sourceEventKey" TEXT NOT NULL,
  "recipientBasis" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNREAD',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "metadata" JSONB,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_tenantId_recipientUserId_sourceEventKey_key"
  ON "Notification"("tenantId", "recipientUserId", "sourceEventKey");

CREATE INDEX "Notification_tenantId_recipientUserId_status_generatedAt_idx"
  ON "Notification"("tenantId", "recipientUserId", "status", "generatedAt");

CREATE INDEX "Notification_tenantId_entityType_entityId_idx"
  ON "Notification"("tenantId", "entityType", "entityId");

CREATE INDEX "Notification_tenantId_companyId_locationId_idx"
  ON "Notification"("tenantId", "companyId", "locationId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
