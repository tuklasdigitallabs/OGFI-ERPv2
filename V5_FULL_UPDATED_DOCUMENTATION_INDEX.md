# OGFI ERP — V5 Full Updated Documentation Index

## Purpose

This is the current consolidated distribution package for the OGFI ERP documentation foundation. It supersedes the earlier standalone V1–V4 distributions as the recommended starting point for repository setup and Codex work.

## Included Foundation

- Multi-company, multi-brand, multi-branch restaurant ERP product and phase roadmap
- Phase I procurement, inventory, approval, receiving, transfer, stock-count, wastage, reporting, UAT, and design specifications
- Phase 1.5 Projects & Implementation Tracker specification and build package
- Cross-phase roles, approvals, security, audit, data, API, architecture, VPS deployment, reporting, quality, and design standards
- Modern SaaS UI direction with restaurant-grade operational controls
- Hostinger VPS technical stack and repository bootstrap guidance
- Custom subagent team, structured deliberation protocol, decision templates, and release gates
- Dunong knowledge-base and enablement documentation system
- Root `AGENTS.md` with token-efficient, minimal-change working style rules

## Start Order

1. `README.md`
2. `AGENTS.md`
3. `DOCUMENTATION_MAP.md`
4. `docs/core/01-product/ERP_PRODUCT_BRIEF.md`
5. `docs/core/01-product/ERP_PHASE_IMPLEMENTATION_PLAN.md`
6. `docs/phases/phase-01-procurement-inventory/README.md`
7. `docs/core/05-technical/TECH_STACK_DECISION.md`
8. `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` when a material decision is needed

## Key V5 Additions

- `AGENTS.md` is updated with context discipline, scoped planning, minimal-change implementation, quiet tool use, concise output, and long-session handling.
- `docs/core/00-governance/AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md` provides the reviewable mirror of those instructions.
- `docs/core/00-governance/CHANGELOG.md` and `TECHNICAL_DECISION_LOG.md` record the change.

## Source-of-Truth Rule

Do not use earlier ZIP exports as working copies. Extract this package into the ERP repository and keep one canonical copy of each document.
