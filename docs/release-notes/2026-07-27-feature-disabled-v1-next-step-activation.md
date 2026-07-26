# OGFI ERP Release Notes — v1 next-step activation compatibility

**Release date:** 2026-07-27  
**Audience:** Approvers and workflow owners using source workspaces  
**Affected locations / roles:** Users assigned to multi-step approval routes

## What changed

- Completing an intermediate approval from its source workspace now activates a
  v1 next step with the required live eligibility check, activation timestamp,
  and audit event even while the normalized Approval Inbox remains disabled.
- Genuine legacy v0 approval steps retain their existing compatibility behavior
  until the governed backfill and cutover.

## What you need to do

- Continue using the approved source-workspace action provided by the workflow
  owner while the Approval Inbox is unavailable.
- If another approval step is configured, the source record remains pending until
  that step and every later required step is completed.

## Important notes

- This correction does not enable the normalized Approval Inbox, change who may
  approve, relax scope or self-approval controls, or authorize production cutover.
- Disposable PostgreSQL, hosted recovery, responsive-browser, UAT, producer
  barrier, and activation evidence remain open.

## Learn more

- `docs/knowledge-base/troubleshooting/why-cant-i-approve-this-request.md`
- `docs/phases/phase-01-procurement-inventory/specs/approvals-ui-spec.md`

## Support

Report an unexpected approval transition through the normal OGFI ERP support
channel with the selected company, location, source record reference, and step
shown before the action.
