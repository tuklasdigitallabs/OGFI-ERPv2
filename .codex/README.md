# OGFI ERP — Codex Subagents

Project-scoped subagents live in `.codex/agents/`.

## Operating rules

- The parent agent owns the task and is the Decision Chair for material decisions.
- Use a maximum of four first-round specialists unless explicitly justified.
- Keep delegation depth at one.
- Use independent analysis first, then targeted challenge review only where meaningful risk or disagreement exists.
- Do not use voting to resolve inventory, security, approval, audit, tenancy, or release-control issues.
- Reviewers remain read-only by instruction as well as configuration. The parent must explicitly authorize any exception.
- Only one write-capable engineering agent may edit a shared worktree at a time.

Read:

- `AGENTS.md`
- `docs/core/05-technical/SUBAGENT_OPERATING_MODEL.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/SUBAGENT_ROLE_DIRECTORY.md`
- `.codex/SUBAGENT_STARTER_PROMPTS.md`
