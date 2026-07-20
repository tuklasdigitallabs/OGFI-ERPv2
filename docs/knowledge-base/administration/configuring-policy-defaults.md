# Configuring Policy Defaults

**Audience / required role:** ERP administrators with company Manage scope  
**Applies to:** Purchasing, inventory, reporting, work management, security, continuity, and release-readiness defaults  
**Last verified against:** Admin Settings policy registry and DEC-0036 configurable defaults

## Purpose

Open **Admin > Admin Settings** to review the recommended F&B pilot defaults and any company overrides. These settings make DEC-0036 visible and auditable without hardcoding business policy into each workflow.

## Recommended Defaults Versus Overrides

- **Recommended** means the company is still using the DEC-0036 baseline value.
- **Overridden** means an administrator changed the company value and recorded a reason.
- Structured values, such as retention, backup/restore, supplier-accreditation, and lot/expiry category policies, show a readable summary on the page while keeping the raw JSON available in the configure modal for controlled updates.
- Every save writes an audit event with the previous value, new value, actor, and reason.

## Security And Continuity Settings

## Purchasing Settings

The **Purchasing controls** tab includes configurable approval bands and buying controls:

- **Standard purchase approval threshold:** default PHP 10,000.
- **High-value purchase threshold:** default PHP 50,000.
- **Senior purchase approval threshold:** default PHP 200,000.
- **Emergency purchase ceiling:** default PHP 5,000 for emergency-path requests.
- **Quotation comparison threshold:** default PHP 50,000 estimated request value.
- **Minimum quotes for controlled buying:** default 3 quotes when quotation comparison is required.
- **Supplier accreditation statuses allowed for normal POs:** default `APPROVED`.

These thresholds make the recommended approval bands visible and auditable. They do not approve a request by themselves. The approval engine, assigned approval rules, role permissions, source-record status, scope, and no-self-approval controls still determine who can act.

When a request meets or exceeds the quotation comparison threshold, the recommendation workflow expects the configured minimum quote count. If fewer quotes are available, purchasing must record a single-source or quote-shortfall justification before the recommendation can proceed.

Supplier lifecycle and supplier accreditation are separate controls. A supplier record can be lifecycle-active while still `PENDING_REVIEW`, `SUSPENDED`, or `BLOCKED`; normal PO creation, submission, and issue use the configured accreditation policy and default to `APPROVED` suppliers only.

The **Security and continuity** tab includes:

- **Data retention matrix:** default retention periods for audit/security/financial-control records and operational working records, plus attachment-retention and PII/export-redaction expectations.
- **Backup and restore policy:** daily encrypted database backup, offsite copy, checksum verification, quarterly isolated restore rehearsal, and pre-release backup/restore evidence requirements.

These settings do not create a backup file, delete records, or purge attachments by themselves. They define the company policy baseline that release readiness, operations, and future automation must follow.

The page summary should make these items readable without opening the JSON editor:

- audit/security/financial-control retention period
- operational working-record retention period
- attachment-retention behavior
- PII minimization and export-redaction expectations
- database backup frequency
- encryption, offsite copy, and checksum requirements
- restore rehearsal frequency
- pre-release backup/restore evidence requirement

If the readable summary and the raw JSON do not match, treat the policy as needing administrator review before release evidence is accepted.

## Reporting And Export Settings

The **Reporting trust gates** tab controls whether exports require selected scope filters and how dashboards behave when source data is unreconciled. Operational CSV exports include metadata rows for report ID, company, brand, location, scope-filter requirement, trust-gate mode, source decision, and override status.

Changing these values does not grant report access. Export permissions, source-record permissions, selected scope, and audit logging still apply.

## What To Check Before Rollout

- Retention and backup defaults match the client’s legal, finance, and IT policy.
- Release readiness has backup/restore evidence attached before GO review.
- Any override has a clear reason and owner approval.
- UAT findings that change these values are recorded in the default revision register.
