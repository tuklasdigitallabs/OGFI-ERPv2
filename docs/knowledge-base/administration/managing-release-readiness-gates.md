# Managing Release Readiness Gates

**Audience / required role:** ERP administrators, QA leads, release managers, and product owners with Core Administration access  
**Applies to:** UAT, deployment, enablement, security, and GO / NO-GO readiness tracking  
**Last verified against:** implemented Release Readiness gate register, evidence requirements, UAT signoff notes, audit, and DEC-0036 source-decision tracking

## Purpose

Use Release Readiness to record whether a module or pilot package has enough evidence to proceed to final GO / NO-GO review. The page does not approve release by itself. It records owner status, evidence references, blockers, waivers, and decisions for review.

## Navigation Path

`Admin` → `Release Readiness`

## Exporting The Readiness Register

Use **Export Readiness Register** when the release pack needs a CSV summary of the ERP readiness state. The export includes:

- readiness summary counts
- gate status, owner role, evidence reference, decision note, and blocker
- UAT, deployment, and enablement evidence records with verification status
- security evidence counters for MFA, session invalidation, break-glass review, and pending controlled access requests
- external-security proof targets for final review
- Release Board decisions and participant notes

The export requires Core Administration access and writes export audit history. It is a review aid only. Keep the signed UAT, deployment, rollback, training, external-security proof references, and Release Board artifacts in the approved evidence repository and reference them from the readiness records.

Browser exports provide both **Export Readiness Register** and **Download SHA-256** actions. Download both files from the same page view so the `.sha256` file matches the CSV timestamp. The CSV response also includes an `X-OGFI-CSV-SHA256` header for reviewers who capture browser response metadata.

For final release evidence, use the CLI export with `DATABASE_URL=<pilot-or-staging-url> pnpm release:readiness-register`. The CLI command creates both `release-readiness-register-*.csv` and `release-readiness-register-*.csv.sha256`. It uses `psql` when available and falls back to Prisma when PostgreSQL client tools are not installed. Keep that checksum sidecar with the CSV. Final review and GO / NO-GO treat the register export as incomplete when the CSV is present but its checksum sidecar is missing or does not match the CSV.

## Updating A Gate

1. Open the correct readiness category tab.
2. Review the gate owner, description, policy requirement, current status, and any blocker.
3. Select `Update Gate`.
4. Choose the new status.
5. Add a target date if work remains.
6. Add an evidence reference before marking the gate `READY`, `CONDITIONAL GO`, or `WAIVED`.
7. Add the decision note when required.
8. Enter the reason for update.
9. Save the gate.

## UAT Evidence Rules

UAT gates require both evidence and a decision note before they are marked ready, conditional, or waived. The decision note should name one or more of:

- owner signoff
- scenario or acceptance-matrix result
- defect disposition
- waiver and mitigation
- DEC-0036 default revision decision
- effective date or retest plan

## UAT Evidence Register

The **UAT evidence** tab includes a UAT evidence register. Use **Record Evidence** to capture scenario execution, defect disposition, policy version trace, signed acceptance matrix, and default revision evidence.

The required UAT evidence types are:

- scenario execution
- defect disposition
- policy version trace
- acceptance matrix
- default revision register

When recording evidence, choose the workflow area from the dropdown. Phase 3 readiness gates use these workflow-area values to verify coverage:

- `Phase 3 finance controlled foundation`
- `Phase 3 workforce controlled foundation`
- `Phase 3 deferred blocker review`

Recorded evidence must be verified by someone other than the person who recorded it. Rejected evidence must be replaced or the UAT gate must remain blocked.

The ERP blocks UAT gates from being marked `READY` when verified evidence is missing or when verified results still contain unresolved `FAIL` or `BLOCKED` outcomes. Failed or blocked results must be retested, waived with mitigation, or dispositioned before the gate can be marked ready.

## Security Evidence Preflight

The **Security controls** tab includes live evidence counters in addition to manual gate statuses:

- privileged users with verified MFA evidence
- MFA users still pending, missing, or revoked
- provider session invalidation records still pending external completion
- break-glass access that is open or still needs post-review
- controlled access requests for sensitive roles or high-risk scopes that are still pending review

Do not mark the security gates ready until these counters are resolved or the Release Board records an explicit condition, waiver, or mitigation.

The ERP blocks a security gate from being marked `READY` when its matching live counter still has unresolved items:

- privileged MFA cannot be `READY` while privileged users have pending, missing, or revoked MFA evidence
- session revalidation cannot be `READY` while provider session invalidation records are still pending external completion
- break-glass control cannot be `READY` while access is open or post-review is due
- controlled access requests cannot be `READY` while sensitive role or high-risk scope requests are still pending review

If the Release Board accepts the risk temporarily, use `CONDITIONAL_GO` or `WAIVED` with evidence and a decision note that names the owner, mitigation, expiry, and retest or follow-up plan.

## External Security Proof References

The ERP security counters show whether the ERP-side records are clear. Final review also needs proof from systems outside the ERP, such as the identity provider, MFA provider, approved evidence repository, or security review record.

Before final GO / NO-GO, Security and IT owners must provide approved proof references using these target names:

| Proof target | What it proves |
|---|---|
| `external-security/mfa-provider-enrollment-and-runtime-proof.*` | Privileged users have provider-side MFA enrollment and runtime challenge evidence. |
| `external-security/idp-session-invalidation-proof.*` | External identity-provider sessions were terminated for ERP invalidation records that required provider action. |
| `external-security/vault-or-artifact-storage-index.*` | The release evidence pack, screenshots, checksums, signed documents, and sensitive proof references are stored in the approved repository. |
| `external-security/break-glass-review-and-revocation-proof.*` | Break-glass access was revoked or expired and post-use review evidence was captured. |

Each proof reference must use the same evidence run ID as the final release evidence session and include the marker `RESULT | PASS | External security proof captured.`. These references do not replace the external provider or vault records; they point reviewers to the approved proof.

If these external proof references are missing, the final review and GO / NO-GO evidence reports remain blocked even when the ERP counters show zero unresolved items.

## Evidence Manifest Integrity

After all release evidence, signed documents, readiness register exports, and external-security proof references are collected, run `pnpm release:evidence:manifest`. The command creates both:

- `manifests/release-evidence-manifest-*.txt`
- `manifests/release-evidence-manifest-*.txt.sha256`

Final review and GO / NO-GO verify that the checksum sidecar matches the latest manifest. If the manifest is regenerated, copied, edited, or replaced, keep the matching `.sha256` file with it. If any source evidence changes after the manifest is generated, rerun `pnpm release:evidence:manifest` before final review.

## Deployment Evidence Register

The **Deployment controls** tab includes a deployment evidence register. Use **Record Evidence** to capture the evidence type, environment, evidence reference, performed date/time, performer, notes, and reason.

The required release evidence types are:

- migration
- backup
- restore rehearsal
- rollback plan
- smoke test
- monitoring / hypercare

Recorded evidence must be verified by someone other than the person who recorded it. Rejected evidence must be replaced or the deployment gate must remain blocked.

The ERP blocks deployment gates from being marked `READY` when verified evidence is missing:

- **Migration, backup, and restore evidence** requires verified migration, backup, restore rehearsal, rollback plan, and smoke-test evidence.
- **Monitoring and hypercare ready** requires verified monitoring / hypercare evidence.

If the Release Board accepts incomplete deployment evidence temporarily, use `CONDITIONAL_GO` or `WAIVED` with evidence and a decision note that names the owner, mitigation, expiry, and follow-up plan.

## Enablement Evidence Register

The **Enablement** tab includes an enablement evidence register. Use **Record Evidence** to capture role-based training signoff, known-limit acknowledgement, support-route confirmation, KB review, release-note review, and training-impact assessment references.

The required enablement evidence types are:

- training signoff
- known-limit acknowledgement
- support-route confirmation
- KB review
- release-note review
- training-impact assessment

Recorded evidence must be verified by someone other than the person who recorded it. Rejected evidence must be replaced or the enablement gate must remain blocked.

The ERP blocks enablement gates from being marked `READY` when verified evidence is missing:

- **Role-based training signoff** requires verified training signoff, known-limit acknowledgement, and support-route confirmation evidence. A verified training signoff may satisfy the acknowledgement and support-route requirements when both boxes are checked.
- **KB and release notes reviewed** requires verified KB review, release-note review, and training-impact assessment evidence.

If the Release Board accepts incomplete enablement evidence temporarily, use `CONDITIONAL_GO` or `WAIVED` with evidence and a decision note that names the owner, mitigation, expiry, and follow-up plan.

## Release Board Decision

The **GO / NO-GO** tab includes a Release Board decision register. Use **Record Decision** after the readiness gates, evidence pack, deployment evidence, security counters, UAT disposition, and enablement items have been reviewed.

Supported board outcomes are:

- `GO`
- `CONDITIONAL_GO`
- `HOLD`
- `ROLLBACK`
- `FORWARD_FIX`

A `GO` decision requires all required readiness gates to be ready, conditionally ready, or waived, with no hold gates. The GO / NO-GO readiness gate cannot be marked `READY` unless the latest Release Board decision is `GO`. It cannot be marked `CONDITIONAL_GO` unless the latest Release Board decision is `CONDITIONAL_GO`. It cannot be marked `WAIVED` unless the latest Release Board decision is `HOLD`, so a final-gate waiver is still traceable to an explicit board decision rather than a silent release bypass.

Record the signed decision reference, participants, decision basis, chair, date/time, conditions, mitigation, rollback trigger, expiry, or forward-fix plan as applicable.

## Status Guide

| Status | Meaning |
|---|---|
| `PENDING` | Work has not started or evidence is not available. |
| `IN_PROGRESS` | Evidence collection or remediation is ongoing. |
| `READY` | Required evidence and signoff are recorded. |
| `CONDITIONAL_GO` | Proceeding is allowed only under the recorded conditions. |
| `HOLD` | Release remains blocked until the blocker is resolved. |
| `WAIVED` | The gate is formally waived with evidence and decision note. |

## Controls And Warnings

- Release readiness updates require Core Administration permission and company Manage scope.
- Evidence is stored as a reference to the approved evidence pack, signed artifact, checklist, report, or repository item.
- UAT ready/conditional/waived gates require a decision note, not only a link.
- Hold gates require a blocker summary.
- Conditional GO and waived gates require a decision note.
- Every gate update writes audit history with before and after status, evidence reference, decision note, blocker, owner role, and DEC-0036 source reference.

## What To Check

- Required gates are not left `PENDING` or `IN_PROGRESS` before GO / NO-GO review.
- Any `HOLD` gate has a blocker summary and owner.
- UAT gates include scenario evidence plus owner signoff or default-revision decision.
- Waivers include mitigation, expiry or retest plan, and owner.

## CLI Readiness Evidence Checks

The local pilot readiness check verifies that the DEC-0036 evidence-register tables exist. During actual UAT and release rehearsal, the release owner can tighten the check with threshold variables:

- `PILOT_MIN_UAT_EVIDENCE_RECORDS`
- `PILOT_MIN_VERIFIED_UAT_EVIDENCE_RECORDS`
- `PILOT_MIN_DEPLOYMENT_EVIDENCE_RECORDS`
- `PILOT_MIN_VERIFIED_DEPLOYMENT_EVIDENCE_RECORDS`
- `PILOT_MIN_ENABLEMENT_EVIDENCE_RECORDS`
- `PILOT_MIN_VERIFIED_ENABLEMENT_EVIDENCE_RECORDS`
- `PILOT_MIN_RELEASE_BOARD_DECISIONS`
- `PILOT_REQUIRE_RELEASE_GATES_READY=true`

Use these thresholds only after the team is ready to prove collected evidence. Before UAT starts, the defaults allow zero records so setup checks can pass without fake evidence.

Use `PILOT_REQUIRE_RELEASE_GATES_READY=true` for release rehearsal or final GO / NO-GO evidence. In that strict mode, the DB-backed readiness check also fails when a required release readiness gate is missing, still pending or in progress, on hold, accepted without evidence, conditionally/waived without a decision note, or when the GO / NO-GO gate status does not match the latest Release Board decision.
