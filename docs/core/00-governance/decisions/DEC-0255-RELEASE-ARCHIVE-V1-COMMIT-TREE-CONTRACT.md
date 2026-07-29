# DEC-0255 — Release Archive V1 Commit-Tree Contract

## Metadata

- Decision ID: `DEC-0255`
- Title: Release Archive V1 Commit-Tree Contract
- Status: `Confirmed — source-only archive contract; no operational activation or release credit`
- Date: 2026-07-29
- Decision owner: Shared Production Foundation / release provenance
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — release provenance follow-on
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0248`, `DEC-0249`, `DEC-0250`, `DEC-0253`, `DEC-0254`
- Related decision brief: Parent-confirmed release-archive/v1 deliberation

## Decision

`release-archive/v1` is constructed directly from the exact full commit tree as
raw USTAR bytes. Its SHA-256 over those raw, uncompressed archive bytes is the
release-archive artifact digest used by the DEC-0254 pre-image identity.

The archive admits the full commit-tree file set only, with strict path, mode,
header, and ordering metadata. It is the sole permitted source for a future
release Docker build context and must be strictly verified before extraction or
build. `git archive`, worktree construction, and all compression are prohibited.
This confirms a source-only contract; it authorizes no operational activation,
registry or host use, Compose execution, cutover, credentials, or release credit.

## Context

DEC-0254 requires an immutable, defined pre-image release archive digest, but
that record deliberately left the archive's canonical construction to a
follow-on contract. A provenance digest is only meaningful if the input is
reconstructable from the exact canonical commit and cannot vary with a local
worktree, Git export behavior, filesystem metadata, archive implementation, or
compression container.

The archive must also establish a narrow future build boundary: Docker may use
only a verified archive extracted from the exact full commit tree. It must not
gain authority to build from a checkout, a hand-prepared context, a Git export,
or a mutable registry/host input.

The requested default specialist route was unavailable; the parent used the
available GPT-5.6 fallback for the bounded deliberation. That fallback did not
relax hard gates or expand implementation authority.

## Options considered

### Option A — selected: direct raw USTAR archive from the exact full commit tree

- Summary: Materialize `release-archive/v1` from every entry of the exact
  canonical commit tree, and calculate SHA-256 over the resulting raw USTAR
  byte stream before any extraction or compression.
- Benefits: Gives one commit-derived, reproducible pre-image input; prevents
  local checkout contamination; and gives a strict source boundary for future
  Docker context creation.
- Failure modes: Non-canonical traversal, omitted tree entries, permissive path
  handling, metadata drift, or digesting compressed rather than raw bytes could
  bind a different source input.
- Why selected: It is the bounded construction that satisfies DEC-0254's
  immutable pre-image requirement without self-reference or live infrastructure.

### Option B — rejected: use `git archive`

- Summary: Delegate archive generation to Git's archive export behavior.
- Benefits: Convenient and familiar command-line workflow.
- Failure modes: Export attributes, implicit representation choices, and tool
  behavior make the required full-tree and strict-metadata contract indirect;
  it is not the approved direct USTAR construction.
- Why rejected: The selected contract requires direct control of the exact
  full-tree entry set and USTAR byte representation.

### Option C — rejected: build an archive from a worktree or prepared Docker context

- Summary: Archive the checked-out repository or a locally assembled context.
- Benefits: Simple for a developer or CI runner to inspect.
- Failure modes: Untracked, ignored, generated, stale, altered, or omitted
  files and filesystem-derived metadata can change the input independently of
  the committed tree.
- Why rejected: A worktree is not the exact full commit tree and cannot serve
  as the provenance source.

### Option D — rejected: hash a compressed archive or permit compression as the artifact

- Summary: Produce `tar.gz`, `tar.zst`, or another compressed representation
  and use its bytes or digest as the release artifact.
- Benefits: Smaller transport representation.
- Failure modes: Compressor version, settings, timestamps, and framing can
  alter bytes without changing the underlying tree and obscure the raw archive
  boundary.
- Why rejected: The artifact digest is specifically SHA-256 of raw USTAR bytes;
  compression is outside `release-archive/v1`.

### Option E — rejected: defer canonical verification until or after Docker build

- Summary: Let extraction or Docker build discover malformed or mismatched
  archive input.
- Benefits: Fewer up-front checks.
- Failure modes: Unsafe paths, duplicate/ambiguous entries, or mismatched
  content can enter the build context before the artifact identity is proven.
- Why rejected: Verification must complete successfully before extraction or
  any build action.

## Hard-gate assessment

- **Exact-candidate integrity:** The input tree must be identified by a full
  canonical commit SHA. The archive file set is exactly the full commit tree:
  every and only committed tree entry needed to represent that tree, including
  directory, regular-file, executable-mode, and symbolic-link entries as
  represented by the tree. It excludes the worktree, `.git` directory,
  untracked/ignored/generated files, external inputs, and any separately
  assembled Docker context.
- **Canonical artifact identity:** SHA-256 is calculated over raw USTAR bytes,
  not over a filename, directory, compressed stream, extracted content, or a
  later copy. The resulting digest is the release-archive artifact digest.
- **Strict representation:** The producer and verifier must require normalized,
  safe relative paths with no root prefix; reject absolute paths, traversal,
  duplicate paths, and unsupported or ambiguous entries. Emit every implied
  directory and every regular-file or symbolic-link tree entry in ascending
  bytewise path order. Permit only Git tree modes `040000`, `100644`, `100755`,
  and `120000`; reject gitlinks (`160000`) and any other type or mode. Encode
  directories as mode `0755`/type `5`, non-executable regular files as
  `0644`/type `0`, executable regular files as `0755`/type `0`, and symlinks as
  `0777`/type `2` with the exact tree link target.

  Each entry must use a lossless USTAR name/prefix representation or fail.
  Its header must use `ustar\0` magic, version `00`, UID `0`, GID `0`, empty
  user/group names, mtime `0`, device-major `0`, device-minor `0`, the
  tree-derived size or link target as applicable, and a correctly calculated
  checksum; regular-file payloads use the exact blob bytes and USTAR block
  padding. The archive ends with exactly two zero blocks. Any non-conforming
  header, mode, path, entry order, payload, link target, or end marker fails
  closed.
- **Build-boundary integrity:** A future Docker context may be created only by
  strictly verifying the archive's format, metadata, full-tree membership,
  ordering, and raw-byte SHA-256 against the declared canonical commit before
  extraction. Extraction and build are prohibited on verification failure.
- **Authority, recovery, and phase scope:** This decision adds no host,
  registry, Docker/Compose, credential, cutover, rollback, proxy, application,
  inventory, money, tenant, or user authority. Source artifacts cannot prove
  installation, a running service, a served identity, or release success.

## Required safeguards

1. Accept only a full canonical commit SHA as the tree identifier; reject short
   SHAs, refs, branches, tags, runtime revisions, and independently supplied
   file lists.
2. Enumerate the exact full commit tree directly. Do not read a worktree or use
   `git archive`; do not omit files through export attributes, Docker ignores,
   local configuration, or convenience filtering.
3. Define `release-archive/v1` as raw USTAR only. Do not compress it, hash a
   compressed derivative, or substitute another tar dialect/container.
4. Specify and validate every archive entry's normalized path, permitted Git
   tree type/mode, USTAR representation, payload/link target where applicable,
   and deterministic bytewise path ordering. Require USTAR magic/version;
   zero UID, GID, mtime, and device fields; empty user/group names; computed
   checksum; canonical block padding; and exactly two terminal zero blocks.
   Reject malformed, non-canonical, duplicate, out-of-order, unsafe, or
   unsupported entries rather than normalizing them after the fact.
5. Calculate SHA-256 over the finalized raw USTAR bytes and bind that exact
   digest to the same canonical commit SHA for DEC-0254 pre-image identity.
6. Before extraction or a future Docker build, independently re-enumerate the
   declared commit tree and strictly verify complete tree membership, raw bytes,
   USTAR headers, paths, modes, entry order, and SHA-256. Any mismatch is a
   fail-closed result with no extraction or build.
7. Permit a future Docker build context only from successfully verified archive
   extraction. Docker build inputs must not add, remove, replace, or source
   files outside the verified archive.
8. Keep all output explicitly source-only. Do not call registry or host APIs,
   execute Docker/Compose, handle credentials, activate a release, cut over,
   or award release credit under this decision.

## Required tests and acceptance evidence

1. Determinism tests prove the same exact commit tree yields identical raw
   USTAR bytes and identical SHA-256 artifact digest.
2. Completeness tests prove the archive contains every and only the direct
   full-tree entries, including directory, regular-file, executable-mode, and
   symbolic-link representation, and never contains worktree-only or Git
   administrative content.
3. Contract tests verify strict normalized relative paths, permitted modes,
   USTAR headers, fixed metadata, payload/link target handling, and deterministic
   bytewise entry order.
4. Negative tests reject abbreviated/referenced SHA values; altered, missing,
   extra, duplicate, unsafe, out-of-order, or malformed entries; mode/header/
   payload/link-target drift; non-USTAR and compressed inputs; raw-byte digest
   mismatch; and any `git archive` or worktree source path.
5. Gate tests prove verification occurs and passes before any archive extraction
   or Docker build context action, and that a failed verification prevents both.
6. Static/review evidence proves this source slice performs no Docker/Compose,
   registry, host, proxy, credential, activation, cutover, or release-credit
   behavior.

## Implementation and documentation impact

- **Code / architecture:** Future source work may add a direct commit-tree
  `release-archive/v1` producer/verifier and the guarded archive-to-Docker-
  context boundary only. It must not perform a Docker build, use a registry or
  host, run Compose, or initiate a release.
- **Data / schema:** No ERP business-schema or database migration change.
- **Workflow / permissions:** No product or deployment-role authority change.
- **UI / mobile:** None.
- **Reporting:** Source output may report archive-contract verification only;
  it must not claim image publication, installation, served identity, cutover,
  or release completion.
- **Knowledge base / training:** No user-facing behavior change; no Dunong
  handoff is required. Future operator runbooks remain outside this scope.
- **Tests / UAT:** The listed source tests are prerequisites only. All host,
  registry, Compose, cutover, recovery, public-probe, and release-readiness
  evidence remains separately pending.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the direct full-commit-tree raw USTAR producer and SHA-256 artifact-digest contract. | Engineering / DevOps | Before any release Docker-context work | Complete as a source-only tool; `scripts/release-archive-v1.mjs create` enumerates only canonical full-SHA Git objects and writes raw USTAR bytes. |
| Implement the strict verifier and extraction/build gate with positive and negative tests. | Engineering / Security / QA | Before any archive extraction or Docker build | Verifier complete as a source-only tool; it re-materializes the declared commit tree and byte-compares the candidate archive before future extraction/build work may be introduced. No extraction/build boundary exists or is authorized yet. |
| Bind a verified release-archive digest to DEC-0254's baked pre-image identity and DEC-0253 admission contract. | Engineering / Security | Before later provenance/controller progression | Pending |
| Perform Docker builds, registry publication, host installation, Compose execution, credentials, cutover, rollback, and release evidence only under separately confirmed scopes. | DevOps / Security / QA / Release | Before production GO | Pending; not authorized or credited here |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md`
- `docs/core/00-governance/decisions/DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0253-SOURCE-ONLY-CONTROLLER-INTEGRITY-AND-RECOVERY-CLOSURE.md`
- `docs/core/00-governance/decisions/DEC-0254-TWO-STAGE-RELEASE-PROVENANCE-BINDING.md`
- `scripts/release-archive-v1-lib.mjs`
- `scripts/release-archive-v1.mjs`
- `scripts/release-archive-v1.test.mjs`
- Parent-confirmed `release-archive/v1` conclusion on 2026-07-29. The
  available GPT-5.6 fallback supported the bounded deliberation without
  relaxing hard gates or expanding authority.

## Supersession

This record supplies the canonical pre-image release-archive construction that
DEC-0254 requires. It supplements, and does not supersede, DEC-0248,
DEC-0249, DEC-0253, or DEC-0254. It does not authorize operational release
actions or satisfy any host, registry, Compose, cutover, credential, or
release-success evidence gate.
