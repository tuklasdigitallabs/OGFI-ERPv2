# Project Risks and Blockers Workflow

## Purpose

Make implementation risk visible early and ensure blocked work has an owner and escalation path.

## Risk workflow

1. Authorized user creates a risk with title, description, category, likelihood, impact, owner, target mitigation date, and related project/task/milestone.
2. Project Manager reviews severity and mitigation plan.
3. Risk is monitored until Mitigated, Accepted, Realized, or Closed.
4. High-severity risks notify Project Manager and Sponsor based on configured thresholds.

## Blocker workflow

1. Contributor marks task Blocked.
2. System applies the configured blocker-reason policy. The pilot default requires blocker reason, blocker type, reported date, owner/next action, and optional linked evidence; any policy override must remain visible in the UI and auditable through the task activity history.
3. Project Manager receives notification; system calculates due-date and milestone impact where basic data permits.
4. Blocker is resolved when task resumes, is cancelled, or Project Manager records accepted resolution.
5. All changes are recorded in task and project activity history.

## Default blocker types

Decision needed, Approval pending, Supplier delay, Delivery issue, Access issue, Technical issue, Resource unavailable, External dependency, Scope change, Other.
