# OGFI ERP — Non-Functional Requirements

**Status:** Phase I baseline  
**Purpose:** Define the quality, reliability, security, performance, supportability, and scalability requirements that sit underneath the workflows.

---

## 1. Scope

These requirements apply to the ERP web application, API, database, object storage, in-app notification delivery, audit logging, reports, and deployment environments. Future approved background jobs or queues must meet these requirements before activation, but they are not part of the current Phase I / Phase 1.5 no-queueing release.

## 2. Availability and reliability

| Requirement | Phase I target |
|---|---|
| Planned availability | 99.5% monthly excluding scheduled maintenance |
| Scheduled maintenance | Communicate in advance; prefer low operational-impact windows |
| Transaction durability | Committed records must survive application restart/failure |
| Inventory consistency | No duplicate ledger posting; movement posting must be atomic |
| Idempotency | Create/post actions must protect against double submit/retry |
| Error recovery | Failed in-app notification, manual reminder scan, export, and integration-adjacent operations fail safely and remain observable |
| Graceful degradation | Show clear retry/error states when non-critical services fail |

## 3. Performance targets

These are initial targets for normal Phase I loads and must be measured in staging and pilot production.

| Activity | Target |
|---|---|
| Standard page initial load | ≤ 3 seconds on stable broadband / modern device |
| Common list/filter response | ≤ 2 seconds for scoped, paginated query |
| Record detail load | ≤ 2 seconds for normal record and audit summary |
| Submit/approve transaction feedback | ≤ 2 seconds to confirmation, excluding file upload |
| Inventory search | ≤ 1.5 seconds for indexed scoped search |
| Dashboard | ≤ 4 seconds with freshness label if asynchronous read model used |
| Standard export request | Start or return the scoped export response within 3 seconds for normal pilot-sized data, or show a user-safe retry/error state |
| File upload | Progress and retry behavior required; limit configurable |

## 4. Scale assumptions for Phase I

The design must remain viable when OGFI expands and when tenant support is introduced.

- At least 1 active tenant initially; tenant isolation exists from day one.
- At least 7 active branches initially, plus Head Office, warehouse, commissary, and project sites; no hardcoded branch limit.
- Hundreds of named users and multiple concurrent branch/warehouse users.
- Thousands of active inventory items and growing document/attachment volume.
- Retain transaction/audit history without requiring deletion to maintain routine usability.

## 5. Security requirements

- HTTPS enforced in all environments other than explicitly isolated local development.
- Passwords stored using strong modern hashing; never log secrets or passwords.
- MFA required for privileged roles when supported by selected identity approach.
- Server-side authorization required for every read/write action; UI hiding is not authorization.
- Tenant/company/location scope enforced at the data access layer.
- Sensitive data encrypted in transit and protected at rest by selected infrastructure controls.
- Session timeout and re-authentication for sensitive actions must be configurable.
- No direct production database access for routine users; break-glass access is controlled and logged.
- Security events, permission changes, exports, and administrative actions are audit logged.

## 6. Privacy and data handling

- Collect only data needed for operations and compliance.
- Restrict employee, supplier, financial, and personal contact fields by role and scope.
- Redact sensitive data in logs and error traces.
- Define retention and deletion/archival policy with Finance, HR, and Legal before broad deployment.
- Attachments must inherit the access scope of the parent transaction.

## 7. Backup and disaster recovery

| Area | Baseline requirement |
|---|---|
| Database backups | Automated, encrypted, monitored backups; frequency confirmed by hosting plan |
| Point-in-time recovery | Prefer supported PostgreSQL PITR where feasible |
| Object storage | Versioning or equivalent protection for attachments where feasible |
| Restore tests | At least quarterly in non-production environment |
| Recovery objective | Confirm RPO/RTO with OGFI before production; document accepted business downtime/data-loss tolerance |
| Deployment rollback | Versioned releases and migration rollback/forward strategy required |

## 8. Browser and device support

- Latest two major versions of Chrome, Edge, Safari, and Firefox for desktop where practical.
- Chrome on supported Android tablets/phones; Safari on supported iOS devices.
- Design for desktop operations, tablet receiving/counting, and mobile task completion.
- Minimum 44×44px touch targets for touch-primary actions.
- Do not depend on hover-only actions for required workflows.

## 9. Accessibility and usability

- Meet practical WCAG 2.1 AA-informed contrast, keyboard, focus, and text clarity expectations.
- Never use color alone to communicate status or error.
- Support keyboard navigation for desktop forms and tables.
- Provide visible validation messages tied to relevant fields.
- Provide meaningful empty, loading, offline, error, rejected, cancelled, and permission-denied states.

## 10. Observability and support

- Centralized structured application logs with correlation/request IDs.
- Monitor API errors, in-app notification failures, manual reminder scan failures, database health, and storage failure.
- Alert technical owners for service degradation and failed critical operations.
- Maintain audit-friendly error messages without exposing internal stack traces to end users.
- Document support escalation path and ownership before pilot go-live.

## 11. Document and attachment controls

- Configurable file types and maximum file size.
- Virus/malware scanning or provider equivalent before making uploads broadly available where feasible.
- Store metadata: uploader, timestamp, parent record, file name, MIME type, size, checksum where supported.
- Prevent unauthorized direct attachment URLs; use authorized, time-limited retrieval where possible.

## 12. Time, localization, and currency

- Store timestamps in UTC; display in user/company timezone. OGFI default: Asia/Manila.
- Store currency code with monetary values. OGFI default: PHP.
- Amounts use decimal-safe types; never binary floating point for financial values.
- Support date formats and number formatting consistently across screens and exports.
