# DEC-0257 — Exact-Candidate Authorization Regression Repair

## Metadata

- Decision ID: `DEC-0257`
- Title: Exact-Candidate Authorization Regression Repair
- Status: `Confirmed`
- Date: 2026-07-30
- Decision owner: Phase I Core Administration / approval controls
- Decision Chair: Parent agent
- Related phase/module: Core Administration Audit and User Access; Approval Rule runtime regression suite
- Related decisions: `DEC-0049`, `DEC-0050`, `DEC-0244`, `DEC-0251`
- Related decision brief: Parent-confirmed exact-CI failure repair after independent Security, Database, and QA review with challenge round

## Decision

Repair the exact-candidate CI regressions without weakening schema, grants, or
authorization controls.

Core Administration audit authorization is split by row scope: selected-company
Core Admin `MANAGE` authorizes reads of company-local audit rows, while a live
tenant-role permission authorizes tenant-wide rows whose company is `null`.
User audit pages remain tenant-role-gated and must deny access after permission
revocation. All denied paths preserve non-enumeration.

The Approval Rule runtime `TRUNCATE` regression must expect PostgreSQL `42501`
(insufficient privilege), rather than trigger error `P0001`, because the runtime
role does not have `TRUNCATE`. Update and delete trigger assertions remain
unchanged. Repair the Core Admin User Access fixture only: remove duplicate
`padStart(2, '2')` codes and retain fixtures for disposable-database teardown
rather than attempting forbidden `AuditEvent`-linked cleanup. Do not change
schema or grants.

## Context

Exact CI failures exposed three separate causes: an audit-read policy that did
not distinguish company-local from tenant-wide rows, an assertion that expected
a trigger unavailable to the runtime's `TRUNCATE` privilege boundary, and test
fixture construction/cleanup that collided on generated codes and attempted an
invalid audit-linked delete.

The repair must restore exact-candidate evidence while retaining the existing
tenant/company isolation, live-permission revocation behavior, append-only
audit controls, and database privilege boundary. It is a corrective source and
test decision only; it creates no new product workflow or authority.

Three independent Security, Database, and QA reviews plus a targeted challenge
round assessed the alternatives. Code Spark and GPT-5.4 were unavailable; the
parent used the available GPT-5.6 fallback without relaxing hard gates or
expanding scope.

## Options considered

### Option A — selected: scoped audit split and narrow regression/fixture repair

- Summary: Apply company-local Core Admin `MANAGE` only to selected-company
  rows; require a live tenant-role permission for `company_id IS NULL` rows and
  all user audit pages; correct the `TRUNCATE` expectation to `42501`; and make
  fixture-only identifier/cleanup repairs.
- Benefits: Restores the intended least-authority distinction, makes the test
  reflect the actual PostgreSQL privilege boundary, and removes fixture noise
  without altering production data controls.
- Failure modes: A query could incorrectly include tenant-wide rows under the
  company-local path, a stale permission cache could survive revocation, or a
  fixture cleanup change could widen beyond its isolated test records.
- Why selected: It is the smallest repair consistent with authorization,
  non-enumeration, database privilege, and append-only audit controls.

### Option B — rejected: let Core Admin `MANAGE` read tenant-wide audit rows

- Summary: Treat selected-company Core Admin authority as sufficient for both
  company-local and tenant-wide audit rows.
- Benefits: Would simplify a single audit-read predicate.
- Failure modes: Broadens disclosure of tenant-wide activity, bypasses the
  live tenant-role control, and makes revocation semantics ambiguous.
- Why rejected: Company-scoped management is not authority to enumerate or
  read tenant-wide audit records.

### Option C — rejected: grant runtime `TRUNCATE` so the trigger emits `P0001`

- Summary: Change database grants to permit `TRUNCATE` and retain the original
  trigger-error expectation.
- Benefits: Would preserve the former assertion shape.
- Failure modes: Broadens destructive database authority and tests a different
  control boundary from the one actually granted to the runtime role.
- Why rejected: PostgreSQL `42501` is the correct behavior at the present
  privilege boundary; no grant weakening or widening is authorized.

### Option D — rejected: change audit schema/foreign keys or delete linked audit events in cleanup

- Summary: Modify schema relationships or remove `AuditEvent`-linked records to
  make the fixture cleanup pass.
- Benefits: Could mask the fixture failure quickly.
- Failure modes: Weakens append-only audit history, risks production-like data
  deletion semantics, and changes a schema/control decision to fix test setup.
- Why rejected: The defect is isolated fixture identity and cleanup, not the
  audit data model or grant model.

## Hard-gate assessment

- **Tenant/company scope isolation:** Selected-company Core Admin `MANAGE` may
  read only company-local audit rows in that selected company. Tenant-wide rows
  (`company_id IS NULL`) require the distinct live tenant-role permission.
- **Server-enforced authorization and revocation:** The row-scope split and
  tenant-role requirement are enforced in the server/data-access path. User
  audit pages require the live tenant-role permission and must deny after it is
  revoked; interface hiding or a cached former permission is insufficient.
- **Non-enumeration:** A denied or out-of-scope audit request must not disclose
  whether a tenant-wide, other-company, or user-audit record exists.
- **Audit integrity:** No schema, foreign-key, grant, trigger, or append-only
  audit behavior is weakened. Fixture cleanup is restricted to its own safe
  records and must not delete `AuditEvent`-linked history.
- **Database privilege truth:** Runtime `TRUNCATE` remains unavailable and
  yields PostgreSQL `42501`; update/delete protection continues to assert the
  trigger behavior that yields `P0001` where those operations reach it.
- **Phase scope and recovery:** This changes only exact-candidate authorization
  and test correctness. It introduces no inventory, money, approval-route,
  migration, host, or release-operation behavior.

## Required safeguards

1. Express the company-local and tenant-wide audit predicates separately and
   test both. Never use selected-company Core Admin `MANAGE` as a fallback for
   a `company_id IS NULL` row.
2. Check tenant-role permission live for tenant-wide audit rows and user audit
   pages; test immediate denial after revocation.
3. Return the established bounded authorization/not-found behavior for denied
   audit reads, without record-existence or cross-company disclosure.
4. Keep the runtime role without `TRUNCATE`; assert SQLSTATE `42501` for that
   operation. Retain update/delete assertions for trigger SQLSTATE `P0001`.
5. Generate distinct fixture codes rather than `padStart(2, '2')` collisions,
   and rely on disposable-database teardown rather than deleting
   `AuditEvent`-linked records. Do not alter schema/grants to accommodate
   cleanup.
6. Run the focused exact-candidate CI regression suite and its authorization,
   revocation, non-enumeration, database-privilege, and fixture-isolation tests
   before claiming the repair is complete.

## Required tests and acceptance evidence

1. A selected-company Core Admin `MANAGE` actor can read only eligible
   company-local audit rows for that selected company.
2. The same actor cannot read tenant-wide `company_id IS NULL` audit rows
   without the required live tenant-role permission, and cannot enumerate them
   through IDs, filters, counts, or error differences.
3. User audit pages require the live tenant-role permission and deny after
   revocation, with no stale-access or existence disclosure.
4. Approval Rule runtime tests expect `42501` for `TRUNCATE`; update/delete
   trigger tests continue to expect `P0001`.
5. Core Admin User Access fixtures create unique codes and rely on disposable
   database teardown; they neither target nor require deletion of
   `AuditEvent`-linked rows.
6. The exact-candidate CI suite passes without schema change, database-grant
   widening, authorization broadening, or audit-history deletion.

## Implementation and documentation impact

- **Code / architecture:** Repair is limited to authorization predicates,
  runtime test expectations, and isolated fixture setup/teardown. No schema or
  grant change is authorized.
- **Data / schema:** None. AuditEvent relationships and append-only protections
  remain unchanged.
- **Workflow / permissions:** Clarifies existing scope semantics only:
  selected-company Core Admin `MANAGE` is company-local; tenant-wide/user-audit
  access remains live tenant-role-gated.
- **UI / mobile:** None; authorization cannot be satisfied by UI hiding.
- **Reporting:** None. Denied paths must not expose audit populations.
- **Knowledge base / training:** No user-facing behavior change; no Dunong
  handoff is required.
- **Tests / UAT:** Exact CI regressions and the stated negative authorization,
  database, and fixture tests are required before completion.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Repair company-local versus tenant-wide audit authorization and revocation/non-enumeration regression coverage. | Engineering / Security / QA | Implemented; exact-candidate CI pending | Complete in source |
| Correct Approval Rule runtime `TRUNCATE` expectation to `42501` while retaining update/delete trigger assertions. | Engineering / Database / QA | Implemented; exact-candidate CI pending | Complete in source |
| Repair only Core Admin User Access fixture code generation and disposable teardown. | Engineering / QA | Implemented; exact-candidate CI pending | Complete in source |
| Run the exact-candidate CI suite and preserve its evidence without schema or grant changes. | QA / Security | Before release-readiness assessment | Pending |

## Evidence

- Source implementation removes the unconditional tenant-role assertion from
  the shared audit predicate, retains it before user-audit target lookup, and
  adds company-local-versus-tenant-wide revocation coverage. The Approval Rule
  test now asserts the runtime role's `42501` boundary; the User Access fixture
  uses unique codes and leaves append-only history to disposable teardown.
- Repository TypeScript check and `git diff --check` pass. Exact-candidate
  database-backed CI remains required before reopening SPF-004 closure credit.

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0049-APPEND-ONLY-AUDIT-ACTIVITY-AND-INVENTORY-HISTORY.md`
- `docs/core/00-governance/decisions/DEC-0050-BOUNDED-DENIAL-AUDIT-AND-ROLE-SCOPED-APPROVAL-WORK.md`
- `docs/core/00-governance/decisions/DEC-0244-NORMALIZED-APPROVAL-DECISION-SURFACE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0251-PR-DRAFT-BUDGET-PUBLIC-BOUNDARY.md`
- Exact CI failure evidence reviewed independently by Security, Database, and
  QA; targeted challenge round; parent confirmation on 2026-07-30. Code Spark
  and GPT-5.4 were unavailable; the available GPT-5.6 fallback supported the
  deliberation without relaxing hard gates or expanding authority.

## Supersession

This record supplies the confirmed repair boundary for the stated
exact-candidate regressions. It does not supersede the related audit,
authorization, approval, or public-boundary decisions and does not authorize a
schema, grant, or broader permission change.
