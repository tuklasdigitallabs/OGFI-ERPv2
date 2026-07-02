# Understanding Project Status, Milestones, And Risks

**Audience / required role:** Project managers, sponsors, contributors, and viewers  
**Applies to:** Project lifecycle, Work Calendar, milestones, and risk register  
**Related phase/module:** Phase 1.5 / Project Lifecycle, Calendar, and Risks  
**Last verified against:** implemented project lifecycle transitions, milestone creation/achievement/cancellation, Work Calendar, risk creation/mitigation/closure, optimistic version checks, and activity history

## Purpose

Use this article to understand project lifecycle status, milestone dates, and risk tracking.

Project statuses and risks explain coordination health. They do not replace source ERP statuses.

## Project Statuses

| Status | Meaning |
|---|---|
| `DRAFT` | Project exists but is not active for execution. |
| `ACTIVE` | Work is in progress. |
| `ON_HOLD` | Work is paused with a reason. |
| `COMPLETED` | Project work is complete after closure checks pass. |
| `CANCELLED` | Project work has been cancelled with a reason. |
| `ARCHIVED` | Completed or cancelled project is retained but removed from active views. |

## Milestones

Milestones are date-only planning markers. They can be `PLANNED`, `ACHIEVED`, or `CANCELLED`. At-risk milestones require a reason when marked at risk, and cancelled milestones require a cancellation reason.

## Risks

Risks are advisory coordination records with severity, likelihood, impact, owner, target mitigation date, mitigation plan, and resolution note. Risk statuses include `OPEN`, `MITIGATING`, `MITIGATED`, `ACCEPTED`, `REALIZED`, `CLOSED`, and `CANCELLED`. High or critical risks require a target mitigation date. Closing, accepting, mitigating, realizing, or cancelling a risk requires resolution text and the required permission.

## Navigation Paths

- `Projects`
- `Work Calendar`

## Important Controls And Warnings

- Project completion, cancellation, and archive can be blocked while active tasks, open blockers, or open risks remain.
- Cancelling or archiving requires a reason.
- Milestone cancellation requires a reason.
- Risk closure requires a resolution note.
- Changing a project, milestone, or risk does not change linked ERP source records.
- Stale-version feedback can appear when another user updates a milestone, risk, task, or project first.

## Related Articles

- Creating a Project from a Template
- Reviewing Overdue and Blocked Work
- Closing or Archiving a Project
