# DEC-0276 — Local UAT Clean Baseline

## Metadata

- Decision ID: `DEC-0276`
- Title: Local UAT Clean Baseline
- Status: `Confirmed design — candidate admission pending independent passing evidence`
- Date: 2026-08-10
- Decision owner: OGFI Product Owner / UAT Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I local UAT environment and baseline data
- Related decisions: `DEC-0039`, `DEC-0049`, `DEC-0258`, `DEC-0259`, `DEC-0263`, `DEC-0275`
- Related decision brief: Parent-confirmed local clean-baseline design review

## Decision

Use an isolated, standalone Docker Compose project to create a local-only Phase I
UAT candidate in a fresh migrated database. The source is fixed at
`ogfi-clean-postgres-1` / `ogfi_erp`; it remains untouched. Each target uses the
names `ogfi_rehearsal_local_<suffix>` and `ogfi-uat-<suffix>`. The credential-bearing
web runtime and PostgreSQL remain exclusively on an internal private network and
publish no ports. A separate pinned, credential-free Nginx edge joins that private
network and a project-only edge network, and alone publishes the loopback default
port, `127.0.0.1:3002`.

The baseline builder may copy only the explicit dependency-closed setup and
master-data allowlist. `Budget`, `BudgetLine`, `FinanceAccountClass`,
`ChartOfAccount`, `FiscalYear`, and `AccountingPeriod` are excluded: no retained
non-budget table depends on the finance bundle, and active approved budget data
depends on approval/audit history that this baseline must not retain. Any
budget-dependent or finance-dependent UAT scenario must newly configure the
required target setup. The target must leave every prohibited execution or history table
at zero, including inventory movements and balances, procurement and transfer
documents, approval instances, sessions, audit activity, notifications,
attachments, recovery state, document counters, and equivalent future history.
It must not create or retain a full database backup, dump, or export artifact.

The target has distinct restricted database roles: an owner for target-only
provisioning and final control, a migrator for schema/allowlist work, and a
least-privileged runtime role for the UAT web service. Runtime credentials must
not grant source access, ownership, role administration, or database creation.

Source preflight and allowlist export operate in one read-only repeatable-read
snapshot. Explicit tenant and Company/Brand/Location/Department scope assertions
must prove every retained relation is in the expected scope before target load.
The exact `release-runner` image must be bound to clean committed `HEAD`, with the
schema and migrations used for the target embedded in that image. The edge must
also be an exact local image bound to the same commit and fixed proxy-configuration
digest. It runs non-root with a read-only filesystem, no added capabilities, no
ERP environment or secrets, no Docker socket or host mount, and no dynamic proxy
target. Its access log is disabled so authorization headers and cookies are not
recorded.

Construction records a pending construction token first. The builder may advance it to the
final runtime-identity marker only after every automated construction,
isolation, role-contract, digest, and zero-history check passes. Independent QA
and Security review of the constructed candidate is still required before human
UAT; a final runtime marker is not formal-UAT admission evidence by itself.

## Context

Local UAT needs a realistic configured setup without carrying executed workflow,
inventory, audit, or authentication-history state forward. Cleaning the source
or using one shared Compose stack would weaken rollback, provenance, and network
isolation controls.

The earlier same-cluster target `ogfi_uat_clean_20260810` was diagnostic only.
Independent QA and Security rejected it; it was never admitted. Its previous
claims of admission, retained full-backup/export evidence, and readiness for
rehearsal are superseded by this record.

The product owner authorized deletion of the two rejected full-database dumps on
2026-08-10, and verification found no remaining `.dump` artifact under the local
UAT evidence root.

Named-user UAT remains blocked: only **1 of 7** retained users currently has an
authentication identity, credential, and MFA record, and only **5** role
assignments exist. Do not treat authentication primitive counts, health checks,
or a candidate database as proof that the required named UAT actors can sign in
and perform their assigned scoped roles.

Requested Code Spark and GPT-5.4-mini reviewers were unavailable. The permitted
GPT-5.6 fallback was used without relaxing any hard gate.

## Options considered

### Option A — selected: isolated standalone Compose candidate

- **Summary:** Build a new, separately named Compose project and database from a
  fixed source through a reviewed allowlist, restricted target roles, and a
  pending-to-final admission marker.
- **Benefits:** Keeps source and target network/data boundaries distinct;
  provides a reproducible clean state; and permits independent evidence review.
- **Failure modes:** An allowlist dependency may be absent, a prohibited row may
  be copied, source/target connectivity may overlap, or an incomplete candidate
  may be misrepresented as admitted.
- **Why selected:** It preserves source recovery and fail-closed admission while
  supporting realistic local setup.

The initially considered direct two-network web attachment is rejected. A
controlled non-mutating probe proved that a container on the non-internal bridge
could connect to both the source PostgreSQL container IP and its
`host.docker.internal` published port. The selected topology therefore exposes
only the hardened, secretless fixed-proxy edge; web and PostgreSQL remain
private-only.

### Option B — rejected: reuse or clean `ogfi_erp`

- **Failure modes:** Destroys or alters the source rollback point and can erase
  append-only inventory or audit history.
- **Why rejected:** The source must remain untouched.

### Option C — rejected: same-cluster target / shared stack

- **Failure modes:** Network and credential boundaries are weaker and a target
  can be confused with the source runtime.
- **Why rejected:** It does not meet the approved isolated standalone Compose
  design. `ogfi_uat_clean_20260810` is rejected diagnostic evidence, not a
  usable baseline.

### Option D — rejected: copy then selectively delete, or retain a full export

- **Failure modes:** Delete ordering can leave hidden history; retained dumps or
  exports can contain credential-derived or sensitive source material.
- **Why rejected:** The process must affirmatively copy the allowlist and retain
  no full source backup/export artifact.

## Hard gates and safeguards

1. Invoke the builder only with the fixed source and a new suffix:

   ```bash
   pnpm.cmd db:local-uat-baseline -- create \
     --source-container ogfi-clean-postgres-1 \
     --source-project ogfi-clean \
     --source-db ogfi_erp \
     --target-db ogfi_rehearsal_local_<suffix> \
     --project ogfi-uat-<suffix> \
     --web-image-id sha256:<64-hex-local-image-id> \
     --edge-image-id sha256:<64-hex-local-edge-image-id> \
     --confirm CREATE_ISOLATED_LOCAL_UAT_BASELINE
   ```

2. The target must be a new standalone Compose project. Only its pinned,
   credential-free Nginx edge is loopback-published and defaults to
   `http://localhost:3002`; web and PostgreSQL publish no ports and remain on the
   internal private network. No target service may share a network, database,
   credentials, or runtime identity with the source stack. The builder must also
   prove that web cannot reach the source by hostname, container IP, or Docker
   host gateway.
3. The source is read-only for construction. Verify it is unchanged before and
   after construction; never truncate, reset, seed, repair, or otherwise mutate
   `ogfi_erp`.
4. Run source preflight and allowlist export in one read-only repeatable-read
   snapshot. Assert tenant and Company/Brand/Location/Department scope closure;
   fail closed on any out-of-scope retained relation.
5. Use only the exact `release-runner` image bound to clean committed `HEAD`,
   including its in-image schema and migrations, to migrate the empty target
   before loading the versioned allowlist. Fail closed on provenance, schema,
   migration, dependency, existing-target, role-contract, nonzero
   prohibited/history, or isolation failure.
6. Exclude `Budget`, `BudgetLine`, `FinanceAccountClass`, `ChartOfAccount`,
   `FiscalYear`, and `AccountingPeriod`. Budget/finance-dependent UAT must newly
   configure and, where required, approve its clean target setup.
7. Retain no full backup, database dump, or source export. Construction evidence
   may contain only redacted/minimal hashes, counts, role-contract results,
   marker state, and source-unchanged verification.
8. Verify all prohibited/history tables are zero and inventory begins at zero.
   The first stock can arise only through approved receiving or the separately
   controlled opening-inventory workflow; never write balances directly.
9. Preserve tenant/company/brand/location scope, server authorization,
   segregation of duties, and no-self-approval behavior in the retained setup.
10. Keep the construction token pending until every automated construction,
    isolation, zero-history, source-unchanged, digest, role-contract, and
    startup-health check passes. Only then write the final marker and prove final
    health with no construction token. A failed fresh target is destructively
    torn down rather than repaired in place.
11. Retain no rejected full-database dump. The two prior diagnostic dumps were
    deleted with product-owner authorization on 2026-08-10.
12. Named-user UAT is blocked until all seven required actors have valid
   identity/credential/MFA coverage and the necessary role/scope assignments;
   the present 1/7 and five assignments do not meet that gate.
13. This design authorizes local candidate construction only. It grants no
    staging, hosted, production, deployment, operational-stock, or release
    authority.

## Implementation and documentation impact

- **Code / architecture:** A standalone local Compose topology, restricted
  owner/migrator/runtime roles, pinned secretless loopback proxy edge, and
  pending-to-final marker are required. No
  source database change or production/staging architecture change is authorized.
- **Data / schema:** New migrated target only; no retained full backup/export;
  the budget/finance bundle and prohibited/history state must be zero, source
  remains unchanged, and failed fresh targets are torn down.
- **Workflow / permissions:** Candidate setup must preserve scoped authorization
  and segregation controls, but named-user UAT remains blocked pending coverage.
- **UI / mobile:** Use only the separate local stack at port `3002`; no UAT or
  release admission follows from health/UI availability alone.
- **Knowledge base / training:** The internal runbook and glossary must describe
  candidate status truthfully. Dunong handoff is required if instructions are
  issued to end users after named-user UAT is unblocked.
- **Tests / UAT:** Require independent QA and Security passing evidence before
  final marker/admission, then separate named-user and scoped-role verification.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Authorize and complete deletion of rejected old full-database dumps. | UAT Owner | Before new candidate construction | Complete — no `.dump` artifact remains |
| Build an isolated target with the prescribed CLI, exact image provenance, repeatable-read snapshot, and minimal redacted evidence. | Database Engineering | After old-dump deletion | In progress |
| Verify source unchanged, tenant/scope assertions, isolated Compose topology, restricted role contracts, zero prohibited/history state, pending-token/startup health, final-marker/no-token health, and teardown path. | QA / Security / Database Engineering | Before finalization | Blocked |
| Review the construction-complete candidate and admit it for human UAT. | QA / Security / UAT Owner | Only after independent passing evidence | Blocked — no passing evidence supplied |
| Provision identity, credential, MFA, role, and scope coverage for all seven named UAT actors. | UAT Owner / Access Administration | Before named-user UAT | Blocked — 1/7 covered; 5 role assignments |
| Assess and hand off user-facing instructions. | Dunong / UAT Owner | After named-user UAT becomes actionable | Pending |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — Phase I scope, source-of-truth,
  immutable-ledger, authorization, audit, and validation controls.
- [`DECISION_RECORD_TEMPLATE.md`](../DECISION_RECORD_TEMPLATE.md) — confirmed
  decision-record structure.
- [`DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`](DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md) — migration and recovery boundaries.
- [`DEC-0049-APPEND-ONLY-AUDIT-ACTIVITY-AND-INVENTORY-HISTORY.md`](DEC-0049-APPEND-ONLY-AUDIT-ACTIVITY-AND-INVENTORY-HISTORY.md) — immutable history principles.
- [`DEC-0259-INVENTORY-PILOT-SYNTHETIC-CONFIGURATION-BASELINE.md`](DEC-0259-INVENTORY-PILOT-SYNTHETIC-CONFIGURATION-BASELINE.md) — synthetic local boundary.
- [`DEC-0263-IMMUTABLE-OPENING-STOCK-CUTOVER.md`](DEC-0263-IMMUTABLE-OPENING-STOCK-CUTOVER.md) — controlled first-stock boundary.
- Parent-supplied correction: `ogfi_uat_clean_20260810` was diagnostic and
  rejected by independent QA/Security; passing admission evidence for a new
  candidate has not been supplied.

## Supersession

This record supersedes only prior DEC-0276 claims that
`ogfi_uat_clean_20260810` was admitted, that a full backup/export is retained,
or that local UAT is ready. It does not supersede migration-safety,
immutable-ledger, audit-history, authorization, or controlled-opening-inventory
decisions.
