# OGFI ERP — Subagent Deliberation Protocol

## Purpose

This protocol makes consequential recommendations more reliable by requiring independent analysis, targeted challenge, hard control gates, and a documented decision. It is designed for a multi-branch restaurant ERP where weak decisions can affect inventory integrity, approvals, money, access control, branch operations, and future productization.

This is a **parent-led decision council**, not a free-form multi-agent chat and not a vote.

## When to use it

Use this protocol for a decision that affects any of the following:

- Business workflow or exception path
- Approval rights, delegation, financial authority, or segregation of duties
- Inventory movements, stock balance, receiving, transfer, count, wastage, adjustment, or reversal
- Database schema, data ownership, tenant isolation, or migration
- API contracts, integration behavior, or background processing
- Security, authorization, uploads, secrets, session behavior, or auditability
- Modern SaaS UI choices that could hide mandatory context or cause branch-user error
- Reporting definitions that change management decisions
- Production deployment, rollback, backup, recovery, or release readiness
- Pilot, training, adoption, or operational fallback process

Do not use the protocol for simple copy changes, isolated styling changes, straightforward bug fixes with an existing documented answer, or one-file housekeeping.

## Decision status values

| Status | Meaning | Implementation allowed? |
|---|---|---|
| Draft | Decision brief exists; analysis has not started. | No |
| Under Review | Independent positions or challenge review are in progress. | No |
| Open | A material policy or control question remains unresolved. | No |
| Confirmed | Parent agent or authorized human accepted the chosen option. | Yes |
| Superseded | A later decision replaces this one. | Only as directed by the newer record |
| Rejected | Option is not approved. | No |

## Roles

### Parent agent — Decision Chair

The parent agent frames the decision, selects specialists, compiles the debate packet, checks hard gates, consolidates the recommendation, and keeps responsibility for the final answer. The parent does not delegate accountability.

### Specialists

Specialists provide bounded evidence and challenge reasoning inside their discipline. They do not vote, make policy unilaterally, or edit implementation while the decision is unresolved.

### Mithi — Decision record steward

Mithi records only confirmed material decisions under `docs/core/00-governance/decisions/`. Mithi must preserve rejected alternatives, safeguards, and follow-up actions.

## Process

### Round 0 — Decision brief

The parent creates a brief using `DECISION_BRIEF_TEMPLATE.md`.

The brief must include:

- Decision ID and question
- Why the decision is needed now
- Affected phase, modules, users, and records
- Current state and documented facts
- Non-negotiable constraints
- Feasible options, including a “do nothing / defer” option where relevant
- Required source documents
- Decision deadline and owner

### Round 1 — Independent positions

The parent selects three or four relevant specialists. They review independently before seeing other opinions.

Every first-round position must contain:

1. Recommended option
2. Alternatives considered
3. Why the recommendation works
4. What could fail
5. Assumptions and evidence
6. Hard blockers
7. Required safeguards and tests
8. Confidence level

### Round 2 — Targeted challenge

The parent compiles the first-round results into a concise debate packet. Only agents with a meaningful challenge role receive the packet.

Each challenger must state:

1. Strongest part of the recommendation
2. Most likely failure mode
3. Evidence that would disprove or weaken it
4. Safeguard needed to make it acceptable
5. Severity: Blocking / Serious but manageable / Minor

Use a challenge round only when the decision is material and there is a genuine conflict, a high-risk assumption, or a control weakness. Do not manufacture debate for its own sake.

### Round 3 — Decision

The parent checks the hard gates, compares options using the scorecard, and produces a clear conclusion:

- Chosen option
- Why it was selected
- Rejected alternatives and why
- Required safeguards
- Tests and acceptance evidence
- Documentation updates
- Follow-up owner and date
- Human confirmation requirement, if any

If a business policy remains unclear, record it as `OPEN` in `OPEN_DECISIONS_AND_ASSUMPTIONS.md`. Do not code around uncertainty by silently hardcoding a policy.

## Hard gates

No option can pass if it fails any applicable hard gate:

1. Tenant/company/brand/location scope is preserved.
2. Authorization is enforced on the server.
3. Users cannot approve their own money or controlled stock action where segregation is required.
4. Inventory is ledger-driven; no uncontrolled direct balance mutation occurs.
5. Audit history remains complete and material records are cancelled/reversed, not destructively deleted.
6. Required transactions are atomic, idempotent, and recoverable.
7. The proposal stays inside the approved phase scope.
8. A reasonable rollback, reversal, migration, or operational fallback exists.

## Recommended councils

| Decision type | First-round council | Typical challenger |
|---|---|---|
| Business workflow | Amihan, Dalisay, Hiraya, Diwata | Lualhati or Luningning as needed |
| Inventory/data integrity | Dalisay, Hiraya, Ligaya, Lualhati | Luningning or Mayari |
| UI / usability | Diwata, Dalisay, Lakambini, Lualhati | Sinag for branch adoption |
| Security / permissions | Luningning, Dalisay, Hiraya, Mayari | Lualhati for verification |
| Reporting / metrics | Mutya, Dalisay, Diwata, Amihan | Hiraya for data architecture |
| Deployment / release | Mayumi, Luningning, Tala, Lualhati | Mayari for code risk |
| Pilot / training / adoption | Sinag, Dunong, Dalisay, Diwata | Tala for release readiness |

## Evidence rules

- Cite exact files, workflows, screens, endpoints, schema entities, or tests where possible.
- Separate verified facts from assumptions.
- Treat “industry standard” as a starting point, not proof that it matches OGFI policy.
- Do not present an implementation convenience as a business requirement.
- Do not allow a beautiful UI recommendation to remove required operational context.

## Outputs and storage

Store confirmed material decisions under:

```text
/docs/core/00-governance/decisions/
```

Store unresolved policy questions in:

```text
/docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md
```

Decision briefs and temporary debate packets may remain in the task conversation, issue tracker, or a temporary working folder. Do not treat a temporary debate packet as a source-of-truth policy document.
