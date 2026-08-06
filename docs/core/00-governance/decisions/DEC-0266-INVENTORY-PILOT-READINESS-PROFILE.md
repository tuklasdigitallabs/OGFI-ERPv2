# DEC-0266 — Inventory Control Pilot Readiness Profile

## Metadata

- Decision ID: `DEC-0266`
- Status: Confirmed
- Date: 2026-07-31
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related decisions: `DEC-0258`, `DEC-0259`, `DEC-0036`

## Decision

The pilot-readiness checker will support an explicit, allowlisted
`inventory_control` profile in addition to the existing combined Phase I /
Phase 1.5 profile.

The `inventory_control` profile evaluates only the controls admitted by
`DEC-0258`. It labels Projects & Implementation Tracker checks as
`DEFERRED — outside DEC-0258 Inventory Control Pilot` and grants them no
readiness credit. Organization, named-user/role/scope, approval, supplier/item/
UOM, inventory, ledger, release-gate, security, recovery, and UAT evidence
controls that are in pilot scope remain mandatory. The combined profile remains
unchanged for future Phase I / Phase 1.5 release review.

The profile name and included/deferred modules must be printed in every
readiness artifact. Arbitrary threshold combinations are not a substitute for
profile selection, and no profile may create operational authority or replace
owner-confirmed cohort configuration.

## Rationale

`DEC-0258` explicitly defers Phase 1.5 Projects, Expansion, Marketing,
Workforce, broad Restaurant Operations, and Finance transaction workspaces from
the bounded Inventory Control Pilot while requiring them to remain visible in
navigation. The existing checker is labelled Phase I / Phase 1.5 and requires
project templates, projects, members, blockers, milestones, risks, and links by
default. Enriching the disposable seed to satisfy those counts would turn
unrelated demo rows into misleading pilot evidence. Lowering thresholds ad hoc
would be opaque and could accidentally waive an included Phase I control.

The explicit profile makes the scope boundary auditable while preserving the
broad checker for the later combined release. It does not lower the pilot's
identity, authorization, approval segregation, inventory-ledger, audit,
recovery, production-authentication, or UAT requirements.

## Alternatives considered

1. **Selected — explicit allowlisted profile.** Clear scope, printed in the
   artifact, and difficult to confuse with combined readiness.
2. **Documented zero threshold overrides only.** Rejected as the primary
   interface because run-specific environment variables are easy to omit or
   misapply, though they remain available for an owner-approved exceptional
   scenario under the evidence guide.
3. **Enrich the standard disposable seed.** Rejected because fictional Phase 1.5
   rows do not prove operational project readiness and could be mistaken for
   approved pilot configuration.
4. **Remove Phase 1.5 checks permanently.** Rejected because it would break the
   broader combined release assessment.

## Hard gates and safeguards

- The combined profile remains the default and is not weakened.
- `inventory_control` must retain all included Phase I and release-readiness
  checks; only explicitly deferred Phase 1.5 tracker checks are omitted from
  pass/fail counting and shown as deferred.
- The profile is allowlisted; unknown values fail closed.
- The evidence header records profile, included modules, deferred modules, and
  threshold values.
- Synthetic manifests and disposable seed rows remain non-authoritative and
  cannot establish real users, policy, opening stock, UAT, or release approval.
- Later Phase 1.5 UAT uses the combined profile with non-zero project thresholds
  and real scoped records.

## Evidence and model fallback

The broad strict run on 2026-07-31 failed honestly because its default Phase
1.5 counts and release gates were absent in the disposable seed. Independent
Workflow/QA and Security/Architecture reviewers recommended an explicit scope
boundary rather than seed enrichment. Code Spark and GPT-5.4-mini were
unavailable; GPT-5.6 Terra was used as the closest permitted fallback without
relaxing the deliberation protocol or hard gates.
