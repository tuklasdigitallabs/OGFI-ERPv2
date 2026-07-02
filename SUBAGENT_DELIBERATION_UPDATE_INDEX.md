# OGFI ERP — Subagent Deliberation Update Index

## What changed in Version 3

This update turns the subagent team from a collection of independent specialists into a controlled **parent-led decision council** for material ERP decisions.

## Start here

1. `AGENTS.md` — new Section 13: Subagent deliberation and decision protocol
2. `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
3. `docs/core/00-governance/DECISION_BRIEF_TEMPLATE.md`
4. `docs/core/00-governance/DECISION_SCORECARD.md`
5. `docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md`
6. `.codex/SUBAGENT_STARTER_PROMPTS.md`

## Main behavior changes

- Material decisions now use independent analysis first, targeted challenge second, and a parent-led conclusion.
- Agents do not vote. Hard inventory, audit, authorization, tenancy, and security blockers cannot be overridden by convenience or majority preference.
- Open policy questions are recorded rather than silently hardcoded.
- Mithi records confirmed material decisions; Dunong documents only verified user-facing behavior.
- QA remains read-only and produces test strategy/defect evidence; implementation agents write tests.
- Each agent now has stronger role-specific failure-mode and evidence requirements.

## New governance files

```text
docs/core/00-governance/
├── SUBAGENT_DELIBERATION_PROTOCOL.md
├── DECISION_BRIEF_TEMPLATE.md
├── DECISION_SCORECARD.md
├── DECISION_RECORD_TEMPLATE.md
└── decisions/
    └── README.md
```

## Recommended first use

Use the “Run a material-decision council” prompt in `.codex/SUBAGENT_STARTER_PROMPTS.md` for the first Phase I Core Administration design decision.
