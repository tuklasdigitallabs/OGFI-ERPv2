ALTER TABLE "PasswordCredential"
  ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3);
ALTER TABLE "PasswordCredential"
  ADD COLUMN "temporaryPasswordUsedAt" TIMESTAMP(3);
