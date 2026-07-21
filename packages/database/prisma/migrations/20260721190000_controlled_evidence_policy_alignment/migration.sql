BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- DEC-0046 replaces the superseded external/local-waiver default. Preserve every
-- company override; only rows still marked as default adopt the new value.
WITH policy AS (
  SELECT jsonb_build_object(
    'storageProvider', 'environment-isolated',
    'uploadLimitMb', 10,
    'allowedMimePolicy', 'allowlist',
    'malwareScanMode', 'required_before_availability',
    'malwareScanWaiverReason',
      'Only local development may use an explicit test scan result; every hosted upload must pass the private ClamAV boundary before availability.',
    'retentionPolicy', 'preserve_until_approved_transaction_retention',
    'recoveryPolicy', 'paired_database_evidence_restore_required',
    'downloadAuditRequired', true
  ) AS value
)
UPDATE "CompanyPolicySetting" setting
SET
  "value" = CASE WHEN setting."isDefault" THEN policy.value ELSE setting."value" END,
  "defaultValue" = policy.value,
  "sourceDecisionId" = 'DEC-0046',
  "description" = 'Private evidence upload defaults for environment isolation, MIME allowlist, required hosted scanning, preservation, paired recovery, and download auditing.',
  "updatedAt" = CURRENT_TIMESTAMP
FROM policy
WHERE setting."key" = 'security.evidence_storage.default_policy';

COMMIT;
