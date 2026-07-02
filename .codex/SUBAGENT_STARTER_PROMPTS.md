# OGFI ERP — Subagent Starter Prompts

## Run a material-decision council

> Create a decision brief using `docs/core/00-governance/DECISION_BRIEF_TEMPLATE.md` for the requested decision. Use the relevant council from `SUBAGENT_DELIBERATION_PROTOCOL.md`. Run the first round independently and read-only. Each agent must return a recommendation, alternatives, failure modes, assumptions/evidence, hard blockers, safeguards/tests, and confidence. Compile a debate packet. Run a targeted challenge round only where there is material disagreement or risk. Apply the hard gates and scorecard. Do not vote. If policy is unresolved, update `OPEN_DECISIONS_AND_ASSUMPTIONS.md`; do not implement. If confirmed, ask Mithi to create a decision record.

## Plan a workflow before implementation

> Use Amihan, Dalisay, Hiraya, and Diwata as read-only first-round agents. Have Amihan define outcomes, non-goals, acceptance criteria, and reversibility; Dalisay validate workflow, controls, exceptions, and fallback paths; Hiraya compare technical approaches and data/API impacts; Diwata assess first-time-user and mobile usability. Wait for independent results, then run a targeted challenge round only if needed. Return one parent-led recommendation and separate unresolved policy decisions. Do not edit files.

## Plan an inventory or data-integrity change

> Create a decision brief. Use Dalisay, Hiraya, Ligaya, and Lualhati independently. Require ledger invariants, idempotency, transaction boundaries, migration/backfill implications, partial-failure recovery, and UAT evidence. Use Luningning or Mayari as a targeted challenger for access-control or implementation-risk concerns. Do not let implementation start while a material decision is OPEN.

## Implement a Phase I feature safely

> Confirm that the relevant decision and workflow are already documented. Use one write-capable implementation owner only. After implementation, run Lualhati, Luningning, and Mayari as read-only reviewers; include Diwata for UI and Mayumi for infrastructure when relevant. Fix validated findings, run tests, update source-of-truth documentation with Mithi, and ask Dunong to assess user guidance impact. Report files changed, tests run, controls verified, risks, and documentation updates.

## Create end-user knowledge-base content

> Use Dunong to create a role-based knowledge-base article for a verified completed feature. Read the approved workflow, UI specification, roles and permissions, approval matrix, notification rules, and actual implemented behavior. Write only to `docs/knowledge-base/`, `docs/release-notes/`, or `docs/training/`. Do not modify code or source-of-truth specs. Log unclear or conflicting behavior in `docs/knowledge-base/OPEN_KNOWLEDGE_BASE_GAPS.md`.

## Prepare release readiness

> Use Mayumi, Luningning, Lualhati, and Tala as read-only reviewers. Require backup and restore evidence, migration and rollback plan, security review, test/UAT evidence, worker and monitoring readiness, release notes, and known limitations. Tala must return GO, CONDITIONAL GO, or NO-GO. Do not deploy from this planning task.


## Project Tracker Decision Council

Use Amihan, Dalisay, Hiraya, and Diwata as read-only advisors for the Projects & Implementation Tracker.

Decision question: [insert one material decision].

Require independent positions on scope, workflow, implementation/data risk, and user adoption. Then have Luningning and Mayari challenge the proposed option for confidential project access, source-record data leakage, activity integrity, concurrent task changes, and rollback/recovery. Have Lualhati define UAT acceptance tests. Do not write code until the parent returns a decision packet with hard gates, failure modes, safeguards, and decision status.
