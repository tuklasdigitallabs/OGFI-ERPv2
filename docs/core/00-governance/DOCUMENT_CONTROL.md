# OGFI ERP — Document Control and Change Management

## Purpose

This document prevents conflicting specifications and untraceable decisions as the OGFI ERP grows from Phase I into a multi-tenant restaurant platform.

## Source-of-Truth Rules

1. The canonical documents in this repository are the only active specifications.
2. A workflow, UI, data, API, or permission change must update every impacted canonical document before code is treated as complete.
3. If documents conflict, apply this precedence order:
   1. Approved executive / product decision recorded in the Technical Decision Log or Decision Register
   2. Product Brief and Phase Implementation Plan
   3. Security, roles, approval, and data-control standards
   4. Phase-specific workflow and UI specification
   5. Build backlog and implementation plan
4. Archive exports and ZIP files are read-only distribution copies. They are never the source of truth.
5. Never hardcode a policy that is identified as configurable in the product or approval documents.

## Change Types

| Change Type | Example | Required Documentation Update |
|---|---|---|
| Product scope | Adding Finance to Phase I | Product Brief, Phase Plan, Module Map, phase backlog |
| Workflow | Direct supplier purchase rule changes | Workflow, Approval Matrix, screen spec, UAT |
| Data | New expiry field required | Data Dictionary, Database Schema, API, migration plan |
| Security | New role or access rule | Roles, Security Model, relevant screen spec, UAT |
| UI | New status state or form action | UI standard / component library, screen spec, UX state spec |
| Technical | New integration or stack choice | Technical Decision Log, System Architecture, API, deployment plan |
| User enablement | New or changed user-facing task | Knowledge-base article, release note, or training material; source spec only if behavior changes |

## Document Status Labels

- **Foundation / Approved Baseline** — applies across phases and should be followed.
- **Build-ready** — detailed enough for implementation and UAT.
- **Planned Framework** — file exists and scope is known; detailed decisions remain before development.
- **Superseded** — kept only for history and must not guide active work.

## Review Gates

Before a phase begins implementation, confirm:

- Workflow specifications are build-ready.
- Data extensions are documented.
- Screen specifications are complete.
- Roles and approval paths are confirmed or explicitly configurable.
- Reports and notifications are defined.
- UAT scenarios and release gates are complete.


## Knowledge-base control rule

Knowledge-base articles, end-user release notes, and training materials are derived documentation. They must reflect approved specifications and verified implemented behavior. They may not establish a new workflow, permission, approval rule, or policy. Any conflict is logged in `docs/knowledge-base/OPEN_KNOWLEDGE_BASE_GAPS.md` and resolved through the normal document-control process.

## Deliberation and decision-control documents

- `SUBAGENT_DELIBERATION_PROTOCOL.md` controls how material recommendations are challenged and concluded.
- `DECISION_BRIEF_TEMPLATE.md` and `DECISION_SCORECARD.md` are process templates, not source-of-truth policy.
- Confirmed decisions are stored under `decisions/` and become source-of-truth only when marked `Confirmed` by an authorized parent/human decision owner.
- An `Open` decision must not be implemented as a permanent policy.

---

## Version 4 Foundation Update

Phase 1.5 — Projects & Implementation Tracker documentation is part of the authoritative project foundation. The phase folder is authoritative for tracker-specific behavior; core documents remain authoritative for shared controls, data, design, security, notifications, reporting, testing, and governance.



## Version 5 Consolidation Update

This V5 package is the current consolidated distribution of the canonical documentation set. It incorporates the Phase 1.5 Projects & Implementation Tracker, the subagent deliberation protocol, the Dunong knowledge-base system, and the root `AGENTS.md` working-style and token-efficiency rules. The root `AGENTS.md` remains the authoritative instruction file for implementation behavior; the governance standard is a documented mirror for review and traceability.
