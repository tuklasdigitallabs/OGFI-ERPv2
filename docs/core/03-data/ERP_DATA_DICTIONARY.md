# OGFI ERP — Data Dictionary

**Document ID:** ERP_DATA_DICTIONARY  
**Version:** 0.1  
**Status:** Phase I baseline  
**Date:** 21 July 2026
**Applies to:** Platform Administration, Approvals, Purchasing, Receiving, Inventory, Transfers, Wastage, Adjustments, Audit, Notifications

---

## 1. Purpose

This document defines the Phase I data model for the OGFI ERP. It establishes the records, fields, identifiers, relationships, status values, validation rules, and data-ownership boundaries required to build a traceable multi-company, multi-brand, multi-branch restaurant ERP.

The system is built for OGFI first but must remain tenant-ready for other restaurant groups. Every record is isolated by tenant and company scope from day one.

---

## 2. Design Principles

1. Every operational record identifies its company and relevant brand, location, department, cost center, requester, and status.
2. Roles define what a user can do; scope assignments define where they can do it.
3. Submitted, approved, issued, received, posted, and closed records are never permanently deleted. They are cancelled, reversed, superseded, or deactivated.
4. Inventory is movement-driven. The immutable inventory ledger is the source of truth; on-hand balances are a reconcilable cache.
5. Material changes after approval require a controlled revision or re-approval.
6. Attachments support structured records but never replace required fields.
7. All timestamps are stored in UTC and displayed in the company or user time zone. OGFI default operating time zone: `Asia/Manila`.
8. Approval policies, thresholds, reasons, reminders, and escalations are configuration data, not hardcoded rules.

---

## 3. Shared Conventions

### 3.1 Technical fields

| Field                                      | Type         | Rule                                                      |
| ------------------------------------------ | ------------ | --------------------------------------------------------- |
| `id`                                       | UUID / ULID  | Immutable primary key.                                    |
| `tenant_id`                                | UUID / ULID  | Future restaurant-client isolation boundary.              |
| `company_id`                               | UUID / ULID  | Required on company-owned master and transaction records. |
| `created_at`, `updated_at`                 | datetime UTC | System-generated timestamps.                              |
| `created_by_user_id`, `updated_by_user_id` | UUID         | Actor identifiers.                                        |
| `version`                                  | integer      | Optimistic concurrency control.                           |
| `is_active`                                | boolean      | Master-data lifecycle control.                            |
| `status`                                   | enum         | Record-specific state.                                    |

### 3.2 Human-readable document numbers

| Record               | Default number pattern |
| -------------------- | ---------------------- |
| Purchase Request     | `PR-{YYYY}-{#####}`    |
| RFQ / Supplier Quote | `RFQ-{YYYY}-{#####}`   |
| Quotation Comparison | `QC-{YYYY}-{#####}`    |
| Purchase Order       | `PO-{YYYY}-{#####}`    |
| Receiving Report     | `RR-{YYYY}-{#####}`    |
| Transfer Order       | `TO-{YYYY}-{#####}`    |
| Wastage Report       | `WR-{YYYY}-{#####}`    |
| Stock Adjustment     | `SA-{YYYY}-{#####}`    |
| Physical Count       | `PC-{YYYY}-{#####}`    |

Document prefixes, sequence rules, and annual reset behavior must be configurable by company.

### 3.3 Common lifecycle fields

| Field                                  | Type            | Notes                     |
| -------------------------------------- | --------------- | ------------------------- |
| `submitted_at`, `submitted_by_user_id` | datetime / UUID | Set when first submitted. |
| `approved_at`, `approved_by_user_id`   | datetime / UUID | Final approval.           |
| `rejected_at`, `rejected_reason`       | datetime / text | Reason required.          |
| `cancelled_at`, `cancelled_reason`     | datetime / text | Reason required.          |
| `closed_at`                            | datetime        | Final closure time.       |

---

## 4. Organization and Scope Master Data

### 4.1 Tenant

| Field                   | Required | Notes                                 |
| ----------------------- | -------: | ------------------------------------- |
| `id`                    |      Yes | Primary key.                          |
| `name`                  |      Yes | Client / group name.                  |
| `legal_name`            |       No | Registered legal name when different. |
| `default_timezone`      |      Yes | IANA time zone.                       |
| `default_currency_code` |      Yes | Default `PHP` for OGFI.               |
| `status`                |      Yes | `active`, `suspended`, `inactive`.    |

### 4.2 Company

| Field                          | Required | Notes                        |
| ------------------------------ | -------: | ---------------------------- |
| `tenant_id`, `company_code`    |      Yes | Code unique per tenant.      |
| `legal_name`, `display_name`   |      Yes | Legal and operational names. |
| `tax_id`, `registered_address` |       No | Restricted visibility.       |
| `default_timezone`             |      Yes | May inherit tenant default.  |
| `status`                       |      Yes | `active`, `inactive`.        |

### 4.3 Brand

| Field                                    | Required | Notes                                               |
| ---------------------------------------- | -------: | --------------------------------------------------- |
| `company_id`, `brand_code`, `brand_name` |      Yes | Brand code unique per company.                      |
| `brand_type`                             |      Yes | `restaurant`, `cafe`, `bar`, `commissary`, `other`. |
| `status`                                 |      Yes | `active`, `inactive`.                               |
| `notes`                                  |       No | Internal notes.                                     |

### 4.4 Operational Location

One model supports branches, warehouse, Head Office, commissary, project sites, pop-ups, and sublocations.

| Field                                          | Required | Notes                                                                                  |
| ---------------------------------------------- | -------: | -------------------------------------------------------------------------------------- |
| `company_id`, `location_code`, `location_name` |      Yes | Code unique per company.                                                               |
| `brand_id`                                     |       No | Nullable for shared sites.                                                             |
| `location_type`                                |      Yes | `branch`, `warehouse`, `commissary`, `head_office`, `project_site`, `pop_up`, `other`. |
| `parent_location_id`                           |       No | Supports branch kitchen, bar, quarantine area, etc.                                    |
| `mall_or_landlord`, `address`                  |       No | Branch / project information.                                                          |
| `operating_timezone`                           |      Yes | Defaults to company setting.                                                           |
| `is_inventory_location`                        |      Yes | Controls stock posting eligibility.                                                    |
| `is_sales_location`                            |      Yes | Future POS mapping flag.                                                               |
| `is_project_location`                          |      Yes | Expansion project flag.                                                                |
| `assigned_warehouse_location_id`               |       No | Replenishment source.                                                                  |
| `opening_date`                                 |       No | Branch detail.                                                                         |
| `status`                                       |      Yes | `planned`, `active`, `temporarily_closed`, `inactive`, `closed`.                       |

### 4.5 Department and Cost Center

| Entity      | Required fields                                                                    | Notes                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Department  | `company_id`, `department_code`, `department_name`, `status`                       | Optional parent department and default cost center.                                                                          |
| Cost Center | `company_id`, `cost_center_code`, `cost_center_name`, `cost_center_type`, `status` | May point to location and / or department. Types: `branch`, `department`, `warehouse`, `project`, `shared_service`, `other`. |

---

## 5. Identity, Roles, and Access Data

### 5.1 User

| Field                                                   | Required | Notes                                                   |
| ------------------------------------------------------- | -------: | ------------------------------------------------------- |
| `tenant_id`, `full_name`, `email`, `default_company_id` |      Yes | Email unique per tenant.                                |
| `employee_code`, `mobile_number`, `job_title`           |       No | Optional integration / display fields.                  |
| `default_location_id`                                   |       No | Default landing scope.                                  |
| `account_status`                                        |      Yes | `invited`, `active`, `locked`, `suspended`, `inactive`. |
| `last_login_at`, `mfa_enabled`                          | No / Yes | Security data.                                          |

### 5.2 Role, Permission, and Assignment

| Entity                | Required fields                                                                       | Notes                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                  | `tenant_id`, `role_code`, `role_name`, `role_group`, `status`                         | Tenant-owned catalog. Groups: executive, Head Office, branch, warehouse, project, audit, system.                                                   |
| Permission            | `permission_key`, `module`, `action`                                                  | Includes `core.tenant_role_administer` for tenant role administration; other examples include `purchase_request.submit`, `purchase_order.approve`, and `purchase_order.issue`. |
| User Role Assignment  | `user_id`, `role_id`, `effective_from`, `effective_to`, `assignment_status`           | Tenant-global through its user and tenant-owned role; it currently has no `company_id`. Supports time-bound coverage.                              |
| User Scope Assignment | `user_id`, `scope_type`, `scope_id`, `access_level`, `effective_from`, `effective_to` | Scope types: tenant, company, brand, location, department, cost center, project.                                                                  |

`DEC-0043` preserves the tenant-global `UserRoleAssignment` representation. The operator's selected company is an administration context, not an assignment field. Before any role action concerning a target user, the service must verify an active target account and at least one active, currently effective `COMPANY` scope for that company or `LOCATION` scope to an active location owned by that company. `default_company_id` alone is not company membership. Onboarding with `initialRoleId` must create the selected-company scope and role assignment atomically. A future `company_id` or equivalent role-assignment binding requires a separate confirmed decision and migration plan.

### 5.3 High-Risk Scope Request

Current implementation adds `HighRiskScopeRequest` as the controlled approval artifact for high-risk and Manage-level location scope grants. It records the request and review decision separately from the actual `UserScopeAssignment`; approval creates the active scope assignment transactionally and audit history links the grant to `DEC-0036`.

| Field                                                      | Required | Notes                                                                  |
| ---------------------------------------------------------- | -------: | ---------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `target_user_id`, `location_id` |      Yes | Company-scoped target user and location.                               |
| `access_level`                                             |      Yes | Requested location access level.                                       |
| `status`                                                   |      Yes | Service-controlled value such as `PENDING`, `APPROVED`, or `REJECTED`. |
| `reason`, `evidence_reference`                             |      Yes | Required request justification and traceable evidence reference.       |
| `requested_by_user_id`                                     |      Yes | Requesting admin. Must not approve their own request.                  |
| `reviewed_by_user_id`, `review_reason`, `reviewed_at`      |       No | Decision actor and rationale for approved/rejected requests.           |
| `created_at`, `updated_at`                                 |      Yes | Lifecycle metadata. Transitions write `AuditEvent` rows.               |

### 5.4 Sensitive Role Request

Current implementation adds `SensitiveRoleRequest` as the controlled approval artifact for admin, approver, system, and sensitive-permission role grants. It records the request and review decision separately from the actual `UserRoleAssignment`; approval creates the active tenant-global role assignment transactionally, writes audit history linked to `DEC-0036`, requires privileged MFA evidence, and refreshes the target user's privilege epoch so stale sessions must reauthenticate. Its `company_id` records the selected-company request/review context and target eligibility boundary under `DEC-0043`; it does not company-bind the resulting `UserRoleAssignment`.

| Field                                                  | Required | Notes                                                                                                      |
| ------------------------------------------------------ | -------: | ---------------------------------------------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `target_user_id`, `role_id` |      Yes | Company-scoped target user and requested role.                                                             |
| `status`                                               |      Yes | Service-controlled value such as `PENDING`, `APPROVED`, or `REJECTED`.                                     |
| `reason`, `evidence_reference`                         |      Yes | Required request justification and traceable evidence reference.                                           |
| `requested_by_user_id`                                 |      Yes | Requesting admin. Must not approve their own request or request a sensitive role for themselves.           |
| `reviewed_by_user_id`, `review_reason`, `reviewed_at`  |       No | Separate decision actor and rationale for approved/rejected requests.                                      |
| `created_at`, `updated_at`                             |      Yes | Lifecycle metadata. Transitions write `AuditEvent` rows; approval creates the linked `UserRoleAssignment`. |

### 5.5 Break-Glass Access Grant

Current implementation adds `BreakGlassAccessGrant` as the auditable register for emergency, time-boxed ERP location-scope access. It is not routine onboarding or permanent scope configuration. Approval creates a temporary `UserScopeAssignment`; revocation or expiry deactivates that assignment and refreshes the target user's privilege epoch.

| Field                                                                                                                         | Required | Notes                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `target_user_id`, `location_id`                                                                    |      Yes | Company-scoped target user and emergency location scope.                                                        |
| `access_level`                                                                                                                |      Yes | Temporary access level granted after approval.                                                                  |
| `status`                                                                                                                      |      Yes | Service-controlled lifecycle: `PENDING_REVIEW`, `ACTIVE`, `REVOKED`, `EXPIRED`, `REJECTED`, or `POST_REVIEWED`. |
| `reason`, `evidence_reference`, `requested_until`                                                                             |      Yes | Emergency justification, traceable evidence, and expiry. Pilot maximum duration is 24 hours.                    |
| `assignment_id`                                                                                                               |       No | Temporary `UserScopeAssignment` created only when access is activated.                                          |
| `requested_by_user_id`                                                                                                        |      Yes | Requesting admin. Self-request is blocked.                                                                      |
| `approved_by_user_id`, `approval_reason`, `approved_at`                                                                       |       No | Separate reviewer and approval rationale. Self-approval is blocked.                                             |
| `revoked_by_user_id`, `revocation_reason`, `revoked_at`                                                                       |       No | Manual revocation or automatic expiry closure metadata.                                                         |
| `post_reviewed_by_user_id`, `post_review_outcome`, `post_review_reason`, `post_review_evidence_reference`, `post_reviewed_at` |       No | Post-use review outcome and evidence. Self-review is blocked.                                                   |
| `created_at`, `updated_at`                                                                                                    |      Yes | Lifecycle metadata. Every transition writes `AuditEvent` rows linked to `DEC-0036`.                             |

### 5.6 Company Policy Setting

Current implementation adds `CompanyPolicySetting` as the company-scoped configuration registry for DEC-0036 pilot defaults and later controlled overrides. This table stores typed JSON values for configurable policy, not workflow transaction records. Workflow services must still enforce permissions, approval state, scope, audit, and inventory-ledger controls when they consume these settings.

Implemented DEC-0036 default keys include purchasing approval/quotation/emergency controls, supplier PO eligibility, stock-count cadence, lot/expiry category requirements, opening-balance evidence, payment-release evidence and settlement requirements, budget source-hook rollout policy, cash-advance recovery policy, expense-request handoff policy, period-close reopen window, reporting trust gates, project visibility/blocker rules, release readiness flags, and security/continuity defaults. Finance defaults include `finance.budget.source_hook_policy`, which keeps PR/PO/AP/expense budget source hooks in warning-only commitment-projection mode until source-line backfill and UAT signoff approve any hard-block rollout, `finance.cash_advance.recovery_policy`, which defines due-soon, overdue escalation, evidence, and UAT gates for employee/custodian advance follow-up without enabling production collection actions before UAT, `finance.expense_request.handoff_policy`, which requires Expense Request → AP Draft → Payment Request lineage while blocking direct payment and settlement mutation before UAT, and `finance.payment_release.settlement_policy`, which allows manual evidence-backed release control and reconciliation matching while blocking AP settlement, bank API mutation, and journal posting before UAT. Security defaults include `security.privileged_mfa.enforcement_mode` for evidence-backed sensitive-action guard behavior, `security.evidence_storage.default_policy` for environment-isolated controlled evidence, MIME allowlisting, required malware scanning before hosted availability, preservation pending an approved retention policy, paired database/evidence recovery, and download auditing, `security.retention.matrix` for retention and PII/export redaction policy, and `security.backup_restore.default_policy` for daily encrypted backup, offsite copy, checksum, quarterly restore rehearsal, and pre-release backup/restore evidence requirements. Local development may use only the explicit test-clean adapter; there is no hosted scan waiver. Demo and pilot seed data creates missing company-scoped defaults so admins can inspect the active baseline immediately; reseeding refreshes labels/default metadata without overwriting existing company-specific override values.

| Field                                                      | Required | Notes                                                                                        |
| ---------------------------------------------------------- | -------: | -------------------------------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `key`                           |      Yes | Company-scoped unique policy key.                                                            |
| `category`, `label`, `description`                         |      Yes | Human-readable grouping and explanation for admin UI.                                        |
| `value`, `default_value`, `value_type`                     |      Yes | Current value, recommended default, and type such as boolean, number, select, text, or JSON. |
| `unit`, `options`                                          |       No | Display unit or selectable values for constrained settings.                                  |
| `source_decision_id`                                       |      Yes | Defaults to `DEC-0036` for current configurable pilot policy.                                |
| `is_default`                                               |      Yes | Indicates whether the current value still matches the recommended default.                   |
| `updated_by_user_id`, `created_at`, `updated_at`, `status` | Yes / No | Override actor and lifecycle metadata. Changes are audited through `AuditEvent`.             |

### 5.7 Privileged MFA Enrollment

Current implementation adds `PrivilegedMfaEnrollment` as the ERP-side evidence register for MFA enrollment of users with sensitive permissions. It is not runtime MFA enforcement and does not store secrets, device keys, recovery codes, passwords, or identity-provider tokens.

| Field                                                     | Required | Notes                                                                              |
| --------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `target_user_id`               |      Yes | Company-scoped privileged user being tracked.                                      |
| `provider_name`, `provider_subject`                       | Yes / No | External MFA or identity provider name and optional opaque provider reference.     |
| `status`                                                  |      Yes | Service-controlled lifecycle: `PENDING_VERIFICATION`, `VERIFIED`, or `REVOKED`.    |
| `evidence_reference`, `attestation_note`                  |      Yes | Plain-text external evidence reference and admin attestation.                      |
| `attested_by_user_id`, `attested_at`                      |      Yes | Attesting admin and timestamp. Self-attestation is blocked.                        |
| `verified_by_user_id`, `verification_note`, `verified_at` |       No | Separate verifier and rationale. Verifier must not be the target user or attester. |
| `revoked_by_user_id`, `revocation_reason`, `revoked_at`   |       No | Revocation actor and reason.                                                       |
| `source_decision_id`, `created_at`, `updated_at`          |      Yes | Defaults to `DEC-0036`; transitions write `AuditEvent` rows.                       |

### 5.8 Auth Session Invalidation

Current implementation adds `AuthSessionInvalidation` as the provider-neutral evidence register for session invalidation required by privilege changes. Local PostgreSQL-backed application sessions are revoked transactionally and record `APPLICATION_COMPLETED`; an external identity provider records `PENDING_PROVIDER` until a separate administrator confirms provider completion evidence.

| Field                                                 |       Required | Notes                                                                            |
| ----------------------------------------------------- | -------------: | -------------------------------------------------------------------------------- |
| `tenant_id`, `target_user_id`                         |            Yes | User whose active sessions must be invalidated.                                  |
| `company_id`                                          |             No | Company context for the privilege change when available.                         |
| `requested_by_user_id`                                |             No | Actor that caused the invalidation when available.                               |
| `status`                                              |            Yes | `APPLICATION_COMPLETED`, `PENDING_PROVIDER`, or `PROVIDER_COMPLETED`.             |
| `reason`, `source_event_type`, `source_record_id`     | Yes / Yes / No | Why invalidation was required and the source action or record.                   |
| `demo_epoch_enforced`                                 |            Yes | Legacy field indicating the application privilege epoch is enforced locally.     |
| `provider_name`, `provider_reference`, `completed_at` |             No | External auth-provider completion metadata when configured.                      |
| `created_at`, `updated_at`                            |            Yes | Queue/register timestamps.                                                       |

### 5.9 Production Authentication Records

`DEC-0040` adds tenant-qualified local identities, Argon2id password credentials, encrypted runtime TOTP authenticators, individually hashed recovery codes, opaque database sessions, one-time activation tokens, durable login-attempt records, and controlled account-recovery requests. These records authenticate an internal `User`; ERP roles and scopes remain separate server-side authorization sources.

| Record | Required scope and key fields | Control purpose |
| --- | --- | --- |
| `Tenant.login_code` | Unique organization login code | Qualifies local identifiers so the same email or username cannot be resolved across tenants. |
| `User.privilege_epoch` | Monotonic integer | Invalidates sessions issued before a role, scope, credential, MFA, status, recovery, or break-glass security change. |
| `AuthIdentity` | `tenant_id`, `user_id`, provider, normalized identifier, optional immutable provider subject, status | Provider-neutral identity linked to one internal ERP user; future OIDC linking must not rely on email alone. |
| `PasswordCredential` | identity, Argon2id hash, algorithm, password-change metadata | Stores only the encoded password hash; never plaintext passwords. |
| `MfaAuthenticator` | tenant, user, encrypted secret, IV, authentication tag, key version, status, last-used counter | Stores an AES-GCM-encrypted TOTP secret and prevents timestep replay. |
| `MfaRecoveryCode` | authenticator, unique keyed hash, consumed timestamp | One-time recovery; raw codes are shown once and never stored. |
| `AuthSession` | tenant, user, token hash, status, assurance, MFA timestamp, privilege epoch, idle/absolute expiry, challenge failure count/lock, revocation | Server-revocable opaque browser session. Raw session tokens exist only in the secure cookie; assurance rotation preserves absolute expiry. |
| `AuthActivationToken` | tenant, target user, issuer, token hash, expiry, status, consumed timestamp, delivery state/attempts | Single-use 30-minute activation or approved recovery link delivered directly to account email. Only its hash is stored; retry revokes the failed token and creates a replacement. |
| `AuthLoginAttempt` | keyed tenant/account/source digests, attempt type, optional challenge-session ID, outcome, timestamp | Durable restart-safe password and MFA throttling without storing raw identifiers, source addresses, passwords, TOTP values, or recovery codes. |
| `AuthRecoveryRequest` | tenant, company, target, requester, reviewer, reset scope, reason, evidence, status, timestamps | Dual-control password/lost-device recovery; approval revokes prior sessions and optionally the old authenticator before issuing activation. |
| `AuthBootstrapState` | tenant primary key, target user, authorization reference, issued timestamp | Permanent one-time marker for the approved first-administrator ceremony; repeat, alternate-user, non-admin, and later recovery use is refused. |

Database constraints enforce lowercase unique tenant login codes, tenant-qualified identity/session/activation/recovery relationships, one active MFA authenticator per user, one active activation token per user, and one pending recovery request per tenant/user across companies. These constraints are authoritative backstops; service authorization and workflow checks remain required.

### 5.10 Release Readiness Gate

Current implementation adds `ReleaseReadinessGate` as the company-scoped gate-status register for UAT, deployment, enablement, privileged security controls, and GO / NO-GO readiness evidence. It records whether a release gate is pending, in progress, ready, conditionally ready, held, or waived. It does not replace MFA enrollment records, break-glass access evidence, the signed evidence pack, deployment checklist, training assessment, release notes, or final release-board decision documents.

Current implementation also adds `UatEvidenceRecord` as the company-scoped UAT evidence register for scenario execution, defect disposition, policy version trace, signed acceptance matrix, and default revision evidence. It stores evidence type, title, workflow area, tester, environment, evidence reference, result, execution date/time, policy version, defect reference, verification status, verifier/rejecter, notes, creator, audit trail, and DEC-0036 source reference. It stores references to approved UAT artifacts rather than binary files. UAT readiness gates consume this register and require verified evidence with no unresolved failed or blocked results before `READY`.

Current implementation also adds `DeploymentEvidenceRecord` as the company-scoped release evidence register for migration, backup, restore rehearsal, rollback plan, smoke-test, and monitoring/hypercare evidence. It stores evidence type, title, environment, evidence reference, performed date/time, performer, verification status, verifier/rejecter, notes, creator, audit trail, and DEC-0036 source reference. It stores references to approved artifacts or external evidence, not backup files, database dumps, screenshots, or binary attachments themselves. Deployment readiness gates consume this register and require verified evidence before `READY`; incomplete evidence must be handled as `CONDITIONAL_GO`, `WAIVED`, or `HOLD` with decision notes.

Current implementation also adds `EnablementEvidenceRecord` as the company-scoped enablement evidence register for training signoff, known-limit acknowledgement, support-route confirmation, KB review, release-note review, and training-impact assessment. It stores evidence type, title, audience/role, evidence reference, owner/trainer, completion date/time, known-limit acknowledgement flag, support-route confirmation flag, verification status, verifier/rejecter, notes, creator, audit trail, and DEC-0036 source reference. It stores references to approved attendance sheets, articles, release notes, training impact assessments, or signoff artifacts, not binary files themselves. Enablement readiness gates consume this register and require verified evidence before `READY`.

Current implementation also adds `ReleaseBoardDecision` as the company-scoped GO / NO-GO decision register. It stores the board outcome (`GO`, `CONDITIONAL_GO`, `HOLD`, `ROLLBACK`, or `FORWARD_FIX`), decision note, evidence reference, participants, decision timestamp, chair user, audit trail, and DEC-0036 source reference. The GO / NO-GO readiness gate consumes the latest board decision and cannot be marked `READY` without a latest `GO` decision, `CONDITIONAL_GO` without a latest conditional decision, or `WAIVED` without a latest `HOLD` decision.

| Field                                                   | Required | Notes                                                                                                      |
| ------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------- |
| `tenant_id`, `company_id`, `gate_key`                   |      Yes | Company-scoped unique readiness gate key.                                                                  |
| `category`, `title`, `description`, `owner_role`        |      Yes | Human-readable gate grouping, purpose, and accountable owner role.                                         |
| `status`                                                |      Yes | Controlled service value: `PENDING`, `IN_PROGRESS`, `READY`, `CONDITIONAL_GO`, `HOLD`, or `WAIVED`.        |
| `required_by_policy`                                    |      Yes | Derived from configured DEC-0036 release policy where applicable.                                          |
| `evidence_reference`                                    |       No | Required by service for `READY`, `CONDITIONAL_GO`, and `WAIVED`. Points to external or generated evidence. |
| `decision_note`, `blocker_summary`                      |       No | Decision note required for conditional/waived gates; blocker summary required for hold gates.              |
| `target_date`, `signed_off_at`, `signed_off_by_user_id` |       No | Planning and signoff metadata.                                                                             |
| `source_decision_id`, `created_at`, `updated_at`        |      Yes | Defaults to `DEC-0036`; updates are audited through `AuditEvent`.                                          |

---

## 6. Supplier and Item Master Data

### 6.1 Supplier

Current Phase I scaffold implements the initial source-of-truth subset: `tenant_id`, `company_id`, `supplier_code`, `legal_name`, `trading_name`, `tax_identifier`, lifecycle `status`, `accreditation_status`, `payment_terms`, primary operational contact fields, supplier-item links, and reference price history. Lifecycle `status` keeps records active/inactive/archived; `accreditation_status` controls PO eligibility through configurable DEC-0036 supplier policy. Supplier type, document attachments, and emergency eligibility exception controls remain required future slices.

| Field                                                       | Required | Notes                                                                                                                               |
| ----------------------------------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `company_id`, `supplier_code`, `legal_name`, `display_name` |      Yes | Supplier code unique per company.                                                                                                   |
| `supplier_type`                                             |      Yes | Food, beverage, packaging, non-food, equipment, service, construction, marketing, IT, other.                                        |
| `tax_id`, `address`, contact fields                         |       No | Restricted where appropriate.                                                                                                       |
| `payment_terms_days`, `currency_code`                       | No / Yes | Default commercial terms.                                                                                                           |
| `accreditation_status`                                      |      Yes | `PENDING_REVIEW`, `APPROVED`, `SUSPENDED`, or `BLOCKED`. Normal PO creation/submission/issue defaults to `APPROVED` suppliers only. |
| `accreditation_expiry_date`                                 |       No | Compliance alert field.                                                                                                             |
| `preferred_supplier_flag`                                   |      Yes | Informational only; does not bypass controls.                                                                                       |

### 6.2 Item Category

Current Phase I scaffold implements company-scoped category creation with expiry, lot, and wastage-photo defaults. Hierarchy and controlled edits beyond creation are deferred until broader master-data governance screens are implemented.

| Field                                                             | Required | Notes                                                                                           |
| ----------------------------------------------------------------- | -------: | ----------------------------------------------------------------------------------------------- |
| `company_id`, `category_code`, `category_name`, `inventory_class` |      Yes | `food`, `beverage`, `packaging`, `supplies`, `smallwares`, `equipment`, `maintenance`, `other`. |
| `parent_category_id`                                              |       No | Category hierarchy.                                                                             |
| `requires_expiry_tracking`, `requires_lot_tracking`               |      Yes | Default item behavior; item may override.                                                       |
| `default_wastage_requires_photo`                                  |      Yes | Control setting.                                                                                |
| `status`                                                          |      Yes | `active`, `inactive`.                                                                           |

### 6.3 Unit of Measure

Current Phase I scaffold implements company-scoped UOM creation and item-level conversion creation. UOM usage in PR, PO, receiving, and inventory posting is not enabled until item validation is wired into those workflows.

| Field                                                                 | Required | Notes                                  |
| --------------------------------------------------------------------- | -------: | -------------------------------------- |
| `company_id`, `uom_code`, `uom_name`, `uom_type`, `decimal_precision` |      Yes | Example codes: KG, G, L, ML, PC, CASE. |
| `status`                                                              |      Yes | `active`, `inactive`.                  |

### 6.4 Inventory Item

Current Phase I scaffold implements item creation with category, base/purchase/issue UOM references, tracking flags, receiving-inspection flag, supplier-item references, and audit history. Location settings, standard cost, barcodes, and transactional stock effects remain deferred.

| Field                                                                   | Required | Notes                                          |
| ----------------------------------------------------------------------- | -------: | ---------------------------------------------- |
| `company_id`, `item_code`, `item_name`, `item_category_id`, `item_type` |      Yes | Code unique per company.                       |
| `base_uom_id`                                                           |      Yes | Ledger and balance unit.                       |
| `purchase_uom_id`, `issue_uom_id`                                       |       No | Procurement and consumption convenience.       |
| `track_inventory`, `track_expiry`, `track_lot`                          |      Yes | Item control flags.                            |
| `requires_receiving_inspection`                                         |      Yes | Quality / receiving control.                   |
| `min_stock_level`, `max_stock_level`, `reorder_point`                   |       No | Optional Phase I alerts.                       |
| `default_supplier_id`, `standard_cost`                                  |       No | Reference fields only.                         |
| `status`                                                                |      Yes | `draft`, `active`, `inactive`, `discontinued`. |

### 6.5 Item UOM Conversion

| Field                                                      | Required | Notes                            |
| ---------------------------------------------------------- | -------: | -------------------------------- |
| `item_id`, `from_uom_id`, `to_uom_id`, `conversion_factor` |      Yes | `1 from_uom = factor × to_uom`.  |
| `rounding_rule`                                            |      Yes | `none`, `up`, `down`, `nearest`. |
| `status`                                                   |      Yes | `active`, `inactive`.            |

### 6.6 Supplier Item Reference

Current Phase I scaffold implements active supplier-to-item purchase UOM links, optional supplier SKU/name, lead time, minimum order quantity, preferred rank, optional reference unit price, deactivation with reason, and audit history. It does not yet make these links eligible for quote comparison, purchase orders, receiving, or supplier exception approval.

| Field                                                           | Required | Notes                       |
| --------------------------------------------------------------- | -------: | --------------------------- |
| `supplier_id`, `item_id`, `purchase_uom_id`                     |      Yes | Supplier-item relationship. |
| `supplier_sku`, `supplier_item_name`                            |       No | Supplier reference.         |
| `currency_code`, `unit_price`, `effective_from`, `effective_to` |       No | Historical reference price. |
| `lead_time_days`, `minimum_order_quantity`                      |       No | Optional procurement data.  |
| `status`                                                        |      Yes | `active`, `inactive`.       |

---

## 7. Approval Configuration Data

### 7.1 Approval Policy

| Field                                                               | Required | Notes                                                              |
| ------------------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| `company_id`, `policy_code`, `transaction_type`, `name`, `priority` |      Yes | Lower priority number evaluated first.                             |
| `conditions_json`                                                   |      Yes | Branch, amount, department, urgency, budget status, category, etc. |
| `effective_from`, `effective_to`                                    |       No | Policy lifespan.                                                   |
| `is_active`                                                         |      Yes | Enable / disable.                                                  |

### 7.2 Approval Step Template

| Field                                                                        | Required | Notes                                                                                                        |
| ---------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------ |
| `approval_policy_id`, `sequence_no`, `approver_source`, `approver_reference` |      Yes | Source can be role_scope, requester_manager, location_manager, department_head, named_user, rule expression. |
| `min_approvers_required`                                                     |      Yes | Usually one.                                                                                                 |
| `can_approve_in_parallel`                                                    |      Yes | Optional.                                                                                                    |
| `sla_hours`, `escalation_rule_json`                                          |       No | Reminder and escalation.                                                                                     |
| `delegation_allowed`                                                         |      Yes | Default true for normal approvers.                                                                           |

### 7.3 Approval Instance and Action

| Entity            | Required fields                                                                                                                 | Notes                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Approval Instance | `company_id`, `transaction_type`, `transaction_id`, `approval_policy_id`, `current_step_no`, `approval_status`, `snapshot_json` | Snapshot protects historical rule integrity.                                                                         |
| Approval Action   | `approval_instance_id`, `step_no`, `action`, `acted_by_user_id`                                                                 | Actions: pending, approved, rejected, returned, skipped, escalated, expired. `remarks` required for reject / return. |

---

## 8. Purchasing Transaction Data

### 8.1 Purchase Request Header

| Field                                                                  |    Required | Notes                                                        |
| ---------------------------------------------------------------------- | ----------: | ------------------------------------------------------------ |
| `company_id`, `pr_number`, `request_date`, `requested_by_user_id`      |         Yes | Required identity.                                           |
| `requesting_department_id`, `requesting_location_id`, `cost_center_id` |         Yes | Required scope.                                              |
| `brand_id`, `project_id`                                               |          No | Nullable for shared / future project requests.               |
| `request_type`, `urgency_level`, `purpose`                             |         Yes | Standard, replenishment, emergency, capital, service, other. |
| `required_by_date`, `budget_status`                                    |    No / Yes | Budget status defaults `unknown`.                            |
| `emergency_reason`, `emergency_authorized_by_user_id`                  | Conditional | Required for emergency flow.                                 |
| `status`, `approval_instance_id`                                       |    Yes / No | Status values below.                                         |

**PR statuses:** `draft`, `submitted`, `returned`, `pending_approval`, `approved`, `partially_converted`, `converted`, `rejected`, `cancelled`, `closed`.

### 8.2 Purchase Request Line

| Field                                            |    Required | Notes                                                                                                                                  |
| ------------------------------------------------ | ----------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| `purchase_request_id`, `line_no`                 |         Yes | Unique line number per request.                                                                                                        |
| `item_id` or `free_text_description`             |         Yes | One is required.                                                                                                                       |
| `item_category_id`                               | Conditional | Required for free-text items.                                                                                                          |
| `requested_quantity`, `uom_id`                   |         Yes | Quantity > 0.                                                                                                                          |
| `estimated_unit_cost`, `estimated_total_cost`    |          No | Required where policy needs estimate.                                                                                                  |
| `preferred_supplier_id`, `inventory_location_id` |          No | Supplier and target stock location.                                                                                                    |
| `budget_line_id`                                 |          No | Optional Phase 3 budget allocation dimension for warning-first budget control. It does not hard-block or create commitments by itself. |
| `reason_or_specification`                        | Conditional | Required for service / non-standard / free text.                                                                                       |
| `converted_quantity`, `line_status`              |         Yes | Conversion tracking.                                                                                                                   |

### 8.2.1 Purchase Request Comment

Current Phase I scaffold implements scoped Purchase Request comments with author, body, timestamp, and audit event creation. Comment deletion, attachments, mentions, notification fanout, and rich-text formatting remain deferred.

| Field                                                              | Required | Notes                                              |
| ------------------------------------------------------------------ | -------: | -------------------------------------------------- |
| `purchase_request_id`, `tenant_id`, `company_id`, `author_user_id` |      Yes | Enforced through the scoped PR read path.          |
| `body`, `created_at`                                               |      Yes | Body is plain text and retained for audit context. |

### 8.3 Supplier Quote and Quotation Comparison

Current Phase I scaffold implements approved-Purchase-Request quote capture with `quotation_request`, `supplier_quotation`, and `supplier_quotation_line` records scoped by tenant/company and selected location context. It records supplier, quote reference/date, currency from company configuration, quantity, UOM, unit price, line total, availability, lead time, terms, notes, and audit reason. It also highlights the lowest recorded cost and supports scoped quote CSV export. Formal supplier recommendation is recorded through `quotation_recommendation`, which stores the selected supplier quote, evaluated-total snapshot, quote count, selection reason, conditional non-lowest justification, conditional single-source or quote-shortfall justification, status, version, and evaluation snapshot. Recommendation creation consumes the configurable quotation threshold and minimum quote-count policy; requests at or above the threshold require the configured quote count or a documented shortfall justification. Recommendation submission creates a configurable approval instance for supplier-selection approval before PO conversion. Quote attachments and supplier eligibility exceptions remain deferred.

| Entity                   | Required fields                                                                                                                                                                                                                                                                              | Notes                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier Quote           | `company_id`, `rfq_number`, `supplier_id`, `request_date`, `currency_code`, `status`                                                                                                                                                                                                         | Captures quote reference, validity, lead time, terms, charges, attachment.                                                                                                                                                                                           |
| Supplier Quote Line      | `supplier_quotation_id`, `line_no`, `quoted_quantity`, `uom_id`, `unit_price`, `line_total_amount`, `availability_status`                                                                                                                                                                    | Supports substitutes explicitly.                                                                                                                                                                                                                                     |
| Quotation Recommendation | `tenant_id`, `company_id`, `quotation_request_id`, `selected_supplier_quotation_id`, `prepared_by_user_id`, `status`, `currency_code`, `selected_evaluated_total`, `lowest_evaluated_total`, `quote_count`, `is_lowest_evaluated_cost`, `selection_reason`, `evaluation_snapshot`, `version` | Selection reason is always required. Non-lowest justification is required when the selected quote is not the lowest evaluated cost. Single-source or quote-shortfall justification is required when the recommendation has too few quotes for the configured policy. |

### 8.4 Purchase Order Header

| Field                                                                                 | Required | Notes                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `company_id`, `po_number`, `supplier_id`                                              |      Yes | Supplier must be active / eligible.                                                                                                                                                  |
| `ordering_location_id`, `delivery_location_id`, `department_id`, `cost_center_id`     |      Yes | Operational and financial scope.                                                                                                                                                     |
| `purchase_request_id`, `quotation_comparison_id`                                      |       No | Required according to process policy.                                                                                                                                                |
| `brand_id`, `project_id`                                                              |       No | Future-ready scope.                                                                                                                                                                  |
| `po_date`, `currency_code`, `grand_total_amount`, `status`                            |      Yes | Monetary values are calculated.                                                                                                                                                      |
| `expected_delivery_date`, `payment_terms_days`, `terms_and_conditions`                |       No | Commercial data.                                                                                                                                                                     |
| `approval_instance_id`, `supplier_acknowledged_at`                                    |       No | Workflow / acknowledgement.                                                                                                                                                          |
| `cancellation_subtype`, `cancellation_reason`, `cancelled_at`, `cancelled_by_user_id` |       No | Populated for controlled terminal paths. Valid cancellation subtypes are `approval_rejected`, `pre_receiving_cancellation`, `remaining_balance_closure`, and `unknown_unclassified`. |

**PO statuses:** `draft`, `pending_approval`, `approved`, `issued`, `acknowledged`, `partially_received`, `fully_received`, `closed`, `cancelled`, `superseded`.

Current Phase I scaffold implements the controlled PO foundation through `purchase_order`, `purchase_order_line`, approval instance, and audit records. A draft PO can be created only from an approved quotation recommendation and stores PR, quotation request, recommendation, selected supplier quote, active supplier, delivery location, department/cost center, line snapshots, totals, source snapshot, creator, and audit event. Implemented workflow statuses are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `AMENDMENT_PENDING`, receiving-driven `PARTIALLY_RECEIVED` / `FULLY_RECEIVED`, `CANCELLED`, and `CLOSED`; returned POs move back to `DRAFT`. Supplier issue/send moves an approved PO to `ISSUED` and records issuer, timestamp, controlled method (`Email`, `Printed copy`, `Supplier portal`, or `Manual handoff`), recipient/reference, and remarks in audit metadata. The PO list, CSV export, and supplier copy derive latest issue/re-send evidence, including recorder name, from audit history and export ordered, received, closed/cancelled, and open quantity/value summaries so `FULLY_RECEIVED` and `CLOSED` remain operationally distinct. PO status export includes derived terminal subtype, reason, and cancellation/closure timestamp for approved rejection, pre-receiving cancellation, remaining-balance closure, or unknown legacy terminal records. Approved, issued, received, and closed POs expose a scoped printable supplier copy without creating inventory movement or receipt records; draft, pending, and cancelled POs do not expose the supplier-copy route. Operational cancellation is implemented only before receiving: scoped `DRAFT`, `APPROVED`, and `ISSUED` POs can be cancelled with reason when no Receiving Report exists and no line has received quantity. Cancellation sets each PO line's `cancelled_quantity` to the remaining ordered quantity, records `pre_receiving_cancellation`, writes an audit event, and creates no inventory movement or balance update. Bounded amendment is implemented only before receiving: an `ISSUED` PO with no Receiving Report, no received quantity, no pending closure, and no pending amendment may request approval-backed same-line quantity, unit price, line note, and expected delivery date changes. The request stores before/proposed snapshots, requires reason plus supplier notice reference or unavailable explanation, moves the PO to `AMENDMENT_PENDING`, blocks receiving, and writes audit history. Approval applies the proposal and returns the PO to `ISSUED`; return or rejection restores `ISSUED` without line mutation. Remaining-balance closure is implemented for `PARTIALLY_RECEIVED` POs only: it requires approval, a reason, supplier notice reference or unavailable explanation, no draft Receiving Report, and no duplicate pending closure. Approval sets remaining line quantities to `cancelled_quantity`, records `remaining_balance_closure`, and moves the PO to `CLOSED` without changing received quantities or creating inventory movement. PO approval rejection records `approval_rejected`. Full post-receiving PO amendment and supplier/location/line-add/delete/substitution/payment-term amendment remain deferred controlled transitions.

### 8.4.0 Purchase Order Amendment

| Entity                   | Key Fields                                                                                                                                                                                                                                                                               | Notes                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Purchase Order Amendment | `tenant_id`, `company_id`, `purchase_order_id`, `requested_by_user_id`, `approved_by_user_id`, `status`, `reason`, `supplier_notice_reference`, `supplier_notice_unavailable_reason`, `before_snapshot`, `proposed_snapshot`, `requested_at`, `approved_at`, `rejected_at`, `applied_at` | Statuses: `PENDING_APPROVAL`, `APPROVED`, `RETURNED`, `REJECTED`. Used only for bounded issued/unreceived PO amendment. |

### 8.4.1 Purchase Order Balance Closure

| Data Object                    | Required Fields                                                                                                                                                            | Notes                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Purchase Order Balance Closure | `tenant_id`, `company_id`, `purchase_order_id`, `requested_by_user_id`, `status`, `reason`, `line_snapshot`, `total_closed_quantity`, `total_closed_value`, `requested_at` | Statuses: `PENDING_APPROVAL`, `APPROVED`, `RETURNED`, `REJECTED`, `CANCELLED`. |
| Supplier Notice Evidence       | `supplier_notice_reference` or `supplier_notice_unavailable_reason`                                                                                                        | One is required before submitting closure for approval.                        |
| Approval Outcome               | `approved_by_user_id`, `approved_at`, `rejected_at`, `rejection_reason`                                                                                                    | Return or reject closes the closure request but does not mutate the PO.        |

`DEC-0020` confirms approval-backed remaining-balance closure. The closure record snapshots outstanding line quantities and value at request and approval time. The PO remains the supplier commitment source of truth, while Receiving Reports and inventory ledger records remain the source of truth for delivered and stocked quantities.

### 8.5 Purchase Order Line

| Field                                                                                     | Required | Notes                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | -------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `purchase_order_id`, `line_no`, `description`, `ordered_quantity`, `uom_id`, `unit_price` |      Yes | Snapshot at order time.                                                                                                                      |
| `item_id`, `source_pr_line_id`                                                            |       No | Required for inventory item / traceability use cases.                                                                                        |
| `discount_amount`, `tax_amount`, `line_total_amount`                                      |      Yes | Calculated values.                                                                                                                           |
| `budget_line_id`                                                                          |       No | Optional Phase 3 budget allocation dimension. May inherit from source PR line and remains non-posting until controlled commitment hooks run. |
| `received_quantity`, `cancelled_quantity`, `line_status`                                  |      Yes | Fulfillment tracking.                                                                                                                        |

---

## 9. Receiving and Inventory Data

### 9.1 Receiving Report Header

| Field                                                                                              |          Required | Notes                                                |
| -------------------------------------------------------------------------------------------------- | ----------------: | ---------------------------------------------------- |
| `company_id`, `rr_number`, `receiving_location_id`, `received_by_user_id`, `received_at`, `status` |               Yes | Core receipt data.                                   |
| `purchase_order_id`, `supplier_id`                                                                 |       Conditional | Required unless authorized direct / emergency route. |
| `supplier_delivery_receipt_number`, `supplier_invoice_number`                                      |                No | External references.                                 |
| `discrepancy_flag`, `discrepancy_summary`                                                          | Yes / Conditional | Summary required if discrepancy exists.              |
| `inspection_required`, `inspection_completed_by_user_id`                                           |          Yes / No | Inspection workflow.                                 |
| `attachment_id`, `remarks`                                                                         |                No | Proof / notes.                                       |

**RR statuses:** `draft`, `in_inspection`, `posted`, `posted_with_discrepancy`, `rejected`, `cancelled`, `reversed`.

Current Phase I scaffold implements Receiving Report capture, posting, and full-document reversal from issued or partially received Purchase Orders. Draft receipts preserve PO, supplier, receiving location, receiver, external delivery reference, line snapshots, accepted/rejected/damaged/short quantities, discrepancy reason and evidence reference for discrepancy lines, destination inventory location, and audit history. Posting creates immutable `RECEIPT_IN` inventory movements only for accepted quantities, updates the balance cache, increments PO line received quantity, and moves the PO to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`. Reversal requires permission and reason, writes linked `REVERSAL` movements, restores PO received quantities/status, and keeps the original receipt and discrepancy history visible. Binary attachment upload, notification fanout, partial line reversal, and advanced inspection approvals remain deferred controlled transitions.

### 9.2 Receiving Report Line

| Field                                                                                                                |    Required | Notes                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------- |
| `receiving_report_id`, `line_no`, `item_id`, `received_quantity`, `accepted_quantity`, `rejected_quantity`, `uom_id` |         Yes | Accepted ≤ received.                                    |
| `purchase_order_line_id`, `ordered_quantity`, `unit_cost`                                                            |          No | PO lineage / receipt cost.                              |
| `lot_number`, `expiry_date`                                                                                          | Conditional | Required per item control.                              |
| `condition_status`                                                                                                   |         Yes | accepted, partial_reject, rejected, pending_inspection. |
| `discrepancy_type`, `discrepancy_reason`                                                                             | Conditional | Required if mismatch.                                   |
| `inventory_destination_location_id`                                                                                  |         Yes | Final stock location.                                   |

### 9.3 Inventory Movement Ledger

Posted movement records are immutable.

| Field                                                                                                                      | Required | Notes                                      |
| -------------------------------------------------------------------------------------------------------------------------- | -------: | ------------------------------------------ |
| `company_id`, `movement_datetime`, `movement_type`, `source_document_type`, `source_document_id`, `item_id`, `location_id` |      Yes | Source traceability.                       |
| `related_location_id`                                                                                                      |       No | Counterparty for transfer.                 |
| `quantity_delta_base_uom`, `base_uom_id`                                                                                   |      Yes | Positive = stock-in; negative = stock-out. |

Current Phase I scaffold implements the quantity-only inventory ledger foundation through inventory locations, immutable inventory movement records, and a balance cache keyed by inventory location, item, and normalized lot/expiry key. It stores source document lineage and idempotency keys and currently posts receiving, receiving-reversal, transfer dispatch, transfer receipt, transfer-receipt reversal, wastage, wastage-reversal, stock-adjustment, count-generated stock-adjustment, and stock-adjustment-reversal movements through controlled workflow services. Inventory movement posting is blocked for an inventory location while an active stock count with movement freeze is in progress, submitted, or in recount for that same location. It does not implement authoritative valuation, GL posting, opening-balance cutover, direct `COUNT_VARIANCE_*` posting, dispatch reversal workflows, or partial receipt-line reversal workflows yet.
| `unit_cost_base_uom`, `value_delta` | No | Cost reference. |
| `lot_number`, `expiry_date` | Conditional | Per item control. |
| `posted_by_user_id`, `posting_status` | Yes | Posted / reversed. |
| `reversal_of_movement_id`, `remarks` | No | Correction traceability. |

**Movement types:** `receipt`, `transfer_out`, `transfer_in`, `wastage`, `adjustment_in`, `adjustment_out`, `count_variance`, `return_to_supplier`, `return_from_branch`, `opening_balance`, `reversal`.

### 9.4 Inventory Balance Cache

| Field                                                                                              |       Required | Notes                                           |
| -------------------------------------------------------------------------------------------------- | -------------: | ----------------------------------------------- |
| `company_id`, `item_id`, `location_id`, `on_hand_quantity_base_uom`, `available_quantity_base_uom` |            Yes | Cache must reconcile to ledger.                 |
| `lot_number`, `expiry_date`                                                                        |    Conditional | Part of identity where tracked.                 |
| `reserved_quantity_base_uom`                                                                       |            Yes | Defaults to zero in Phase I.                    |
| `last_movement_at`, `last_reconciled_at`, `status`                                                 | Yes / No / Yes | Status: active, quarantined, expired, inactive. |

### 9.5 Transfer Order and Line

| Entity                | Required fields                                                                                                                                                                                                                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transfer Header       | `tenant_id`, `company_id`, `public_reference`, `source_location_id`, `destination_location_id`, `requested_by_user_id`, `dispatched_by_user_id`, `received_by_user_id`, `transfer_type`, `purpose`, `required_by_date`, `status`, `submitted_at`, `dispatched_at`, `received_at`                          | Source and destination must differ. Current implementation supports request submission, source dispatch, and event-backed destination receipt.                                                                                                                                                                                                                                                   |
| Transfer Line         | `inventory_transfer_id`, `line_no`, `source_inventory_location_id`, `destination_inventory_location_id`, `item_id`, `requested_quantity`, `approved_quantity`, `prepared_quantity`, `dispatched_quantity`, `received_quantity`, `rejected_quantity`, `damaged_quantity`, `discrepancy_quantity`, `uom_id` | Dispatch increments `dispatched_quantity` and posts `TRANSFER_OUT`. Receipt events increment accepted `received_quantity` and post `TRANSFER_IN`; rejected, damaged, and discrepancy quantities are rollups that do not post destination stock. A disputed transfer can be closed through non-posting discrepancy settlement with audit metadata; original movement quantities remain unchanged. |
| Transfer Receipt      | `inventory_transfer_id`, `received_by_user_id`, `status`, `received_at`, `posted_at`, `reversed_by_user_id`, `reversed_at`, `reversal_reason`, `discrepancy_flag`, `discrepancy_summary`                                                                                                                  | Durable receipt event for exact or partial destination receipt. Posted receipt events can be reversed only as full events.                                                                                                                                                                                                                                                                       |
| Transfer Receipt Line | `transfer_receipt_id`, `inventory_transfer_line_id`, `line_no`, `dispatched_quantity_snapshot`, `accepted_quantity`, `rejected_quantity`, `damaged_quantity`, `discrepancy_quantity`, `outstanding_quantity`, `posted_movement_id`                                                                        | Accepted quantity links to a deterministic `TRANSFER_IN` movement. Discrepancy reason is required when rejected, damaged, or short/discrepant quantity is recorded.                                                                                                                                                                                                                              |

**Implemented transfer statuses:** `DRAFT`, `REQUESTED`, `DISPATCHED`, `PARTIALLY_RECEIVED`, `DISPUTED`, `RECEIVED`, `CLOSED`, `CANCELLED`.

**Future transfer statuses:** `pending_approval`, `approved`, `preparing`, `rejected`.

### 9.6 Physical Count and Count Line

| Entity        | Required fields                                                                                                                                                                                               | Notes                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Count Session | `tenant_id`, `company_id`, `public_reference`, `inventory_location_id`, `count_type`, `scheduled_date`, `cutoff_at`, `blind_count`, `freeze_movements`, `created_by_user_id`, `assigned_to_user_id`, `status` | Type: full, cycle, spot, high_value, opening. Current implementation is non-posting.                                                         |
| Count Line    | `count_session_id`, `line_no`, `item_id`, `uom_id`, `lot_key`, `system_quantity_base_uom`, `counted_quantity_base_uom`, `variance_quantity_base_uom`, `counted_by_user_id`, `counted_at`                      | Variance is calculated from the cutoff snapshot. Reviewed non-zero variance lines can generate one linked `COUNT_VARIANCE` Stock Adjustment. |

**Implemented count statuses:** `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, `RECOUNT_REQUESTED`, `REVIEWED`, `CANCELLED`.

**Future count statuses:** `APPROVED`, `POSTED`, `REJECTED`.

### 9.7 Wastage and Stock Adjustment

| Entity                  | Required fields                                                                                                                                                                                                                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wastage Header          | `company_id`, `wr_number`, `location_id`, `department_id`, `reported_by_user_id`, `reported_at`, `wastage_type`, `reason_code`, `status`                                                                                                                                                                                        | Estimated value and photo requirements recorded.                                                                                                                                                                                                                                                                                 |
| Wastage Line            | `wastage_report_id`, `line_no`, `item_id`, `inventory_location_id`, `quantity`, `uom_id`, `quantity_base_uom`                                                                                                                                                                                                                   | Lot / expiry and photo required per policy.                                                                                                                                                                                                                                                                                      |
| Operational Reason Code | `tenant_id`, `company_id`, `workflow`, `code`, `label`, `applies_to`, `requires_evidence`, `status`, `sort_order`                                                                                                                                                                                                               | Configured dropdown source for Wastage, Stock Adjustment, and future exception classifications.                                                                                                                                                                                                                                  |
| Adjustment Header       | `company_id`, `sa_number`, `location_id`, `requested_by_user_id`, `adjustment_date`, `adjustment_type`, `reason_code`, `reason_description`, `status`, `source_document_type`, `source_document_id`, `source_stock_count_session_id`, `posted_by_user_id`, `reversed_by_user_id`, `posted_at`, `reversed_at`, `reversal_reason` | `DEC-0023` implements manual increase/decrease approval, separate posting, and full-document reversal. `DEC-0026` adds count-generated `COUNT_VARIANCE` adjustments. Opening balance cutover is implemented through controlled `OPENING_BALANCE` adjustments. Reclassification and backdating remain future controlled releases. |
| Adjustment Line         | `stock_adjustment_id`, `line_no`, `item_id`, `adjustment_quantity_base_uom`, `posted_movement_id`                                                                                                                                                                                                                               | Stores requested quantity impact, system snapshot where available, value context where available, lot / expiry, and posted movement lineage when approved adjustment is posted.                                                                                                                                                  |

**Wastage statuses:** `draft`, `submitted`, `pending_approval`, `approved`, `posted`, `rejected`, `cancelled`, `reversed`.

**Stock Adjustment statuses:** `DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, transient `POSTING`, `POSTED`, transient `REVERSING`, `REVERSED`, `RETURNED`, `REJECTED`, `CANCELLED`.

Current Phase I scaffold implements Wastage Reports through `wastage_report`, `wastage_line`, `wastage_policy`, `operational_reason_code`, approval instances, inventory movements, and audit records. Implemented wastage statuses are `DRAFT`, `SUBMITTED` for legacy review-only records, `PENDING_APPROVAL`, `APPROVED`, transient `POSTING`, `POSTED`, transient `REVERSING`, `REVERSED`, `REVIEWED`, `RETURNED`, `REJECTED`, and `CANCELLED`. Wastage records are scoped to the current authorized inventory location, require item, positive quantity, an active configured reason code, evidence reference where item-category or configured policy rules require it, lot/expiry where tracked, estimated unit/total cost, evaluated policy flags, policy snapshot, and audit history. Submitting wastage creates an approval instance; approving wastage creates no movement; posting approved wastage creates source-linked `WASTAGE_OUT` movements and updates balances through the inventory ledger service. Reversing posted wastage creates linked `REVERSAL` movements and restores stock through the same ledger service. Backdating remains a future controlled transition.

`DEC-0019` confirmed the original non-posting Stock Adjustment foundation. `DEC-0023` adds approval-enabled posting for manual `INCREASE` and `DECREASE` adjustments. `DEC-0026` allows a reviewed Stock Count Session to generate one linked `COUNT_VARIANCE` adjustment from non-zero variance lines. Manual adjustment creation now requires an active configured reason code plus a narrative `reason_description`. Submitting creates a `StockAdjustment` approval instance; approving creates no movement; posting approved adjustments creates source-linked `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, or opening-balance movements and updates balances only through the inventory ledger service; reversing posted adjustments creates linked `REVERSAL` movements. Direct `COUNT_VARIANCE_*` posting, reclassification, backdating, finance/accounting entries, and partial reversal require separate confirmed decisions and implementation.

---

## 10. Cross-Cutting Records

### 10.1 Attachment

| Field group | Required | Notes |
| --- | ---: | --- |
| `tenant_id`, `company_id`, `id` | Yes | `Attachment` is company scoped. `id + tenant_id + company_id` is the attachment identity used by every controlled-evidence, project, training-certificate, and compliance-document link. |
| `storage_environment`, `storage_provider`, `object_key`, `object_version_id` | Yes / Yes / Yes / Conditional | Provider, environment, and opaque object key are unique. Exact object version is mandatory before a production upload may be verified or made available. Existing keys and bytes are preserved but migrated as `LEGACY_UNVERIFIED`. |
| `original_filename`, `mime_type`, `detected_mime_type`, `size_bytes`, `checksum`, `detected_checksum` | Yes / Yes / Conditional | Filename and declared MIME are untrusted display/input metadata. Detected MIME and checksum must be present, and expected/detected checksum must match, before availability. Production size must be positive. |
| `upload_state`, `scan_state`, `availability_state`, `physical_state`, `scan_verified_object_version_id` | Yes | Availability is independent from upload, physical durability, and scan processing. `AVAILABLE` requires upload `VERIFIED`, physical state `DURABLE`, scan `CLEAN`, exact-version equality, detected type/checksum, and verification/scan/availability timestamps. |
| `stored_checksum`, `encryption_algorithm`, `encryption_key_id`, `encrypted_at` | Conditional | Hosted durable/verified evidence requires `AES-256-GCM`, a nonempty versioned key ID, encrypted timestamp, and stored checksum. Encryption keys are broker-only secrets and are never stored in PostgreSQL. |
| Upload/scan/availability lifecycle timestamps | Conditional | Records intent issue/expiry, confirmation, verification, scan request/completion, availability, rejection, removal, and reconciliation times. Removal is a status transition with reason, never a hard delete. |
| `retention_class`, `retain_until`, `legal_hold`, legal-hold actor/time/authority/case-reference/reason | Conditional | A legal hold is preservation-only and valid only with its actor, time, authority, case reference, and reason. Governance retention and disposition values remain policy/configuration decisions; same-VPS enforcement is not WORM, and Compliance mode is not represented as an application default. |
| `replaces_attachment_id`, reconciliation lease/retry fields, `row_version` | Conditional / Yes | Replacement stays within the same tenant/company. Lease owner and expiry must be set together; retry count is nonnegative and row version is positive. |

`AttachmentUploadIntent` stores one short-lived, single-object intent for the exact attachment scope, environment, provider, and opaque key. It stores only a non-reversible intent-token hash, a company-scoped idempotency key and request hash, expected MIME/size/checksum, expiry, single-use state, exact completed version, creator, timestamps, and optimistic row version. The request hash prevents reuse of an idempotency key for a different upload request. One `ISSUED` intent may exist per attachment.

`AttachmentScanAttempt` stores one completed exact-version scan attempt: provider, engine version, signature version/publication time, start/completion timestamps, terminal result, safe failure code, and the plaintext checksum. Database triggers reject update and delete so attempts remain append-only. An attempt cannot itself release a file; the attachment transition still requires an exact-version compare-and-set and all availability invariants.

`AttachmentCompanyQuotaUsage` stores company-and-environment used bytes, reserved bytes, optional approved cap, timestamps, and row version. Values cannot be negative and `used + reserved` cannot exceed the configured company cap. The upload service locks this row before reserving, consuming, or releasing bytes.

Current implementation note: `DEC-0046` supersedes `DEC-0045`. Hosted controlled uploads use the internal Hostinger evidence broker, server-issued immutable versions, AES-256-GCM encryption, ClamAV `INSTREAM`, durable upload recovery, and bounded database-backed scan reconciliation. The migration derives each legacy attachment's company from exactly one existing controlled/project/workforce link, aborts atomically for an orphan, tenant mismatch, or multi-company result, preserves stored bytes and keys, and leaves the row quarantined as `LEGACY_UNVERIFIED`. Local development and controlled UAT may use approved `local-private` behavior, but hosted environments fail closed unless the broker, keyring, storage watermarks, ClamAV freshness, timer, retention, and recovery gates are satisfied.

Evidence governance permissions are separate from source-record access: `evidence.legal_hold.set` permits a preservation-only legal hold within current company/source scope, while `evidence.retention.view` permits access to the confidential company retention register. Neither permission grants evidence download, disposition, source-workflow mutation, or cross-company visibility. Permission deployment invalidates active sessions for newly affected configured administrators so current authority is re-evaluated.

### 10.2 Comment / Activity Note

| Field                                                                                                    | Required | Notes                                                       |
| -------------------------------------------------------------------------------------------------------- | -------: | ----------------------------------------------------------- |
| `company_id`, `owner_type`, `owner_id`, `comment_text`, `visibility`, `created_by_user_id`, `created_at` |      Yes | Visibility: internal, approvers_only, finance_only, system. |

### 10.3 Audit Log

| Field                                                                                                | Required | Notes                                   |
| ---------------------------------------------------------------------------------------------------- | -------: | --------------------------------------- |
| `tenant_id`, `company_id`, `entity_type`, `entity_id`, `action`, `actor_type`, `occurred_at`         |      Yes | Actor can be user, system, integration. |
| `actor_user_id`, `before_json`, `after_json`, `reason`, `ip_address`, `user_agent`, `correlation_id` |       No | Redact sensitive fields by policy.      |

### 10.4 Notification

| Field                                                                                                                                          | Required | Notes                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------------------------------------------------------------------------------------- |
| `tenant_id`, `recipient_user_id`, `notification_type`, `title`, `body`, `channel`, `entity_type`, `source_event_key`, `status`, `generated_at` |      Yes | Current implementation uses in-app notification records only.                          |
| `company_id`, `location_id`, `entity_id`, `priority`, `deep_link`, `recipient_basis`, `read_at`, `archived_at`, `metadata`                     |       No | `source_event_key` plus recipient prevents duplicate alerts for retried source events. |

Current implementation note: The bounded notification foundation creates scoped in-app approval-assignment notifications for implemented Phase I approval-backed workflows. An intermediate approval keeps the source record `PENDING_APPROVAL`; in the same transaction it completes the current approval step, activates the next step, re-evaluates currently eligible approvers, and notifies only those next-step recipients. A final approve, return, or reject decision atomically creates the terminal outcome notification for the requester or responsible owner. Source-event keys and recipient uniqueness make these notification writes retry-safe. Notification read/archive state does not complete, approve, post, or otherwise mutate the source workflow. Scheduled reminder/escalation delivery, email or other external channels, preferences, and broader non-approval event fanout remain deferred.

---

## 11. Key Relationships

```text
Tenant
  └─ Company
      ├─ Brand
      ├─ Operational Location (branch / warehouse / commissary / project)
      ├─ Department and Cost Center
      ├─ User → Role Assignment + Scope Assignment
      ├─ Supplier → Supplier Item Reference
      ├─ Item Category → Inventory Item → Item UOM Conversion
      ├─ Purchase Request → PR Lines
      │      └─ Supplier Quotes → Quotation Comparison
      │              └─ Purchase Order → PO Lines
      │                      └─ Receiving Report → Receipt Lines
      │                              └─ Inventory Movement Ledger → Balance Cache
      ├─ Transfer Order → Transfer Lines → paired stock movements
      ├─ Wastage / Adjustment → Lines → stock movements
      ├─ Count Session → Count Lines → count-variance movements
      ├─ Finance Configuration → Fiscal Periods, Chart of Accounts, Posting Rule Templates
      └─ Approval Policies → Approval Instances → Actions
```

---

## 12. Mandatory Integrity Rules

1. Every record is constrained by tenant, company, and user scope.
2. A location must be active and inventory-enabled before stock can post to it.
3. A PO cannot use an inactive or ineligible supplier without explicit exception approval.
4. A PO cannot exceed approved PR quantity without a documented approved change.
5. Accepted receipt quantity cannot exceed received quantity.
6. A posted receipt creates stock only for accepted quantity.
7. A transfer creates a negative source movement at dispatch and positive destination movement at receipt, sharing a correlation ID.
8. Inventory movement records cannot be edited after posting.
9. Lot and expiry-controlled items require those values at every relevant stock movement.
10. Wastage, adjustment, and count variance cannot post before the required approval is complete.
11. Rejection, return, cancellation, reversal, backdating, and exception actions require a reason.
12. Material audit logs are written in the same transaction as the business action.
13. Master data referenced by transactions can be deactivated but not deleted.
14. Numeric quantities and money use decimal values, never floating-point storage.
15. Status transitions must follow allowed workflow paths and cannot be jumped through direct editing.

---

## 13. Phase I Report Filters

All operational lists should support filters and export fields for, where relevant:

- Company, brand, location / branch / warehouse
- Department, cost center, project
- Document number and document type
- Requester / creator / approver / receiver
- Supplier, item, category, lot, expiry
- Status and approval status
- Created date, required date, delivery date, posted date
- Amount, estimated value, variance value, stock quantity
- Discrepancy and exception flags
- Last updated user and timestamp

---

## 14. Phase II Restaurant Operations Data Extensions

`DEC-0035` confirms controlled Phase II workflow data for recipe versions, menu-price decisions, operational corrections, and intermediate status transitions.

Implemented/additive schema foundation:

- `Recipe.currentVersionId` and `Recipe.publishedVersionId` point to the current and published recipe-version basis without deleting historical versions.
- `RecipeVersion.supersedesVersionId`, `publishedAt`, `publishedByUserId`, and `reason` support immutable version progression.
- `RecipeVersionTransition` stores append-only recipe workflow state changes with actor, approver, reason, evidence reference, and idempotency key.
- `MenuPriceDecision` stores controlled menu-price proposals/decisions before immutable effective-dated `MenuPrice` rows are applied.
- `MenuPrice.decisionId` and `MenuPrice.status` preserve provenance and immutable price lifecycle.
- `OperationalCorrectionRecord` stores controlled correction requests for branch checklists, food-safety logs, incidents, and maintenance tickets.
- `OperationalStatusTransition` stores append-only operational workflow transitions across Phase II source records.
- `WorkflowTransitionPolicy` stores the controlled domain/action/from-status/to-status policy that services and UI metadata must follow.

Phase II workflow records must preserve tenant, company, brand, location where applicable, actor, status, reason/evidence where required, and auditability. Recipe, menu-price, and operational workflow changes must not post inventory or finance effects unless a separate approved module owns that posting.

---

## 15. Phase III Finance Configuration Data Extensions

Phase III controlled implementation has started with finance authorization, read-side workspaces, configuration-only accounting setup, budget/commitment visibility, AP/payment preparation, and bank/cash reconciliation readiness. These records prepare the future accounting foundation but do not release payments, settle suppliers, mutate POs/receipts/inventory, hard-block budgets, integrate with banks, or close books in production.

Implemented/additive schema foundation:

- `FiscalYear` stores company fiscal-year boundaries, status, and default-year selection.
- `AccountingPeriod` stores fiscal periods with `FUTURE`, `OPEN`, `SOFT_CLOSED`, `LOCKED`, or `REOPENED` status.
- `FinanceAccountClass` stores account classes, normal debit/credit balance, statement section, and sort order.
- `ChartOfAccount` stores account codes, names, hierarchy, active range, header/detail flag, and whether posting is allowed once posting is approved.
- `FinancePostingRule` stores source-event posting templates with execution disabled by default through `is_config_only` and `is_execution_enabled`.
- `FinancePostingRuleAccountMap` stores the debit/credit account mapping for a posting-rule template.
- `FinancePostingRuleDimensionRequirement` stores required company dimensions such as brand, location, department, cost center, or project.
- `FinanceJournal` stores controlled manual, reversal, and future automated journal headers with company scope, accounting period, lifecycle status, source lineage, approval/post/reversal actors, PHP-only totals, and reversal lineage.
- `FinanceJournalLine` stores debit/credit journal lines with posting accounts, PHP amounts, descriptions, and optional brand/location/department/cost-center/project/supplier dimensions.
- `FinanceJournalPostingAttempt` stores idempotent posting/reversal attempts with action, status, actor, result journal, and failure details.
- `Budget` stores approved budget headers with fiscal-year scope, optional brand/location/department/cost-center/project dimensions, PHP-only totals, lifecycle actors, approval-instance reference, policy configuration, and version.
- `BudgetLine` stores budget allocations by account, period, dimensions, original/revised/reserved amounts, warning threshold, optional hard-block threshold, and lifecycle status.
- `BudgetRevision` stores controlled budget amendments, rebases, and reallocations with requester/reviewer metadata, snapshots, effective dates, and no-self-review guardrails.
- `BudgetCommitment` stores idempotent source-linked budget reservations with source type/ID/event key/reference, limited source snapshot, committed/consumed/released PHP amounts, lifecycle actors, and reversal lineage. `EXPENSE_REQUEST` is a supported source event type for approved, budget-linked operating expense requests.
- `ExpenseRequest` stores operational expense request headers with company/location scope, optional supplier and budget dimensions, PHP-only totals, urgency, budget status, lifecycle actors, evidence reference, idempotency key, and optional approval-instance link.
- `ExpenseRequestLine` stores lineized expense details with category, line date, PHP amounts, optional budget-line link, evidence reference, creator/updater metadata, and duplicated scope fields for reporting and authorization.
- `ExpenseRequestSourceLink` stores non-mutating source lineage from expense requests to manual evidence, PR/PO/receiving/AP/payment/project records through source type, source ID, event key, limited snapshot, and amount snapshots. Expense-to-AP handoff is protected by a unique request/event guard so one expense request cannot create duplicate AP draft lineage for the same handoff event under retry or concurrent submission.
- `CashAdvanceRequest` stores scoped PHP-only cash advance headers with requester/beneficiary, purpose, due date, lifecycle actors, budget status, evidence reference, optional source links, and outstanding issued/liquidated amount snapshots. Current service actions control submit, approve, return, reject, cancel, offline issue, controlled issue void, and close with scope checks, no self-approval, reason/evidence enforcement, audit events, and no payment/bank/AP/journal mutation. Voiding an issued advance requires no posted liquidation exposure and creates a reversing cash-advance movement instead of touching payment, bank, AP, or journal records.
- `CashAdvanceMovement` stores immutable cash advance movement markers for offline issue, reversal, liquidation settlement, adjustment, or void events with actor, source event key, idempotency key, and no bank/payment/journal side effect.
- `CashAdvanceLiquidation` stores liquidation claim/review headers with claimed, approved, returned, overage, and shortfall amounts, evidence reference, reviewer/approver/closer metadata, and no self-approval guardrails. Current service actions control liquidation submit, approve, return, reject, cancel, closure-ready handoff, controlled reversal, and close; approved liquidations post only a cash-advance `LIQUIDATION_SETTLEMENT` movement and update the request's liquidated snapshot. Reversal requires reason/evidence, requires an existing liquidation settlement movement, posts a cash-advance `REVERSAL` movement, recalculates the request's liquidated snapshot/status, and does not create payment requests, payment releases, bank mutations, AP settlements, or journals. Closure-ready and closed actions require reason/evidence, require an existing liquidation settlement movement, and do not create payment requests, payment releases, bank mutations, AP settlements, or journals.
- `CashAdvanceLiquidationLine` stores liquidation receipt/evidence lines by category, spend date, amount, optional supplier/source links, and creator metadata for reporting and review. Liquidation claims cannot exceed issued less previously liquidated cash exposure.
- `PettyCashFund` stores scoped PHP-only petty-cash custody funds with company/location, optional brand, custodian, opening/current/target/low-alert balances, lifecycle status, evidence reference, and creator/updater metadata. Current service actions control scoped fund setup and activation with reason/evidence, custodian scope checks, audit events, and no bank/payment/journal mutation.
- `PettyCashRequest` stores replenishment or disbursement requests against a fund with requested/approved PHP amounts, lifecycle actors, purpose, justification, evidence reference, source event key, and no self-approval guardrails. Current service actions control create, submit, approve, return, reject, cancel, offline fulfill, void fulfillment, and close. Replenishment fulfillment increases the fund balance snapshot; disbursement fulfillment decreases it and is blocked if the fund would go negative. A fulfilled offline movement can be voided only through a controlled reversal ledger marker, required reason/evidence, `VOIDED` status, and audit history.
- `PettyCashLedgerEntry` stores immutable petty-cash movement markers with fund/request/liquidation lineage, direction, PHP amount, balance snapshots, source event key, actor, void metadata, and no bank/payment/journal side effect. Fund setup may create an `OPENING` baseline marker; offline replenishment and disbursement fulfillment create balance-changing ledger markers; request voids create counter-direction `REVERSAL` markers; liquidation approval creates a custody-review marker only; liquidation reversal creates a non-balance-changing reversal marker.
- `PettyCashLiquidation` stores petty-cash liquidation cycles with cycle dates, claimed/approved/shortage/overage amounts, reviewer/approver/closer metadata, evidence reference, and no self-approval guardrails. Current service actions control submit, approve, return, reject, cancel, reverse, and close with required reason/evidence and no payment, bank, period-close, or official journal mutation. Shortage and overage approvals require reason/evidence, close requires evidence plus an existing `LIQUIDATION_SETTLEMENT` petty-cash ledger marker, and approved/closed settlement markers can be reversed to `REVERSED` with audit history.
- `PettyCashLiquidationLine` stores liquidation receipt/evidence lines by category, spend date, PHP amount, optional supplier/source references, and creator metadata. Current service validation requires non-empty lines, positive amounts, valid cycle dates, and line-level receipt/evidence coverage.
- `ApInvoice` stores controlled supplier invoice headers with company, location, supplier, optional PO/receiving source links, PHP-only amounts, duplicate-risk state, match status, hold reason, evidence reference, and lifecycle actors.
- `ApInvoiceLine` stores supplier invoice lines with item/UOM references where available, invoiced quantity, unit price, tax/discount, line total, optional PO/receiving line links, and optional Phase 3 budget-line allocation inherited from the source PO line or selected directly during AP capture.
- `ApInvoiceMatchResult` stores the evaluated three-way match snapshot for invoice lines: PO basis, accepted receiving quantity, invoiced quantity/price/amount, variances, tolerance configuration, match status, and reviewer metadata.
- `ApInvoiceException` stores AP match holds/disputes with reason, severity, owner, evidence reference, and resolution metadata.
- `ApInvoiceDuplicateSignal` stores duplicate-invoice signals and candidate links without hard-deleting or silently merging invoice records.
- `SupplierCreditNote` stores explicit supplier credit memo records linked to an original AP invoice, supplier, credit reference, PHP amount, reason, evidence reference, lifecycle status, creator/canceller metadata, and idempotency key. Current actions create draft credits, submit them for pending application review, and cancel draft/pending-application credits only; they do not silently reduce AP invoices, settle suppliers, release payments, mutate PO/receiving/inventory records, or post journals.
- `PaymentRequest` stores controlled payment-preparation headers with company/location/supplier scope, PHP-only total, lifecycle status, requester/submitter/approver metadata, optional approval-instance link, reason/evidence, and idempotency key.
- `PaymentRequestLine` stores AP-invoice payment request lines with requested amount, invoice total/outstanding snapshots, AP invoice link, line number, creator, and duplicated scope fields for fast authorization and integrity checks.
- `PaymentRelease` stores controlled release headers linked to one approved payment request, with company/location/supplier/bank-account scope, PHP-only release amounts, offline/manual release method, evidence/reference fields, lifecycle status, optional approval-instance link, creator/releaser/holder/cancellation/reversal actors, source event key, and idempotency key. Current service actions control draft creation with approval routing, approval to `READY_FOR_RELEASE`, offline execution, hold/resume, cancel/reject, failed execution recording, reconciliation handoff/outcome, source-linked bank reconciliation matching, and reversal request with SoD guards, reason/evidence enforcement, audit events, and no bank API, AP settlement, source mutation, or official journal posting. Reversal recovery reverses active payment-release reconciliation matches, reopens affected statement-line match state, and recalculates reconciliation variance/status unless the reconciliation or statement line is closed/voided and must first be reopened through controlled close procedures.
- `CompanyPolicySetting` includes `finance.payment_release.evidence_requirements_by_method`, which defines method-specific evidence-reference requirements for offline payment release execution. The current implementation enforces reference/evidence text and records policy metadata in audit; controlled evidence upload/download is handled by the shared attachment service and the `security.evidence_storage.default_policy` production gate.
- `PaymentReleaseAllocation` stores line-level allocations from a payment release to payment request lines and AP invoices, preserving request-line and invoice outstanding snapshots without mutating AP, PO, receiving, or inventory records.
- `PaymentReleaseExecution` stores idempotent offline/manual release execution attempts, release proof references, execution snapshots, failure details, and actor metadata. Failed execution attempts are recorded as evidence-bearing exceptions only; they do not call bank APIs, settle AP, mutate payment requests, or post journals.
- `BankReconciliationMatch` stores controlled reconciliation source links from imported bank statement lines to approved source records. Payment-release matches use `PAYMENT_RELEASE`, optional `paymentReleaseId`, positive matched amount against the statement line's absolute outflow value, source snapshot, reason/evidence, idempotency key, matcher, and audit-linked controls; they update reconciliation visibility and payment-release reconciliation status without bank API calls, AP settlement, or journal posting.
- `AccountingPeriod` stores fiscal period state (`FUTURE`, `OPEN`, `SOFT_CLOSED`, `LOCKED`, `REOPENED`) plus close/reopen timestamps and close evidence. Completing a ready finance close run now atomically marks the run `CLOSED` and moves an `OPEN` or `REOPENED` accounting period to `SOFT_CLOSED` with audit evidence; a separate controlled lock action moves a completed soft-closed period to `LOCKED` with reason/evidence and audit history. Controlled reopen moves a `SOFT_CLOSED` or `LOCKED` period to `REOPENED`, sets a configurable reopen window, reopens the close run for validation, resets required bank-reconciliation and management-signoff checks for post-reopen review, and writes audit/attempt history without mutating AP, payment, bank reconciliation, or journal records.
- `WorkforceSchedule` and `WorkforceScheduleLine` store location-scoped staffing plans, planned headcount, assigned headcount, coverage gaps, station/role/time lines, and lifecycle actors. Draft creation checks overlapping active schedule lines for the same employee and duplicate active station/role/time blocks in the selected location before creating the schedule. Submitting a schedule creates a native approval instance and scoped notification for the Approval Inbox. Publishing an approved schedule with coverage gaps requires waiver reason/evidence and writes audit metadata; it still does not compute payroll, create payment records, mutate attendance-device authority, or post finance journals.
- `Employee` stores the non-payroll workforce identity record with tenant/company scope, optional linked ERP user, employee code, display/profile fields, employment type, lifecycle status, hire/separation dates, home location, and creator/updater metadata. Current workforce management actions can create and update scoped employee profile/status/home-location fields with required reason/evidence reference and audit metadata; they do not provision user accounts, compute payroll, create payments, or post finance journals.
- `EmployeeAssignment` stores effective-dated branch/location, brand, department, cost-center, role-label, primary-assignment, and lifecycle status history for where an employee operates. Current workforce management actions can create and end scoped active assignments with reason/evidence reference, duplicate active role protection, active-primary conflict protection, and audit events. Employee setup can also create an optional initial active primary assignment for the selected scoped home location. Full transfer request approval routing and deeper assignment-policy UAT remain separate controlled work.
- `EmployeeLeaveRequest` stores controlled leave requests with employee/location scope, leave type, lifecycle status, requested minutes, date range, requester/approver metadata, optional `approvalInstanceId`, reason, idempotency key, and decision notes. Submitting creates a native approval instance and scoped notification for the Approval Inbox. Approval, return, rejection, and cancellation preserve scope checks, no self-approval, audit, and no payroll, attendance-device, payment, export, or journal mutation.
- `EmployeeOvertimeRecord` stores controlled overtime requests/records with employee/location scope, overtime type, lifecycle status, worked time range, requested minutes, requester/approver metadata, optional `approvalInstanceId`, reason, and idempotency key. Submitting creates a native approval instance and scoped notification for the Approval Inbox. Approval, rejection, and cancellation preserve scope checks, no self-approval, audit, and no payroll computation, statutory deduction, attendance-device authority, payment request, export, or finance journal mutation.
- `EmployeeTrainingRecord` stores training/certification readiness with training code/name, provider, scheduled/completed/valid-until dates, status, required-for-scope flag, optional attachment reference, and actor metadata.
- `EmployeeComplianceDocument` stores document-expiry readiness metadata with document type, status, issue/expiry dates, issuer, mandatory flag, optional attachment reference, and actor metadata. Workspace/report previews must not expose document numbers to users without confidential workforce authority.
- `WorkforceSchedule` stores branch/location manpower plans with brand/location scope, schedule date, shift type, lifecycle status, planned/assigned/gap headcount, planned minutes, evidence/reference metadata, optional `approvalInstanceId`, actor timestamps, and source/idempotency keys. Current service actions control submit, approve, return, reject, publish, and cancel with scope checks, no self-approval for approval, line-count validation before submission, audit, and no payroll/export/payment/journal mutation. Approval does not publish the schedule; publish remains a separate controlled action.
- `WorkforceScheduleLine` stores schedule coverage lines by station/role, planned time window, optional employee assignment, line status, gap reason/evidence, and creator/updater metadata.
- `AttendanceImportBatch` stores attendance evidence intake headers with company/brand/location scope, business date, source reference/file reference, source timezone, lifecycle status, row/accepted/exception/duplicate counts, validation summary, optional `approvalInstanceId`, evidence reference, and reviewer/void metadata. Clean accepted imports may finalize directly as evidence review. Exception-list and rejection reviews create a native approval instance and scoped notification for the Approval Inbox before final status is applied. Current service actions control review, exception/rejection approval, and void; they treat imports as evidence only and do not make the ERP an attendance-device source of truth, payroll source, payment source, or journal source.
- `AttendanceImportLine` stores imported attendance evidence rows with raw employee code/name, optional matched employee, punch timestamps, work minutes, line status, exception metadata, and optional source payload.
- `BankAccount` stores company treasury or scoped location bank/cash accounts with masked account number, PHP-only currency, account type/status, linked chart account, evidence reference, and creator metadata.
- `BranchCashDeposit` stores branch deposit declarations with location scope, bank account, deposit date, PHP amount, slip/reference evidence, lifecycle status, declarer/verifier metadata, and immutable source event key.
- `BankStatement` stores imported bank statement headers with bank account, statement date range, source upload reference, PHP-only balances, validation state, and importer metadata.
- `BankStatementLine` stores imported statement lines with debit/credit/net amount, transaction references, matched amount, and matching lifecycle status.
- `BankReconciliation` stores prepared reconciliation batches tied to an accounting period, bank account, and statement, with preparer/reviewer/approver metadata, variance amount, and status.
- `BankReconciliationMatch` stores proposed or confirmed links between statement lines and source records such as branch cash deposits, with idempotency key, matched amount, evidence reference, and optional limited source snapshot.
- `FinanceCloseRun` stores company-scoped accounting-period close-readiness runs with run type, lifecycle status, source window, initiating actor, evidence reference, configuration snapshot, idempotency key, and version. Current service actions can calculate readiness, complete the close packet, soft-close the linked accounting period, request approval for sensitive hard-lock/reopen actions, hard-lock a completed soft-closed period after approval, and reopen a closed run for validation after approval.
- `FinanceCloseChecklistItem` stores required close-readiness checks such as branch deposits, bank reconciliation, AP exceptions, payment releases, petty cash, cash advances, inventory cut-off, journals, trial balance, workforce review, and management sign-off with owner, status, evidence, and result summary.
- `FinanceCloseException` stores period-close blockers and carried-forward issues with severity, state, source reference, owner, due date, resolution metadata, and evidence reference.
- `FinanceCloseAttempt` stores idempotent close-readiness action attempts such as validation start, check completion, waiver, exception assignment/resolution, review submission, ready marking, and cancellation.

Phase III finance setup records must preserve tenant/company scope, actor metadata where applicable, UTC timestamps, status, and additive auditability through later workflow actions. Posting-rule records are templates only until a later approved finance posting workflow enforces balanced journals, period controls, authorization, segregation of duties, idempotency, reversal, and UAT evidence.

Manual journal controls currently enforce the first ledger-core boundary: at least two lines, one debit/credit side per line, positive PHP amounts, total debit equals total credit, open-period posting, no self-approval, idempotent post/reverse attempts, immutable posted journals, and reversal through a linked reversal journal. Manual journal actions must not mutate procurement, receiving, inventory, AP, payment, bank, or operational source records.

Budget controls currently enforce the first commitment-visibility, source-projection, and lifecycle-action boundary: budgets and lines are PHP-only and scoped by company, fiscal year, and optional operating dimensions; commitments store source links and idempotent event keys; actuals are read from posted finance journal lines only. Budget remaining is calculated as `revised_budget_amount - open_commitments - posted_actuals`. Budget threshold state is calculated as `WITHIN_BUDGET`, `WARNING`, or `HARD_BLOCK` from `(open_commitments + posted_actuals + proposed_source_amount) / revised_budget_amount`, using the line warning threshold and optional hard-block threshold. Server-side budget actions may submit, start review, approve, return, reject, activate, close, cancel, or archive a budget with permissions, scope checks, no self-approval, required reasons where applicable, open-commitment close blocking, line lifecycle updates, and audit events. Source-event hooks may upsert or reverse budget commitments with audit metadata, but budget controls must not approve PRs or POs, receive stock, post inventory, release payments, post journals, settle suppliers, or mutate AP/procurement/receiving/inventory source records. Global hard-block enforcement remains configurable and gated by UAT.

Expense request controls currently enforce the first non-posting expense boundary: requests are PHP-only, location-scoped, lineized, evidence-referenced, budget-status-aware, and source-linked without mutating source records. Server-side lifecycle actions may submit, approve, return, reject, cancel, complete, or mark a request payment-handoff-ready with permissions, scope checks, no self-approval, required reasons/evidence, and audit events. Approving a budget-linked request upserts idempotent `EXPENSE_REQUEST` budget commitments per request line for budget-reservation visibility only; this does not create AP invoices, payment requests, payment releases, bank activity, journals, or source-record mutations beyond the approved expense request. Eligible approved or completed expense requests may create a controlled AP invoice draft through a separate handoff action when the request has an active supplier, positive PHP amount, evidence, no self-approval conflict, and no existing AP handoff source link. The handoff creates an `ExpenseRequestSourceLink` to the AP invoice and audit events, but it must not create payment requests, release cash, post journals, settle AP, receive stock, post inventory, or mutate PR/PO/receiving/payment/bank/source records. When a payment request is later drafted from that AP invoice, the AP/payment workflow records a `PAYMENT_REQUEST` source link back to the originating expense request for lineage only. Payment request approval, release, bank activity, AP settlement, and journal posting remain separate controlled workflows.

AP invoice controls currently enforce the first payables boundary: supplier invoice capture is PHP-only, location-scoped, duplicate-aware, source-linked where PO/receiving exists, and evaluated against accepted receiving quantities rather than delivered/rejected/damaged quantities. Match variances create AP hold/exception records. AP actions must not approve POs, receive stock, post inventory, create payment release, post GL liability, or mutate procurement/receiving/inventory source records.

Supplier credit-note controls currently enforce an explicit non-settlement AP credit boundary: credit notes must link to an original scoped AP invoice, remain PHP-only, require positive amount, reason code/description, evidence reference where configured, and audit history. Draft/cancel actions must not reduce original invoice totals, change payment-request outstanding snapshots, settle AP, release cash, mutate PO/receiving/inventory records, or post journals. Credit application and supplier-statement reconciliation remain future controlled settlement workflows.

Payment request controls currently enforce the first payment-preparation boundary: requests can be prepared only from eligible AP invoices, remain PHP-only and location-scoped, preserve invoice amount snapshots, block duplicate invoice lines, require one scoped supplier per request, block creator self-approval, require reasons for rejection/cancellation, and stop at approved-ready-for-release state. The draft UI supports multi-invoice preparation for up to 10 AP invoice lines with per-line requested amounts and notes. Payment request actions must not release cash or bank funds, post journals, settle suppliers, reconcile bank statements, or mutate AP invoice, procurement, receiving, or inventory source records.

Payment release controls currently enforce the first release-control boundary: releases can be created only from approved payment requests, remain PHP-only and location-scoped, allocate to payment request lines, require a scoped active bank account, preserve offline/manual execution proof, block requester/approver/creator release by the same actor, and record idempotent execution attempts. Payment release actions must not call bank APIs, post journals, mark AP as settled, reconcile statements automatically, or mutate AP invoice, procurement, receiving, inventory, supplier master, or bank-statement source records.

Workforce controls currently enforce the first non-payroll foundation boundary: workforce records are tenant/company/location scoped, employee profile maintenance is scoped/audited, employee assignments are effective-dated and governed by service-layer duplicate/primary-assignment checks, leave/overtime requests require positive minutes and no self-approval where an approver is present, schedule records expose branch coverage gaps without creating payroll, attendance import records preserve source evidence/exception review without becoming attendance-device truth, and training/document readiness can be surfaced without exposing sensitive document numbers. Leave, overtime, schedule, and attendance exception reviews use native approval instances where configured. Workforce actions must not compute wages, statutory deductions, payroll results, attendance-device truth, payment requests, finance journals, or inventory/procurement source records.

Bank/cash controls currently enforce the first reconciliation-readiness boundary: bank accounts are PHP-only and linked to chart accounts, branch deposits require positive amounts and evidence before reconciliation-ready states, imported statement lines preserve debit/credit/net amounts, and reconciliation matches are idempotent source links. Bank/cash actions must not release supplier payments, call bank APIs, post official journals, close accounting periods, settle AP, or mutate branch operations, procurement, receiving, inventory, or AP source records.

Period close controls currently enforce the close-readiness and controlled period-state boundary: close runs, checklist items, exceptions, and attempts are company-scoped, idempotent where actions are attempted, evidence-linked, and read-only toward AP, payments, bank/cash, inventory, petty cash, cash advances, workforce, and journal source records. Current service actions can record checklist pass/fail/not-applicable results, waive checklist items, acknowledge/resolve/waive exceptions, calculate readiness, sync blocker close exceptions from real unmatched bank statement lines, complete a ready close packet, soft-close the linked accounting period, hard-lock the period, reopen the period for a configurable time-bounded validation window, and cancel mutable close-readiness runs. The bank-statement exception sync creates `FinanceCloseException` records linked to `BANK_STATEMENT_LINE` sources but does not match, resolve, void, or mutate bank statement/reconciliation records. Period close actions must not post journals, settle AP, call bank APIs, release payments, mutate source records, or turn the ERP into official production books before UAT and finance owner approval.

---

## 16. Deferred Domains

The following are intentionally deferred but may use reference fields now:

- POS sales and consumption
- General ledger official posting, payment execution, tax reporting
- Full payroll, wage computation, statutory deduction, and attendance-device source-of-truth data
- Expansion feasibility, lease, permits, construction, capex
- SaaS subscriptions, client billing, white-label configuration
- Forecasting and automated replenishment

---

## Projects & Implementation Tracker — Phase 1.5 Data Extension

The canonical detailed field definitions are in `docs/phases/phase-01-5-projects-implementation/data/PROJECTS_IMPLEMENTATION_DATA_EXTENSIONS.md`.

Implemented foundation entities:

- `project_templates`
- `projects`
- `project_members`
- `project_activity_events`
- `project_tasks`
- `project_task_assignees`
- `project_task_checklist_items`
- `project_comments`
- `project_attachments`
- `project_blockers`
- `project_risks`
- `project_milestones`
- `project_record_links`
- `project_requirements`

Planned follow-on entities:

- `project_template_stages`
- `project_task_dependencies`

Every project-owned record includes tenant/company context, created/updated timestamps, actor metadata, and soft-delete/archive behavior where applicable. Task and project events must preserve history. Project links reference controlled source records but do not copy or own their financial, inventory, or approval state.

Current implementation note: the foundation migrations add project templates, projects, project members, project activity events, project tasks, active task assignees, checklist items, comments, project-scoped attachment metadata links, task blockers, project risks, milestone records, date-only planning fields for calendar-safe project/task dates, project record links, and project requirements. Published project templates can be selected during project creation; the project stores the source template ID plus a project-specific template snapshot/configuration so later template edits do not silently change active projects. Starter tasks/checklists/milestones plus evidence and signoff defaults are cloned into project-owned records in one transaction. A requirement records its type, owner, optional independent reviewer, evidence/signoff metadata, project-scoped attachment/source-link associations, status, decision actor/time/reason, version, and append-only activity. Project attachment contexts may be task-only, comment-only, requirement-only, or a task plus its matching task-bound requirement; database controls reject parentless, comment-mixed, and task/requirement-mismatched rows. Requirement approval is project coordination only and never changes a linked PR, PO, receiving, inventory, approval, or finance source record. Implemented record-link source types are purchase requests, purchase orders, goods receipts, inventory transfers, suppliers, inventory movements, inventory balances, approval instances, wastage reports, and stock adjustments. These links store only source type and source ID, with safe summaries resolved at read time through source-module authorization; inventory-balance summaries require stock-balance permission and selected-location scope. Project attachment links reference shared private attachment storage and expose filename/type/size only through authorized project reads. Project risks are advisory coordination records with their own lifecycle and activity history; they do not mutate operational source records. Task dependencies and persisted calendar events remain deferred. Calendar behavior is derived from authorized project/task/milestone records, not stored as a separate source of truth.
