# DEC-0256 — Release Archive Source Hardening and Extraction Deferral

## Metadata

- Decision ID: `DEC-0256`
- Title: Release Archive Source Hardening and Extraction Deferral
- Status: `Confirmed — source-only hardening; extraction, Docker context, and build expressly deferred`
- Date: 2026-07-29
- Decision owner: Shared Production Foundation / release provenance
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — release-archive/v1 hardening follow-on
- Related decisions: `DEC-0248`, `DEC-0249`, `DEC-0253`, `DEC-0254`, `DEC-0255`
- Related decision brief: Parent-confirmed Security, DevOps, and QA review with challenge round

## Decision

After independent Security, DevOps, and QA reviews and a targeted challenge
round, the next step is to harden only the source-level `release-archive/v1`
producer and verifier. All archive extraction, Docker-context creation, and
Docker build work is deferred.

The current archive output is not build-authorized. A separate confirmed
decision is required before extraction; it must address a pinned descriptor,
private controlled staging, and no-symlink operations. This decision is
source-only and grants no release credit or operational authority.

## Context

DEC-0255 established the canonical raw-USTAR archive contract and identified a
future verified archive as the only permitted source for a Docker context. The
reviews found that moving directly into extraction would enlarge the attack and
authority boundary before the producer/verifier is sufficiently hardened
against executable substitution, Git-environment influence, untrusted repository
selection, resource exhaustion, symlink races, and output replacement.

The immediate control need is therefore a bounded, hermetic archive source
tool. Extraction and build introduce distinct filesystem and operational risks;
they cannot be treated as an implementation detail of archive production.

The requested Code Spark and GPT-5.4 specialists were unavailable. The parent
used the available GPT-5.6 fallback for the bounded deliberation without
relaxing hard gates or expanding authority.

## Options considered

### Option A — selected: source-only producer/verifier hardening before extraction

- Summary: Harden `release-archive/v1` creation and verification under a
  controlled source boundary, while deferring extraction, Docker-context, and
  build behavior to a separate decision.
- Benefits: Reduces the trusted input and filesystem surface; makes the archive
  contract independently testable in CI; and prevents a source artifact from
  silently acquiring build authority.
- Failure modes: An insufficient executable allowlist, incomplete environment
  scrub, weak resource bounds, or unsafe staging lifecycle could still permit
  substitution, exhaustion, or file-target races.
- Why selected: It closes the prerequisite source-control risks without
  authorizing the materially broader extraction/build boundary.

### Option B — rejected: extract a verified archive and build a Docker context now

- Summary: Add archive extraction and Docker-context construction alongside the
  producer/verifier hardening.
- Benefits: Would advance a future build path sooner.
- Failure modes: Archive extraction can introduce path and symlink handling,
  staging privacy, descriptor pinning, and overwrite risks before their
  safeguards are decided and tested.
- Why rejected: A verified raw archive alone does not authorize extraction or a
  Docker context. The required containment design is not yet confirmed.

### Option C — rejected: rely on ambient Git, repository, and filesystem state

- Summary: Invoke Git by PATH from the caller environment and use caller-chosen
  repository/output paths without lifecycle controls.
- Benefits: Lower implementation effort.
- Failure modes: Executable replacement, `GIT_*` configuration influence,
  replacement/object indirection, untrusted repository selection, symlink
  races, and output overwrite can break exact-candidate integrity.
- Why rejected: It fails the source-isolation and safe-file-lifecycle gates.

### Option D — rejected: permit external or operational validation during source tests

- Summary: Let source tests call Docker, Compose, registry, network, or
  credential-bearing paths to gain apparent end-to-end coverage.
- Benefits: May expose later integration issues earlier.
- Failure modes: Expands authority, makes tests environment-dependent, risks
  credential exposure, and can falsely imply operational release evidence.
- Why rejected: This phase must remain hermetic and source-only; CI tests must
  enforce the absence of external and operational authority.

## Hard-gate assessment

- **Exact-candidate and source integrity:** Use only an absolute, allowlisted
  Git executable. Scrub `GIT_*` environment variables and disable Git
  replacement mechanisms. Resolve and validate a trusted repository root before
  reading canonical commit-tree objects; do not accept an ambient or caller
  selected repository as authoritative.
- **Bounded execution:** Apply explicit, fail-closed bounds to all source-tool
  inputs and to archive/tree resources, including archive bytes, entry count,
  path/link lengths, blob sizes, and traversal/work limits. Inputs or trees
  beyond a bound must be rejected, not streamed or expanded without limit.
- **Safe file lifecycle:** Read regular-file inputs through a secure,
  no-follow lifecycle. Create archive output only under a controlled staging
  root using a non-overwrite lifecycle; reject symlinks, pre-existing targets,
  path escapes, replacement races, and unsafe file types. Do not rely on a
  later cleanup or overwrite to repair an unsafe path.
- **No operational authority:** Source tooling and tests must have no external,
  Docker, Compose, registry, network, or credential behavior. CI must enforce
  that negative boundary, and CI must run the archive test suite.
- **Extraction/build deferral:** The present output is an archive-contract
  result only. It must not be extracted, used as a Docker context, or built.
  Any later extraction decision must require a pinned descriptor, private
  staging, and no-symlink operations before it can authorize such work.
- **Audit and release truth:** Passing source or CI tests can prove only the
  source contract. They do not prove registry publication, host installation,
  Compose execution, cutover, served identity, rollback, or release success.

## Required safeguards

1. Resolve Git through an absolute path that is explicitly allowlisted by the
   source contract; never rely on PATH lookup or a caller-supplied executable.
2. Scrub every `GIT_*` environment variable inherited by the tool and disable
   Git object/reference replacement mechanisms before any repository query.
3. Establish a trusted repository root and reject repository paths that are
   missing, outside the configured trust boundary, symlinked, replaced, or
   otherwise not the approved source root.
4. Enforce documented upper bounds for request input, commit/tree enumeration,
   entries, paths, link targets, blob payloads, archive bytes, and total work.
   All limits fail closed with bounded diagnostic output.
5. Use a regular-file, no-follow input lifecycle and revalidate file identity
   where necessary to prevent symlink and replacement races while reading.
6. Write only under a controlled staging root using secure directory handling,
   exclusive/non-overwrite output creation, no-follow operations, and cleanup
   that cannot delete or overwrite outside that root.
7. Ensure source and CI tests prohibit Docker, Compose, registry, network, and
   credential use. CI must run the positive, negative, resource-bound, and
   authority-boundary archive tests.
8. Do not add archive extraction, Docker-context construction, Docker build,
   image publication, host action, Compose action, or credentials under this
   record. A separate confirmed extraction decision must define a pinned
   descriptor, private staging, and no-symlink operations.

## Required tests and acceptance evidence

1. Tests prove the source tool invokes only the exact allowlisted absolute Git
   executable, with `GIT_*` variables scrubbed and replacements disabled.
2. Negative tests reject untrusted, substituted, symlinked, or out-of-bound
   repository roots; executable substitution; replacement configuration; and
   malformed or non-canonical source requests.
3. Resource tests reject every configured oversized input, archive, tree,
   entry-count, path/link, blob, and total-work condition without unbounded
   allocation, traversal, or archive output.
4. File-lifecycle tests reject symlink, non-regular, pre-existing, replacement,
   escape, and overwrite targets; prove controlled-staging-root containment and
   no-follow regular-file reads/writes.
5. CI runs the complete archive producer/verifier test suite and contains
   enforceable checks that the tests make no Docker, Compose, registry, network,
   or credential call.
6. Tests and review evidence prove there is no extraction, Docker-context,
   Docker-build, publication, host, Compose, cutover, credential, or release-
   credit path. Any extraction test is out of scope until a later decision.

## Implementation and documentation impact

- **Code / architecture:** Implementation is limited to source-only hardening
  of the `release-archive/v1` producer/verifier and its hermetic CI tests. The
  output remains non-extractable and non-build-authorized by this decision.
- **Data / schema:** No ERP business-schema or database migration change.
- **Workflow / permissions:** No product, deployment-role, host, registry, or
  credential authority change.
- **UI / mobile:** None.
- **Reporting:** Report only source-contract and CI evidence. Do not report a
  Docker context, build, image, deployment, or release outcome.
- **Knowledge base / training:** No user-facing behavior change; no Dunong
  handoff is required. Future operator documentation is outside this scope.
- **Tests / UAT:** CI archive tests are required source evidence only. All
  extraction, build, registry, host, public-edge, recovery, and release gates
  remain separately pending.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Harden the source-only producer/verifier with trusted executable/repository, environment, resource, and secure staging controls. | Engineering / Security | Before any extraction proposal | Complete as a source-only checkpoint; fixed Git executable/environment, trusted-root validation, bounded tree/blob/archive inputs, private staging output, and no-follow regular-file verification are implemented. |
| Add and run hermetic CI archive tests, including authority-boundary and lifecycle negative cases. | Engineering / QA / Security | Before any extraction proposal | Implemented locally and wired into CI; local focused provenance suite passes 17/17. Exact-commit hosted CI result remains pending after push. |
| Produce a new decision brief for extraction only, including a pinned descriptor, private staging, and no-symlink operations. | Parent / Security / DevOps | Before archive extraction or Docker-context work | Pending; required separate decision |
| Perform Docker-context, Docker build, registry, host, Compose, cutover, credential, rollback, and release work only under separately confirmed scopes. | DevOps / Security / QA / Release | Before production GO | Pending; not authorized or credited here |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0253-SOURCE-ONLY-CONTROLLER-INTEGRITY-AND-RECOVERY-CLOSURE.md`
- `docs/core/00-governance/decisions/DEC-0254-TWO-STAGE-RELEASE-PROVENANCE-BINDING.md`
- `docs/core/00-governance/decisions/DEC-0255-RELEASE-ARCHIVE-V1-COMMIT-TREE-CONTRACT.md`
- Parent-led independent Security, DevOps, and QA reviews; targeted challenge
  round; and parent confirmation on 2026-07-29. Code Spark and GPT-5.4 were
  unavailable; the available GPT-5.6 fallback supported the deliberation
  without relaxing hard gates or expanding authority.

## Supersession

This record hardens and narrows the source-only implementation sequence for
DEC-0255. It does not supersede DEC-0248, DEC-0249, DEC-0253, DEC-0254, or
DEC-0255. It explicitly defers archive extraction, Docker-context construction,
and Docker build authorization to a separate confirmed decision.
