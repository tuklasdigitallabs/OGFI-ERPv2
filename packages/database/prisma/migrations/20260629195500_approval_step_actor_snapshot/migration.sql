-- Snapshot the user who acted on an approval step.
ALTER TABLE "ApprovalInstanceStep" ADD COLUMN "actedByUserId" UUID;
CREATE INDEX "ApprovalInstanceStep_actedByUserId_idx" ON "ApprovalInstanceStep"("actedByUserId");
