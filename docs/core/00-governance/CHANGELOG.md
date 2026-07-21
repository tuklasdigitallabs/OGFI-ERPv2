# OGFI ERP — Documentation Changelog

## 2026-07-21 — Controlled Evidence Implementation Foundation

- Recorded the implemented SPF-005 foundation: isolated AES-256-GCM evidence broker, private ClamAV streaming, authorized streamed upload/download, quarantine and exact-version release, PostgreSQL idempotency/quota/upload-lease/rate-limit controls, legal-hold backend and admin retention register, recovery staging/verification tools, Hostinger deployment overlay, and authorization coverage.
- Bound the controlled-evidence migrations at `17:00`, `18:00`, and `19:00` to their computed SHA-256 values. Independent database re-review moved the exact hashes to `APPROVED_FOR_REHEARSAL`; populated-predecessor, quiescence, redeploy, drift, report/export, and isolated-restore evidence remain required before production approval.
- Kept SPF-005 open. Real Hostinger values, independent encrypted backup and key escrow, approved retention/legal-hold/disposition policy, paired restore proof, hosted failure/isolation tests, and final release acceptance remain production activation blockers.
- Confirmed that AWS is not part of the current integration; external object storage remains a future migration option only after a documented trigger and new material decision.
- Hardened the foundation with MIME-to-extension enforcement at upload and clean-release boundaries, a process-lifetime evidence-root broker lock, preservation-aware archive states, bounded embedded evidence lists with a server-paginated register, normalized retention pagination, and accessible uploader focus/keyboard behavior.
- Completed the controlled-evidence glossary, administrator/support guides, training module, and controlled-rollout release note.
- Recorded `DEC-0047` as an open finance-policy gate: free text cannot qualify as high-risk evidence, but finance-owner approval is still required for the exact artifact/purpose/count/value matrix, outage handling, and explicit attachment-selection attestation. The mapped Phase 3 finance actions remain non-production.

## 2026-07-21 — Controlled Evidence Same-VPS Decision Supersession

- Added `DEC-0046`, superseding `DEC-0045` and confirming a dedicated internal minimal storage broker plus private ClamAV on the same Hostinger VPS for the initial controlled-evidence implementation.
- Required broker-exclusive access to the absolute private evidence mount and versioned AES-256-GCM key, application-proxied streaming, opaque immutable keys/versions, PostgreSQL authorization/idempotency/quota/quarantine/CAS/audit authority, private `INSTREAM` scanning, and bounded systemd reconciliation without detached post-response work, Redis, or a queue.
- Recorded that same-VPS filesystem storage is not WORM/Object Lock and retains root-compromise and same-disk-loss risks; required application retention/legal hold plus provider-managed or independently recoverable encrypted backup and paired restore proof.
- Kept VPS capacity/utilization, evidence quotas/high-water thresholds, encryption-key custody/recovery, Hostinger backup entitlement/location/encryption, RPO/RTO, retention/legal-hold policy, pinned ClamAV resources/signature freshness, and hosted restore proof open as production activation gates. SPF-005 is not production-ready.
- Deferred external storage until capacity, multi-host, stronger RPO/RTO, legal WORM, or tenant-scale triggers require a new decision and copy-verify-cutover migration.

## 2026-07-21 — Superseded Controlled Evidence Storage and Malware-Scanning Decision

- Added `DEC-0045`, which originally confirmed AWS S3 with GuardDuty Malware Protection and is now superseded by `DEC-0046`.
- Confirmed one private, protected bucket per environment, opaque quarantine keys, immutable exact object versions, dual GuardDuty-tag/PostgreSQL release state, non-authoritative EventBridge callback processing, and bounded database-backed reconciliation without Redis or a queue.
- Required S3 Versioning, SSE-KMS, Object Lock Governance, and cross-account replication/backup; prohibited Object Lock Compliance mode without explicit Legal approval and prohibited production `local-private` fallback or a malware-scan waiver.
- Kept account/Region/residency, ownership, budget, retention/legal hold, quota, RPO/RTO, incident/recovery ownership, and hosted staging/restore evidence open as production activation gates.

## 2026-07-21 — Authorization and Production-Authenticated E2E Gate Decision

- Added `DEC-0044`, allowing SPF-004 to close from exact-SHA production-build, database authorization, manifest, and isolated development-fixture desktop/mobile E2E evidence.
- Retained authenticated production-mode `next start` E2E as an explicit SPF-001/SPF-009 production-release blocker requiring ephemeral password/MFA fixtures and a loopback HTTPS proxy.
- Rejected production demo-authentication bypass and prohibited weakening trusted-origin, secure-cookie, session, MFA, or live-authorization validation for automation.

## 2026-07-21 — Tenant Role Administration Authorization Decision

- Added `DEC-0043` confirming that `UserRoleAssignment` remains tenant-global while all direct role administration requires `core.tenant_role_administer`.
- Required active/effective selected-company membership for target-user role actions without treating the resulting role assignment as company-bound.
- Confirmed the permission for `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER`, retained existing sensitive-role safeguards, and deferred a company-bound role-assignment schema to a future material decision.
- Clarified that controlled approval is required to grant a sensitive role but must not prevent an authorized administrator from revoking that active assignment with audit and session invalidation.
- Kept SPF-004 pending implementation and executable authorization evidence.

## 2026-06-29 — Stock Adjustment Foundation Decision

- Added `DEC-0019` confirming the Phase I Stock Adjustment foundation as non-posting `StockAdjustment` and `StockAdjustmentLine` records only.
- Updated the data dictionary, wastage/adjustment workflow, and UI specification to state that stock adjustments in this slice do not integrate approvals, post ledger movements, update balances, create opening balances, post count variance, allow backdating, or support reversal.
- Added a Dunong handoff gap for future end-user stock-adjustment documentation and release-note assessment.

## 2026-06-25 — Version 5 Full Documentation Consolidation and Agent Working Style

- Consolidated the complete ERP documentation foundation into a single current working package.
- Integrated the root `AGENTS.md` working-style rules for targeted context reading, minimal-change discipline, quiet shell/tool usage, concise completion reports, medium reasoning by default, and fresh-session guidance for stale context.
- Added `AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md` as the documented governance mirror of the root agent rules.
- Updated the documentation map, document control, root README, and documentation-agent instructions to reference the V5 behavior standard.
- Confirmed that token efficiency cannot bypass ERP audit, approval, inventory, authorization, testing, security, documentation, or material-decision controls.

## 2026-06-25 — Knowledge Base, Enablement, and Dunong Subagent Added

- Added Dunong as the Knowledge Base and Enablement Writer subagent.
- Established a separate user-facing documentation system for knowledge-base articles, FAQs, troubleshooting, training content, and end-user release summaries.
- Clarified ownership boundaries between Mithi’s source-of-truth internal documentation and Dunong’s user-facing enablement documentation.
- Added standards, templates, backlog, article categories, and a gap log to prevent user documentation from inventing business policy.
- Updated the subagent operating model, role directory, root AGENTS.md, document control, and documentation map.

## 2026-06-25 — Initial Complete Documentation Structure

- Established the cross-phase documentation foundation.
- Organized Phase I purchasing and inventory documentation into a canonical phase folder.
- Added planned documentation frameworks for Phases II–V.
- Added templates for future workflows, UI specifications, data extensions, reports, acceptance criteria, and UAT scenarios.
- Confirmed the Modern SaaS visual direction with restaurant-grade operational controls.

## Change Log Rule

Add a dated entry whenever an approved decision changes product scope, business workflow, data model, permissions, security controls, technical architecture, UI standards, or a release gate.

## 2026-06-25 — V3 subagent deliberation and decision governance

- Added parent-led structured deliberation protocol for material decisions.
- Added decision brief, scorecard, decision record template, and confirmed-decision registry.
- Updated root instructions, Codex operating model, role directory, starter prompts, and all subagent profiles.
- Clarified QA, security, code-audit, technical documentation, and knowledge-base ownership boundaries.
- Removed presentation-only nickname fields from custom subagent definitions.

---

## Version 4 — Projects & Implementation Tracker

**Date:** June 25, 2026

- Added Phase 1.5 — Projects & Implementation Tracker as an ERP-native, Trello-like coordination module.
- Added product specification, workflows, data extensions, UI specifications, build backlog, technical plan, reporting specification, UAT plan, and decision register.
- Updated the product brief, phase plan, module map, roles and permissions, security/audit model, approval boundary, data dictionary, database schema guidance, UI standard, notification rules, reporting rules, test strategy, governance decision log, root AGENTS.md, documentation map, subagent prompts, and knowledge-base backlog.
- Confirmed that task cards may link to controlled ERP records but may not mutate their approval, inventory, financial, or source workflow state.
