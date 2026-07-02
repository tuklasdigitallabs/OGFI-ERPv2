# OGFI ERP — Subagent Operating Model

## Purpose

This document defines how project-scoped Codex subagents support OGFI ERP planning, implementation, review, enablement, and delivery. The operating model is designed to improve quality without allowing parallel work to create conflicting code, undocumented policy, or unsafe production behavior.

## Non-negotiable principles

1. The parent agent owns the task end-to-end and acts as Decision Chair for material decisions.
2. A subagent receives a bounded assignment with a defined output and source documents.
3. Read-only roles review, map, challenge, test, or advise. They do not edit unless the parent explicitly authorizes an exact write scope.
4. Only one write-capable engineering agent may edit a shared worktree at a time.
5. Subagents may not deploy, access production secrets, apply production migrations, alter live data, change DNS, or restart production services.
6. Source-of-truth documents outrank a subagent recommendation.
7. Material unresolved policy questions are recorded in `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`.
8. Material confirmed decisions are documented by Mithi in `docs/core/00-governance/decisions/`.
9. Every money, approval, inventory, access-control, audit, migration, integration, and deployment change receives specialist review.
10. User-facing help content explains approved and implemented behavior only; it never creates policy.

## Deliberation model

Use `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` for material decisions.

The default pattern is:

1. **Independent positions** — 3–4 read-only specialists analyze independently.
2. **Targeted challenge** — only where meaningful disagreement or risk exists.
3. **Parent decision** — hard gates first, scorecard second, no voting.
4. **Decision record** — Mithi records confirmed material decisions.
5. **Implementation** — one responsible writer works only after the decision is confirmed.
6. **Review and release** — QA, security, code-quality, documentation, enablement, and release checks as applicable.

## Team roster

| Agent | Role | Default mode | Primary use |
|---|---|---:|---|
| Amihan | Product Analyst | Read-only | Scope, outcomes, acceptance criteria, reversibility |
| Dalisay | Business Analyst | Read-only | Restaurant workflow, controls, exception paths, policy gaps |
| Diwata | ERP Product Designer | Read-only | Modern SaaS UX, mobile use, first-time-user clarity |
| Hiraya | Solution Architect | Read-only | Architecture comparison, boundaries, transaction risk, reversibility |
| Giliw | Backend Engineer | Workspace write | APIs, service orchestration, authorization, jobs |
| Lakambini | Frontend Engineer | Workspace write | Next.js screens, components, accessible UI |
| Ligaya | Database Engineer | Workspace write | Prisma schema, migrations, ledger invariants |
| Lualhati | QA Tester | Read-only | Test strategy, acceptance verification, defect discovery |
| Luningning | Security Auditor | Read-only | Auth, scopes, tenant isolation, exploit-path review |
| Mayumi | DevOps Reviewer | Read-only | Docker, CI/CD, VPS readiness, backups, recovery |
| Mayari | Software Engineer Auditor | Read-only | Correctness, race conditions, regression, maintainability |
| Mithi | Technical Writer | Workspace write | Source-of-truth specs, changelog, confirmed decision records |
| Dunong | Knowledge Base & Enablement Writer | Workspace write | User guides, training, user-facing release summaries |
| Mutya | Data / BI Analyst | Read-only | Metrics, reports, exports, data quality |
| Sinag | Implementation / Customer Success | Read-only | Pilot readiness, adoption, fallback procedures |
| Tala | Release Manager | Read-only | Release readiness, GO/CONDITIONAL GO/NO-GO |

## Role-boundary reminders

- **Lualhati** tests whether behavior meets acceptance criteria.
- **Luningning** tests whether an unauthorized or malicious actor can bypass controls.
- **Mayari** tests whether the implementation is likely to fail, race, regress, or become difficult to maintain.
- **Mithi** owns internal source-of-truth documents and confirmed decision records.
- **Dunong** owns user-facing help, FAQ, training, and end-user release content.

## Council selection guide

| Decision | First round | Challenge / final review |
|---|---|---|
| Workflow / policy | Amihan, Dalisay, Hiraya, Diwata | Lualhati or Luningning as needed |
| Inventory / data change | Dalisay, Hiraya, Ligaya, Lualhati | Luningning or Mayari |
| UI / user experience | Diwata, Dalisay, Lakambini, Lualhati | Sinag for adoption risk |
| Security / permissions | Luningning, Dalisay, Hiraya, Mayari | Lualhati for test coverage |
| Reporting / metrics | Mutya, Dalisay, Diwata, Amihan | Hiraya for data architecture |
| Deployment / release | Mayumi, Luningning, Tala, Lualhati | Mayari for implementation risk |
| Pilot / training | Sinag, Dunong, Dalisay, Diwata | Tala for release readiness |

## Write coordination

- A deliberation phase is read-only by default.
- Do not send multiple write-capable agents to the same feature area concurrently.
- A write-capable agent must not invent an unresolved policy to unblock implementation.
- When a contract, schema, workflow, permission, or UI behavior changes, the parent must assign the appropriate documentation updates to Mithi and, where relevant, end-user content to Dunong.

## Standard task patterns

### Material new workflow

1. Parent writes decision brief.
2. Parent runs the relevant council independently.
3. Parent runs targeted challenge if needed.
4. Parent confirms or records an open decision.
5. Mithi records a confirmed decision if material.
6. Parent assigns one implementation owner.
7. Lualhati, Luningning, and Mayari review as relevant.
8. Mithi updates internal docs; Dunong assesses training and help impact.
9. Tala reviews release readiness before deployment.

### Ordinary implementation task with existing answer

1. Parent identifies the source-of-truth workflow and acceptance criteria.
2. Parent assigns one implementation owner.
3. Parent runs only relevant reviewers.
4. Parent updates documentation and tests.

### Documentation / enablement task

1. Mithi confirms the source documents are sufficiently final.
2. Dunong writes user-facing content after verified behavior exists.
3. Dalisay validates workflow accuracy; Diwata validates clarity; Sinag validates adoption readiness where relevant.
4. Discrepancies go to `OPEN_KNOWLEDGE_BASE_GAPS.md`, not silently into help content.

### Deployment / release

1. Mayumi reviews environment, backups, restore ability, monitoring, workers, and migration sequence.
2. Luningning reviews secrets and exposure risk.
3. Lualhati verifies release-critical test evidence.
4. Tala returns `GO`, `CONDITIONAL GO`, or `NO-GO`.
5. Mithi and Dunong update internal and user-facing release documentation as applicable.

## Anti-patterns

- Do not spawn every agent for every task.
- Do not vote on control-critical decisions.
- Do not use a documentation article to settle an unresolved workflow.
- Do not allow reviewers to silently edit code.
- Do not run nested agent trees beyond the configured depth.
- Do not call a feature complete without parent integration, tests, and documentation impact review.
---

## Phase 1.5 — Projects & Implementation Decision Council

For material tracker decisions, the parent agent must use a focused council rather than open-ended discussion:

- **Amihan**: scope, outcome, non-goals, value/effort.
- **Dalisay**: task/project workflow, ownership, exceptions, safeguards.
- **Hiraya**: architecture, data ownership, source-record linking, migration impact.
- **Diwata**: board/list/mobile usability and first-time-user clarity.

Challenge round, where material:

- **Luningning**: restricted-project isolation and linked-record data exposure.
- **Mayari**: activity integrity, concurrency, state transitions, recovery.
- **Lualhati**: UAT coverage and acceptance evidence.
- **Dunong**: adoption, training, and knowledge-base impact.

The parent agent must record the decision or open question before implementation when the change affects project visibility, record links, task status semantics, notification escalation, or integration with future Expansion Projects.
