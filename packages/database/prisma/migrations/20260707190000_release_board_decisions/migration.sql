CREATE TABLE "ReleaseBoardDecision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decisionNote" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "participants" JSONB NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "chairUserId" UUID NOT NULL,
    "sourceDecisionId" TEXT NOT NULL DEFAULT 'DEC-0036',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseBoardDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReleaseBoardDecision_decision_check" CHECK ("decision" IN ('GO', 'CONDITIONAL_GO', 'HOLD', 'ROLLBACK', 'FORWARD_FIX'))
);

CREATE INDEX "ReleaseBoardDecision_tenantId_companyId_decision_decidedAt_idx" ON "ReleaseBoardDecision"("tenantId", "companyId", "decision", "decidedAt");
CREATE INDEX "ReleaseBoardDecision_tenantId_companyId_createdAt_idx" ON "ReleaseBoardDecision"("tenantId", "companyId", "createdAt");

ALTER TABLE "ReleaseBoardDecision" ADD CONSTRAINT "ReleaseBoardDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReleaseBoardDecision" ADD CONSTRAINT "ReleaseBoardDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReleaseBoardDecision" ADD CONSTRAINT "ReleaseBoardDecision_chairUserId_fkey" FOREIGN KEY ("chairUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
