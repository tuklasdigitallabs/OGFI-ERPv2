# OGFI ERP — Documentation Map

## Repository-level controls

| Location | Purpose |
|---|---|
| `AGENTS.md` | ERP-wide implementation, business-control, UI, testing, and documentation rules for Codex |
| `.codex/agents/` | Project-scoped custom subagent definitions, including Dunong for user-facing enablement documentation |
| `.env.example` | Environment-variable template; never place real credentials in the repository |
| `docker-compose.example.yml` | Reference container topology for local/staging/production setup |

## Core Standards (`docs/core`)

| Area | Purpose |
|---|---|
| `00-governance` | Document control, open decisions, master-data ownership, non-functional standards, technical decision log, subagent role directory, decision governance, and agent working-style standard |
| `01-product` | Product purpose, phase roadmap, module ownership |
| `02-controls` | Roles, approvals, security, audit and notification rules |
| `03-data` | Data dictionary and database schema |
| `04-design` | Modern SaaS visual system, components, mobile rules, UX state rules |
| `05-technical` | Architecture, API, development, deployment, stack, repository bootstrap, and subagent operating rules |
| `06-reporting` | Dashboards, reports, exports and permissions |
| `07-quality` | Test strategy, UAT process and release criteria |
| `08-knowledge-and-enablement` | Knowledge-base, user release-note, training, and documentation-ownership standards |

## Operational documentation (`docs/`)

| Location | Purpose |
|---|---|
| `docs/knowledge-base/` | Role-based user guidance, FAQs, troubleshooting, glossary, and Phase I help backlog |
| `docs/release-notes/` | User-facing release summaries |
| `docs/training/` | Training guides, practice material, and adoption aids |
| `docs/templates/` | Reusable workflow, UI, UAT, report, data, knowledge-base, release-note, and training templates |
| `docs/references/` | Wireframes and visual direction notes; reference only, not functional source of truth |
| `docs/archive/` | Guidance for frozen exports; not a working source |

## Phase Directories (`docs/phases`)

| Phase | Scope | Status |
|---|---|---|
| `phase-01-procurement-inventory` | Foundation controls: purchasing, inventory, receiving, transfers, stock counts, wastage, approvals | Build-ready baseline |
| `phase-02-restaurant-operations-and-food-cost` | Recipes, menu costing, food cost, operational controls, maintenance, food safety, and Marketing Operations planning | Marketing Operations add-on docs included for review; implementation remains gated |
| `phase-03-finance-and-workforce` | Finance/accounting system-of-record planning, budgets, expenses, payment workflows, payroll inputs, scheduling and workforce operations | Finance/accounting add-on docs included for review; implementation remains gated |
| `phase-04-expansion-projects` | Branch Expansion & Construction planning: site pipeline, feasibility, capex, construction, permits, opening readiness and post-opening review | Branch Expansion & Construction add-on docs included for review; implementation remains gated |
| `phase-05-integrations-and-productization` | POS/accounting/attendance integrations, multi-tenant administration, client onboarding and productization | Planned structure; detailed business decisions pending |

## Required Reading by Role

| Role | Read first |
|---|---|
| Product / management | Product Brief, Phase Plan, Module Map, Approval Matrix |
| UI/UX | Design Tokens, UI Implementation Standard, Mobile Rules, the applicable screen spec |
| Backend | System Architecture, Database Schema, API Conventions, Security and Audit Model, workflow spec |
| Frontend | UI Implementation Standard, Component Library, UX States, screen spec, role/permission rules |
| QA | Test Strategy, relevant workflow, acceptance criteria, permissions and approval rules |
| Data migration | Data Dictionary, Master Data Governance, Migration and Seed Data Plan |
| Knowledge-base writer | Knowledge Base Standard, Ownership and Handoffs, relevant workflow/UI/role specs, verified implemented behavior |
| Trainer / implementation lead | Training Content Standard, relevant knowledge-base articles, Phase UAT scenarios |

## Subagent deliberation and decision records

| Document | Purpose |
|---|---|
| `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` | Parent-led independent analysis, challenge review, hard-gate, and decision process |
| `docs/core/00-governance/DECISION_BRIEF_TEMPLATE.md` | Standard material-decision brief |
| `docs/core/00-governance/DECISION_SCORECARD.md` | Hard gates and weighted option comparison |
| `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md` | Confirmed decision record template |
| `docs/core/00-governance/decisions/README.md` | Storage and naming rules for confirmed decisions |
| `docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md` | Agent coordination, boundaries, councils, and release patterns |


## Phase 1.5 — Projects & Implementation Tracker

`docs/phases/phase-01-5-projects-implementation/` contains the project tracker product specification, workflows, data extension, UI specifications, build backlog, technical plan, reports, UAT plan, and decision register. It is linked to the core product, control, security, data, design, reporting, quality, and governance documents.

The shared Work Management Engine add-on in this phase defines the common planning layer for work items, assignments, checklists, comments, attachments, activity, notifications, blockers, calendars, boards, and archival behavior used by Projects, Branch Expansion & Construction, and Marketing Operations. `docs/core/00-governance/decisions/DEC-0007-SHARED-WORK-MANAGEMENT-ENGINE-WITH-SPECIALIZED-MODULES.md` records the confirmed shared-engine direction.

## Phase II — Marketing Operations Add-On

`docs/phases/phase-02-restaurant-operations-and-food-cost/marketing-operations/` contains the Marketing Operations planning add-on: product specification, workflows, data-model extension, build plan, UAT plan, and UI specs for marketing calendar and Kanban board behavior. The active repository phase folder is `phase-02-restaurant-operations-and-food-cost`; do not create a parallel `phase-02-restaurant-operations` folder.

These documents are planning and review inputs only. They do not authorize marketing code, schema, migration, route, UI, dependency, deployment, or production campaign/promotion behavior.

## Phase IV — Branch Expansion & Construction Add-On

`docs/phases/phase-04-expansion-projects/` now includes Branch Expansion & Construction planning documents for lifecycle gates, calendar/timeline/milestones, risks/blockers/punch lists, data model, build plan, UAT, dashboards, and calendar/timeline UI.

These documents are planning and review inputs only. They do not authorize expansion code, schema, migration, route, UI, dependency, deployment, contractor portals, financial posting, payment release, or production branch-opening workflow behavior.

## Phase III — Finance & Accounting Add-On

`docs/phases/phase-03-finance-and-workforce/` now includes the Finance & Accounting planning add-on: product specification, data-model extension, general ledger, posting/reversal, period close, accounts payable, bank/cash reconciliation workflows, build plan, UAT plan, reporting specification, posting-rule template, and knowledge-base backlog. `docs/core/00-governance/decisions/DEC-0006-ERP-OFFICIAL-ACCOUNTING-SYSTEM-OF-RECORD.md` records the confirmed accounting-system-of-record direction.

These documents are planning and review inputs only. They do not authorize finance code, schema, migration, route, UI, dependency, deployment, or production-accounting implementation.


## V5 Consolidation and Agent Working Style

| Document | Purpose |
|---|---|
| `AGENTS.md` | Authoritative Codex and subagent implementation instructions, including context discipline, minimal-change rules, concise output, and long-session handling |
| `docs/core/00-governance/AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md` | Documentation mirror of the root agent working-style policy; does not replace `AGENTS.md` |
| `docs/core/00-governance/CHANGELOG.md` | Consolidated change history including V5 working-style update |
