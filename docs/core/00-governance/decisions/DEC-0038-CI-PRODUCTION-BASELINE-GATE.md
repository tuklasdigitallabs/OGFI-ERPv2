# DEC-0038 — CI Production Baseline Gate

## Metadata

- Decision ID: `DEC-0038`
- Title: CI Production Baseline Gate
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-001 CI and verification baseline
- Related decision brief: Parent-confirmed SPF-001 decision after independent Tala, Lualhati, Mayumi, and Luningning review

## Decision

Select **AUGMENT**: the CI production baseline must deterministically seed its PostgreSQL test database, typecheck E2E tests, build the production artifact, run the complete unit/integration and database-backed access-control suites, run desktop/mobile E2E against the built production artifact, retain useful failure evidence, and use an explicitly supported PostgreSQL version.

SPF-001 remains open until a successful hosted CI run proves the complete gate for the exact release-candidate SHA and required branch-protection evidence confirms that the gate cannot be bypassed.

## Context

The existing verification path did not provide sufficient production-baseline proof. The access-control suite could skip when given a normal PostgreSQL URL, E2E exercised a development server rather than the built production artifact, CI lacked deterministic seed execution, E2E typechecking, and retained failure artifacts, and its PostgreSQL version drifted from the intended baseline. Local success or a workflow definition alone also does not prove that the hosted gate ran successfully for the release candidate or is enforced by branch protection.

## Options considered

### Option A — rejected: accept the existing baseline

- Summary: Treat the previous checks and available local evidence as sufficient to close SPF-001.
- Benefits: No additional CI work or hosted evidence collection.
- Failure modes: Access-control tests may silently skip, production-only build/runtime defects may escape development-server E2E, test state may be non-deterministic, E2E type errors may be missed, failures may lack diagnostic artifacts, and database-version drift may invalidate confidence.
- Why selected or rejected: Rejected because it does not establish a repeatable, production-representative, non-skippable release gate.

### Option B — selected: augment the baseline and require hosted proof

- Summary: Add the missing deterministic setup, static checks, production build execution, complete database-backed tests, production-artifact E2E, failure evidence, and PostgreSQL version alignment; then require a successful hosted run for the exact SHA plus branch-protection evidence.
- Benefits: Makes the release-candidate check reproducible, production-representative, diagnosable, and enforceable.
- Failure modes: The hosted workflow may still use a development server, a database-backed suite may skip or target the wrong database, a seed may become non-deterministic, required checks may not be branch-protected, artifacts may be absent or expire before review, or evidence may refer to a different SHA.
- Why selected or rejected: Selected because it addresses the identified verification gaps while preserving SPF-001 as an evidence-based gate rather than declaring completion from configuration alone.

### Option C — rejected: keep SPF-001 open without changing the baseline

- Summary: Acknowledge the evidence gap but defer CI changes indefinitely.
- Benefits: Avoids premature closure and does not misrepresent current confidence.
- Failure modes: The same verification gaps persist, hosted reruns cannot produce adequate evidence, and release readiness remains blocked without a defined remediation path.
- Why selected or rejected: Rejected because remaining open is necessary but not sufficient; the gate must also be made capable of producing valid evidence.

## Hard-gate assessment

- **Exact release candidate:** Every required check and artifact must identify the same commit SHA being considered for release. Evidence from another SHA does not satisfy SPF-001.
- **Hosted execution:** A workflow file, local run, or partial job is not completion evidence. The complete hosted CI gate must finish successfully.
- **Non-skippable authorization verification:** Database-backed access-control tests must execute against the provisioned, migrated, seeded PostgreSQL service and fail rather than silently pass when their database prerequisite is invalid.
- **Production-representative E2E:** Desktop and mobile E2E must exercise the built production artifact, not a development server.
- **Deterministic environment:** Database migration and seed setup, toolchain versions, and the supported PostgreSQL version must be explicit and reproducible.
- **Server-enforced controls:** The gate must retain tests covering tenant and assigned-scope authorization, segregation of duties, immutable audit/inventory principles, transactional consistency, and idempotency where applicable.
- **Enforcement:** Required branch protection must identify the hosted CI gate as a mandatory check before merge or release promotion.
- **Recovery:** A CI infrastructure or workflow failure must block SPF-001 closure and trigger correction and an exact-SHA rerun; it must not be waived by silently dropping a required check.

## Required safeguards

- Run secret review and release-tool self-tests before application verification.
- Generate the database client, deploy migrations, and run the deterministic seed against an isolated CI PostgreSQL database.
- Run lint, application typecheck, E2E typecheck, production build, package tests, web unit/integration tests, and the named database-backed access-control gate.
- Start E2E from the built production artifact and cover the required desktop and mobile projects.
- Configure database-backed suites to fail clearly on invalid or unavailable PostgreSQL prerequisites rather than report a skip as success.
- Upload Playwright reports, test results, and available release evidence on success or failure, with the hosted run ID and exact SHA traceable in the artifact name or metadata.
- Pin the CI PostgreSQL service to the approved supported version and review upgrades deliberately.
- Configure and capture branch-protection evidence showing the CI gate is required.
- Preserve the hosted run URL, commit SHA, check conclusion, artifact references, and branch-protection evidence in the release packet before marking SPF-001 complete.
- If an augmentation causes a false failure or CI outage, revert or correct only the defective workflow change, keep the last known workflow available for comparison, preserve failure artifacts, and rerun the full corrected gate for the same SHA. Do not close SPF-001 or release by bypassing required checks.

## Implementation and documentation impact

- Code / architecture: Augment `.github/workflows/ci.yml` and supporting scripts/configuration so one hosted gate performs the full production-baseline sequence against a consistent release candidate.
- Data / schema: No business schema change. CI must migrate and deterministically seed an isolated PostgreSQL database.
- Workflow / permissions: No application permission change. Branch protection must require the hosted CI gate, and the access-control suite must remain an executed release control.
- UI / mobile: No UI behavior change; desktop and mobile E2E remain required verification surfaces.
- Reporting: Hosted run, exact SHA, conclusions, and diagnostic artifact references become release evidence.
- Knowledge base / training: No Dunong handoff is required because this is an internal engineering and release-control decision with no end-user workflow change.
- Tests / UAT: Automated CI evidence is required for SPF-001; it complements but does not replace applicable formal UAT and release approval.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Verify all augmented checks execute against the intended hosted PostgreSQL and built production artifact | Engineering / QA | Next hosted release-candidate run | Complete — run `29774246308` |
| Capture a successful hosted CI run for the exact release-candidate SHA, including artifact references | Release Manager | Before SPF-001 closure | Complete — SHA `c5e3969b176e271470ca66d3bef607803cb76c3e` |
| Capture branch-protection evidence showing the CI gate is mandatory | Repository administrator / Security | Before SPF-001 closure | Pending |
| Update SPF-001 to complete only after both hosted-run and branch-protection evidence are accepted | Decision Chair / Release Manager | Evidence acceptance | Pending |

## Evidence

- Parent Decision Chair confirmed **AUGMENT** on 2026-07-21 after independent review by Tala, Lualhati, Mayumi, and Luningning.
- Review findings: the access-control suite skipped normal PostgreSQL URLs; E2E ran a development server rather than the built artifact; CI lacked deterministic seed execution, E2E typechecking, and failure artifacts; and the PostgreSQL version had drifted.
- Hosted CI run [`29774246308`](https://github.com/tuklasdigitallabs/OGFI-ERPv2/actions/runs/29774246308) completed successfully for exact implementation SHA `c5e3969b176e271470ca66d3bef607803cb76c3e`; every required check and the evidence-upload step passed.
- Repository-admin API verification on 2026-07-21 found no classic branch protection and no repository rulesets for `main`; enforcement evidence therefore remains unavailable.
- `.github/workflows/ci.yml`
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` (`SPF-001`)
- `docs/core/07-quality/PHASE1_PHASE1_5_ACCEPTANCE_TRACEABILITY_MATRIX.md`
- Required branch-protection evidence remains pending and is the outstanding prerequisite to SPF-001 closure.

## Supersession

This decision is not superseded. A later decision that changes the required production-baseline checks or hosted enforcement must explicitly supersede this record without rewriting historical release evidence.
