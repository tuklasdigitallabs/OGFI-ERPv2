BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE "Tenant" ADD COLUMN "loginCode" TEXT;

UPDATE "Tenant"
SET "loginCode" = 'tenant-' || lower(replace("id"::text, '-', ''))
WHERE "loginCode" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "loginCode" SET NOT NULL;
CREATE UNIQUE INDEX "Tenant_loginCode_key" ON "Tenant"("loginCode");
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_loginCode_lowercase_check" CHECK ("loginCode" = lower("loginCode"));

ALTER TABLE "User" ADD COLUMN "privilegeEpoch" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Company_id_tenantId_key" ON "Company"("id", "tenantId");
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

CREATE TABLE "AuthIdentity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'LOCAL',
  "providerSubject" TEXT,
  "normalizedIdentifier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordCredential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "authIdentityId" UUID NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "hashAlgorithm" TEXT NOT NULL DEFAULT 'ARGON2ID',
  "requiresChange" BOOLEAN NOT NULL DEFAULT false,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaAuthenticator" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "encryptedSecret" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretAuthTag" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "lastUsedCounter" BIGINT,
  "verifiedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MfaAuthenticator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "authenticatorId" UUID NOT NULL,
  "codeHash" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "authIdentityId" UUID,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_MFA',
  "assuranceLevel" TEXT NOT NULL DEFAULT 'PASSWORD',
  "mfaAuthenticatedAt" TIMESTAMP(3),
  "privilegeEpochAtIssue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "userAgentHash" TEXT,
  "sourceAddressHash" TEXT,
  "challengeFailureCount" INTEGER NOT NULL DEFAULT 0,
  "challengeLockedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthActivationToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "issuedByUserId" UUID,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "deliveryAttemptedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deliveryError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthActivationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthLoginAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantLoginCodeHash" TEXT NOT NULL,
  "identifierHash" TEXT NOT NULL,
  "sourceAddressHash" TEXT NOT NULL,
  "attemptType" TEXT NOT NULL DEFAULT 'PASSWORD',
  "sessionId" UUID,
  "succeeded" BOOLEAN NOT NULL DEFAULT false,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthLoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRecoveryRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resetPassword" BOOLEAN NOT NULL DEFAULT true,
  "resetMfa" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRecoveryRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthBootstrapState" (
  "tenantId" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "authorizationReference" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthBootstrapState_pkey" PRIMARY KEY ("tenantId")
);

CREATE UNIQUE INDEX "AuthIdentity_tenantId_provider_normalizedIdentifier_key" ON "AuthIdentity"("tenantId", "provider", "normalizedIdentifier");
CREATE UNIQUE INDEX "AuthIdentity_tenantId_provider_providerSubject_key" ON "AuthIdentity"("tenantId", "provider", "providerSubject");
CREATE UNIQUE INDEX "AuthIdentity_id_tenantId_userId_key" ON "AuthIdentity"("id", "tenantId", "userId");
CREATE INDEX "AuthIdentity_userId_status_idx" ON "AuthIdentity"("userId", "status");
CREATE UNIQUE INDEX "PasswordCredential_authIdentityId_key" ON "PasswordCredential"("authIdentityId");
CREATE INDEX "MfaAuthenticator_tenantId_userId_status_idx" ON "MfaAuthenticator"("tenantId", "userId", "status");
CREATE UNIQUE INDEX "MfaAuthenticator_one_active_per_user_key" ON "MfaAuthenticator"("tenantId", "userId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");
CREATE INDEX "MfaRecoveryCode_authenticatorId_consumedAt_idx" ON "MfaRecoveryCode"("authenticatorId", "consumedAt");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_tenantId_userId_status_idx" ON "AuthSession"("tenantId", "userId", "status");
CREATE INDEX "AuthSession_idleExpiresAt_status_idx" ON "AuthSession"("idleExpiresAt", "status");
CREATE INDEX "AuthSession_absoluteExpiresAt_status_idx" ON "AuthSession"("absoluteExpiresAt", "status");
CREATE UNIQUE INDEX "AuthActivationToken_tokenHash_key" ON "AuthActivationToken"("tokenHash");
CREATE INDEX "AuthActivationToken_tenantId_targetUserId_status_idx" ON "AuthActivationToken"("tenantId", "targetUserId", "status");
CREATE INDEX "AuthActivationToken_expiresAt_status_idx" ON "AuthActivationToken"("expiresAt", "status");
CREATE INDEX "AuthActivationToken_deliveryStatus_createdAt_idx" ON "AuthActivationToken"("deliveryStatus", "createdAt");
CREATE UNIQUE INDEX "AuthActivationToken_one_active_per_user_key" ON "AuthActivationToken"("tenantId", "targetUserId") WHERE "status" = 'ACTIVE';
CREATE INDEX "AuthLoginAttempt_identifierHash_attemptedAt_idx" ON "AuthLoginAttempt"("identifierHash", "attemptedAt");
CREATE INDEX "AuthLoginAttempt_sourceAddressHash_attemptedAt_idx" ON "AuthLoginAttempt"("sourceAddressHash", "attemptedAt");
CREATE INDEX "AuthLoginAttempt_attemptedAt_idx" ON "AuthLoginAttempt"("attemptedAt");
CREATE INDEX "AuthRecoveryRequest_tenantId_companyId_status_idx" ON "AuthRecoveryRequest"("tenantId", "companyId", "status");
CREATE INDEX "AuthRecoveryRequest_targetUserId_status_idx" ON "AuthRecoveryRequest"("targetUserId", "status");
CREATE UNIQUE INDEX "AuthRecoveryRequest_one_pending_per_user_key" ON "AuthRecoveryRequest"("tenantId", "targetUserId") WHERE "status" = 'PENDING';
CREATE INDEX "AuthBootstrapState_targetUserId_idx" ON "AuthBootstrapState"("targetUserId");

ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_authIdentityId_fkey" FOREIGN KEY ("authIdentityId") REFERENCES "AuthIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaAuthenticator" ADD CONSTRAINT "MfaAuthenticator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaAuthenticator" ADD CONSTRAINT "MfaAuthenticator_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_authenticatorId_fkey" FOREIGN KEY ("authenticatorId") REFERENCES "MfaAuthenticator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_authIdentityId_tenantId_userId_fkey" FOREIGN KEY ("authIdentityId", "tenantId", "userId") REFERENCES "AuthIdentity"("id", "tenantId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthActivationToken" ADD CONSTRAINT "AuthActivationToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthActivationToken" ADD CONSTRAINT "AuthActivationToken_targetUserId_tenantId_fkey" FOREIGN KEY ("targetUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthActivationToken" ADD CONSTRAINT "AuthActivationToken_issuedByUserId_tenantId_fkey" FOREIGN KEY ("issuedByUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryRequest" ADD CONSTRAINT "AuthRecoveryRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryRequest" ADD CONSTRAINT "AuthRecoveryRequest_companyId_tenantId_fkey" FOREIGN KEY ("companyId", "tenantId") REFERENCES "Company"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryRequest" ADD CONSTRAINT "AuthRecoveryRequest_targetUserId_tenantId_fkey" FOREIGN KEY ("targetUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryRequest" ADD CONSTRAINT "AuthRecoveryRequest_requestedByUserId_tenantId_fkey" FOREIGN KEY ("requestedByUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthRecoveryRequest" ADD CONSTRAINT "AuthRecoveryRequest_reviewedByUserId_tenantId_fkey" FOREIGN KEY ("reviewedByUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthBootstrapState" ADD CONSTRAINT "AuthBootstrapState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthBootstrapState" ADD CONSTRAINT "AuthBootstrapState_targetUserId_tenantId_fkey" FOREIGN KEY ("targetUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
