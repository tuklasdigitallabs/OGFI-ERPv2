# Branch Expansion & Construction — UAT Plan

## UAT scenarios

1. Create a new branch expansion project with company/brand/proposed site and project manager.
2. Apply a controlled template and verify required workstreams and phase gates appear.
3. Add named owners, assignees, reviewers, and watchers; verify scope and visibility.
4. Move through lifecycle phases; verify incomplete gate blocks phase completion.
5. Record target opening date; update it with reason and authorized history.
6. Add permit deadline, inspection, contractor milestone, delivery, training, soft opening, and grand opening to calendar.
7. Verify date-only calendar items do not shift dates; verify scheduled items display in Asia/Manila.
8. Create a blocker with opening-date impact and verify dashboard visibility/escalation.
9. Add a punch-list defect with a named accountable owner, impact statement, and responsible party. For high or critical defects, require an escalation owner and initial evidence reference.
10. Move a punch item through `Planned → In progress → For review → Closed`; prove a direct close is denied, the creator/owner cannot independently close a high or critical item, and the closure evidence reference is retained.
11. Return a review item with unmet acceptance criteria and verify the reason is retained; reopen a completed or cancelled item with a reason and verify the original decision remains in activity history.
12. Submit two close attempts with the same record version and verify the second is rejected as stale.
13. Link a PR/PO/invoice/payment/budget record; verify no financial action can occur from project task completion.
14. Restrict a sensitive expansion project; verify unauthorized user cannot access project, documents, comments, or API data.
15. Archive completed project; verify audit history/evidence remains available to authorized users.
16. Create a project from a published Opening Playbook and verify its checklist, evidence, signoff, and reminder defaults are copied to the project without changing the template or any existing project.
17. Submit an evidence requirement as its named owner; verify only the assigned independent reviewer can accept or return it, that a return reason is retained, and that the action appears in project activity.
18. Create a draft revision from a published playbook; add a checklist/evidence/signoff requirement; publish it; and confirm that only projects created from the revision receive the new default.

## Release gates

- Gate/evidence rules function as designed.
- Calendar, milestone, and date-change behavior is reliable.
- Permission/restricted-project tests pass.
- Financial/procurement links cannot bypass source controls.
- Blocker/punch-list/resolution history is auditable.
- No unresolved critical defect affecting opening-readiness reporting.
- Project evidence/signoff actions preserve source-record boundaries and independent-review controls.
