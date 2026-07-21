# OGFI ERP — Documentation Changelog

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
