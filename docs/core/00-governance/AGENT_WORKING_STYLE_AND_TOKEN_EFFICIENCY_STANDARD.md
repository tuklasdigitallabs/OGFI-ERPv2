# Agent Working Style and Token-Efficiency Standard

**Status:** Foundation / Approved Baseline  
**Applies to:** Parent Codex agent and all project-scoped subagents  
**Authoritative implementation file:** `AGENTS.md`

## Purpose

This standard records the working-style rules integrated into the root `AGENTS.md`. It exists so the rule set is visible in the documentation map and can be reviewed without treating this file as a second competing instruction source.

## Required Behavior

- Read only the documents, code, functions, components, schemas, routes, and tests relevant to the task.
- Prefer the smallest useful context first; do not scan the repository merely to understand its structure.
- Ignore dependency folders, build artifacts, generated output, lockfile internals, large data files, and full logs unless directly relevant.
- For non-trivial work, state a short plan, the expected files to change, material assumptions, and a verifiable success condition. Ask before editing only when a material ambiguity would change the implementation.
- Make the minimum correct change. Do not refactor, rename, reformat, or improve unrelated files.
- Keep shell output scoped and quiet. Use focused status, diff, search, and error-inspection commands; do not dump broad listings or full logs into context.
- Default to medium reasoning effort. Escalate only for high-risk, multi-file, financial, inventory, security, data-integrity, architecture, or complex workflow work.
- When the session context becomes stale, conflicting, or too large, use a concise handoff or begin a fresh session rather than relying on unverified memory.
- Completion reports must be concise and decision-useful. Do not restate the request or reproduce full files unless explicitly requested.

## Safety Boundary

Token efficiency never overrides ERP controls. It must not be used to bypass required approval, inventory-ledger, audit, authorization, testing, security, data-integrity, documentation, or material-decision procedures.

## Relationship to Subagents

Every subagent must follow the root `AGENTS.md`. Their individual TOML profiles may add role-specific output, review, or write-scope rules, but may not weaken this standard.
