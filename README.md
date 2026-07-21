# OGFI ERP — Complete Project Foundation (V5)

**Product:** OGFI ERP — multi-brand, multi-branch F&B and restaurant operations ERP
**Primary operating company:** One Gourmet Foods Inc. (OGFI)
**Current build focus:** Phase I — Procurement, Inventory, Approvals, Receiving, Transfers, Stock Counts, and Wastage Controls
**Architecture direction:** Tenant-ready for future sale to other restaurant groups
**Infrastructure direction:** Hostinger VPS using Docker Compose, Next.js + TypeScript, PostgreSQL + Prisma, a private same-VPS encrypted evidence broker with ClamAV, and Caddy reverse proxy. External object storage is a future migration option only. Redis/BullMQ worker capability is deferred and not part of the current Phase I / Phase 1.5 no-queueing release scope.
**Last updated:** July 21, 2026
**Current consolidated release:** V5 — full documentation package with Projects & Implementation Tracker, structured subagent deliberation, Dunong knowledge-base system, and token-efficient agent working style

---

## Start Here

1. Read [`AGENTS.md`](AGENTS.md) before using Codex or editing the project.
2. Read [`docs/core/01-product/ERP_PRODUCT_BRIEF.md`](docs/core/01-product/ERP_PRODUCT_BRIEF.md).
3. Read [`docs/core/01-product/ERP_PHASE_IMPLEMENTATION_PLAN.md`](docs/core/01-product/ERP_PHASE_IMPLEMENTATION_PLAN.md).
4. Read [`docs/core/01-product/ERP_MODULE_MAP.md`](docs/core/01-product/ERP_MODULE_MAP.md).
5. For Phase I implementation, use [`docs/phases/phase-01-procurement-inventory/README.md`](docs/phases/phase-01-procurement-inventory/README.md).
6. Before building or reviewing a feature, read its workflow, UI specification, data model, acceptance criteria, permissions, and approval rules.
7. For end-user documentation, start with [`docs/core/08-knowledge-and-enablement/KNOWLEDGE_BASE_STANDARD.md`](docs/core/08-knowledge-and-enablement/KNOWLEDGE_BASE_STANDARD.md).
8. For Phase III finance/accounting planning, start with [`docs/phases/phase-03-finance-and-workforce/FINANCE_ACCOUNTING_PRODUCT_SPEC.md`](docs/phases/phase-03-finance-and-workforce/FINANCE_ACCOUNTING_PRODUCT_SPEC.md) and [`docs/core/00-governance/decisions/DEC-0006-ERP-OFFICIAL-ACCOUNTING-SYSTEM-OF-RECORD.md`](docs/core/00-governance/decisions/DEC-0006-ERP-OFFICIAL-ACCOUNTING-SYSTEM-OF-RECORD.md).
9. For shared work-management, Branch Expansion & Construction, and Marketing Operations planning, start with [`docs/core/00-governance/decisions/DEC-0007-SHARED-WORK-MANAGEMENT-ENGINE-WITH-SPECIALIZED-MODULES.md`](docs/core/00-governance/decisions/DEC-0007-SHARED-WORK-MANAGEMENT-ENGINE-WITH-SPECIALIZED-MODULES.md).

---

## Documentation Rule

- Files under `docs/core/` are **cross-phase standards**. They apply to all current and future modules unless an approved decision changes them.
- Files under `docs/phases/` are **phase-specific build specifications**. They define detailed module behavior, screens, data extensions, UAT, and release gates for that phase.
- Files under `docs/knowledge-base/`, `docs/release-notes/`, and `docs/training/` are **user-facing enablement documentation**. They explain approved and implemented behavior; they never create business policy.
- Phase I is documented in implementation detail.
- Phases II–V include a complete documentation structure and planned-specification frameworks. Phase II includes Marketing Operations planning, Phase III includes finance/accounting planning, and Phase IV includes Branch Expansion & Construction planning, but implementation rules must still be finalized before development.
- Do not duplicate a document in multiple working locations. This repository contains one canonical copy of each file.
- Archived ZIP exports are for sharing only and must never become competing sources of truth.

---

## Codex Agents

Custom agents live in `.codex/agents/`. The core team includes planning, engineering, QA, security, DevOps, documentation, and release roles.

- **Mithi** maintains source-of-truth internal documentation.
- **Dunong** creates end-user knowledge-base articles, FAQs, troubleshooting, training materials, and user-facing release summaries.

Read [`docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md`](docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md) and [`docs/core/00-governance/SUBAGENT_ROLE_DIRECTORY.md`](docs/core/00-governance/SUBAGENT_ROLE_DIRECTORY.md) before using subagents.

---

## Architecture of the Repository

```text
ERP/
├── AGENTS.md
├── .codex/                 # Custom Codex subagents
├── apps/                   # Created when application scaffold begins
├── packages/               # Created when shared packages begin
├── infra/                  # Created when VPS/Docker/Caddy setup begins
├── docs/
│   ├── core/               # Cross-phase product, controls, data, design, technical, quality and enablement standards
│   ├── phases/             # Phase-specific build documentation
│   ├── knowledge-base/     # User-facing help and troubleshooting
│   ├── release-notes/      # User-facing release summaries
│   ├── training/           # Training and adoption material
│   ├── templates/          # Required templates for future specs and enablement content
│   ├── references/         # Source wireframes and visual decision notes
│   └── archive/            # Guidance for frozen exports; not a working source
└── README.md
```

See [`DOCUMENTATION_MAP.md`](DOCUMENTATION_MAP.md) for the full map.

---

## Subagent deliberation update

This foundation now includes a parent-led decision council for material ERP decisions. Use `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` before implementation when a decision affects money, inventory, approvals, permissions, schema, tenancy, integrations, deployment, reporting definitions, release readiness, or adoption.

Start with:

- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_BRIEF_TEMPLATE.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md`


---

## Phase 1.5 — Projects & Implementation Tracker

The foundation now includes Phase 1.5 documentation for an ERP-native project tracker and shared Work Management Engine. This phase is delivered after Phase I stabilization by default. See `docs/phases/phase-01-5-projects-implementation/README.md`.

## Work Management, Expansion, and Marketing Planning

The repository now includes planning documents for one shared Work Management Engine with specialized Branch Expansion & Construction and Marketing Operations modules. These documents are review inputs only. They do not authorize code, schema, migrations, routes, UI, dependencies, deployment, public sharing, contractor portals, financial posting, inventory posting, payment release, or production campaign/branch-opening behavior until the required decision council and explicit build approval are complete.

## Phase III — Finance & Accounting Planning

The repository now includes Phase III Finance & Accounting planning documents for making OGFI ERP the official accounting system of record. These documents are review inputs only. They do not authorize finance code, schema, migrations, routes, UI, deployment, or production accounting behavior until the Finance & Accounting Decision Council and finance-owner review are complete.


## V5 Consolidation Update

This release is the consolidated working package. It includes the complete cross-phase documentation foundation, Phase I build-ready procurement and inventory specifications, Phase 1.5 Projects & Implementation Tracker specifications, the Modern SaaS design direction, Hostinger VPS technical bootstrap, custom subagents, the Dunong knowledge-base system, structured subagent deliberation, and the root agent working-style rules.

For agent behavior, treat [`AGENTS.md`](AGENTS.md) as authoritative. See [`docs/core/00-governance/AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md`](docs/core/00-governance/AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md) for the documented policy mirror.

---

## Local Application Scaffold

The Phase I Core Administration scaffold now lives under `apps/`, `packages/`, and `infra/`.

Start local setup with [`README_LOCAL_DEVELOPMENT.md`](README_LOCAL_DEVELOPMENT.md). The current runnable milestone is limited to configured sign-in, authorized Company / Brand / Location context selection, draft Purchase Request creation, submit-for-approval, approval action, Core Administration inspection, audited location scope assignment/deactivation, and audit history viewing.

Purchase Orders, receiving, inventory posting, transfers, wastage, dashboards, reports, external integrations, and VPS deployment are intentionally deferred.
# OGFI-ERPv2
