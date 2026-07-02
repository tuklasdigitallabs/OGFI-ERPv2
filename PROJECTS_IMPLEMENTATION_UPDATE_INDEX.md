# Projects & Implementation Tracker Update Index

## What changed

This Version 4 package adds an ERP-native Projects & Implementation Tracker as Phase 1.5 and updates the core product, controls, data, design, security, notification, reporting, testing, governance, knowledge-base, and subagent-prompt documentation.

## Core decisions

- Phase 1.5 is scheduled after Phase I stabilization by default.
- The tracker is a linked coordination layer, not a replacement for controlled ERP source records.
- Task actions do not mutate Purchase Requests, POs, receiving, transfers, approvals, inventory, finance, or future Expansion records.
- Project visibility and source-record summaries are permission-checked.
- MVP emphasizes board/list/calendar/My Tasks, blockers, milestones, evidence, notifications, and reporting—not advanced project scheduling.

## Start here

1. `docs/phases/phase-01-5-projects-implementation/README.md`
2. `PROJECTS_IMPLEMENTATION_PRODUCT_SPEC.md`
3. `implementation/PHASE1_5_BUILD_BACKLOG.md`
4. `quality/PROJECTS_IMPLEMENTATION_UAT_PLAN.md`
5. `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`

## Updated core documents

- Product brief, implementation roadmap, module map
- Roles/permissions, approval boundary, security/audit, notifications
- Data dictionary and database schema guidance
- Modern SaaS UI standard
- Reporting and UAT strategy
- Root and docs `AGENTS.md` instructions
- Governance decision log and open decisions register
- Subagent starter prompts and Phase 1.5 knowledge-base backlog
