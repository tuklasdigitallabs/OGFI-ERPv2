# DEC-0254 — Two-Stage Release Provenance Binding

## Metadata

- Decision ID: `DEC-0254`
- Title: Two-Stage Release Provenance Binding
- Status: `Confirmed — source-only provenance contract; no host activation, cutover, or release credit`
- Date: 2026-07-29
- Decision owner: Shared Production Foundation / release provenance
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — served-release provenance follow-on
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0248`, `DEC-0249`, `DEC-0250`, `DEC-0253`
- Related decision brief: Parent-confirmed provenance deliberation

## Decision

Release provenance uses two non-self-referential stages. The V2 baked identity
contains only the full canonical commit SHA and the digest of the defined,
immutable pre-image release archive. After final service images exist, a
detached post-build manifest binds that canonical SHA to the exact Compose SHA
and a complete keyed map of final OCI service-image digests.

The V2 baked identity must not embed an OCI image digest. OCI self-digest
embedding, rebuild-to-fixpoint schemes, and runtime-derived provenance are
rejected. This decision is source-only: it authorizes no host activation,
Compose execution, cutover, nonce-controller behavior, credentials, or release
credit.

## Context

DEC-0249 requires attributable served identity while DEC-0253 requires an
immutable artifact manifest that binds an approved candidate to exact Compose,
identity, and keyed service-image inputs. A final OCI image digest is only
known after building the image; embedding that digest in content baked into the
same image creates a self-reference that cannot be resolved safely by ordinary
rebuilds.

The required provenance must therefore distinguish the immutable source/pre-
image identity from the final image outputs, while still permitting exact
candidate verification. The repository has a hidden route; it is outside this
provenance contract and changes neither its scope nor any authorization,
public-probe, or release requirement.

The requested Code Spark and GPT-5.4 deliberation routes were unavailable. The
parent used the available GPT-5.6 fallback without relaxing hard gates or
expanding authority.

## Options considered

### Option A — selected: two-stage baked identity and detached final-image manifest

- Summary: Bake only the full canonical commit SHA and defined immutable
  pre-image release-archive digest into V2 identity. Create a detached
  post-build manifest that binds those canonical inputs to the exact Compose
  SHA and complete keyed final OCI service-image digests.
- Benefits: Removes the image self-reference, preserves immutable source
  identity, and produces an independently checkable complete candidate tuple.
- Failure modes: Ambiguous archive construction, non-canonical SHA values,
  incomplete service maps, mismatched Compose input, or an unsigned/unbound
  detached manifest could weaken attribution.
- Why selected: It is the only option that gives deterministic provenance
  without mutating final images or discovering identity at runtime.

### Option B — rejected: embed each final OCI self-digest in its own baked identity

- Summary: Place the final OCI digest in the image content that contributes to
  that image's digest.
- Benefits: Appears to expose the final image identity in one artifact.
- Failure modes: The identity changes the image and hence its digest, creating
  an unsatisfied self-reference or an unbounded rebuild sequence.
- Why rejected: It cannot establish a stable ordinary build contract.

### Option C — rejected: rebuild until a digest fixpoint is claimed

- Summary: Repeatedly rebuild an image, injecting the prior digest until a
  purported fixed point is reached.
- Benefits: Attempts to preserve a single embedded identity field.
- Failure modes: Non-convergence, non-reproducible builder metadata, hidden
  input drift, and unverifiable termination can fabricate provenance.
- Why rejected: A rebuild loop is not a deterministic or auditable provenance
  mechanism.

### Option D — rejected: derive provenance at runtime from tags, registry lookup, or host state

- Summary: Have the running service or release environment discover image or
  candidate identity after startup.
- Benefits: Defers manifest production.
- Failure modes: Mutable tags, registry/host drift, unavailable dependencies,
  and runtime substitution can make the response differ from the approved
  candidate.
- Why rejected: Runtime observation is not immutable build provenance and
  would blur source, host, and public evidence boundaries.

## Hard-gate assessment

- **Exact-candidate integrity:** The full canonical commit SHA, immutable
  pre-image archive digest, exact Compose SHA, and every final named service
  OCI digest must be bound into one complete candidate tuple. Missing, extra,
  duplicate, tag-only, or mismatched service entries fail closed.
- **Immutable provenance:** The pre-image archive must have a defined,
  deterministic construction and immutable digest. The detached manifest must
  be immutable and tied to the same canonical SHA; neither stage may be
  regenerated or substituted during verification.
- **Authority and isolation:** This contract introduces no release execution,
  host, registry credential, nonce-controller, proxy, or application-user
  authority. It must not expose secret material.
- **Audit and evidence integrity:** Source artifacts may prove only source
  provenance. They cannot be treated as host installation, Compose execution,
  cutover, served-identity, public-probe, rollback, or release-success proof.
- **Recovery and phase scope:** DEC-0248 and DEC-0253 controller admission,
  journal, recovery, maintenance, and rollback gates remain intact. No ERP
  schema, workflow, permission, inventory, or money behavior changes.

## Required safeguards

1. Define the pre-image release archive exactly, including canonical file set,
   ordering, normalization, exclusion rules, and digest algorithm. Reject any
   archive that cannot be reconstructed under that definition.
2. Require a full canonical commit SHA, not an abbreviated SHA, mutable branch,
   tag, or runtime revision value, in both identity and detached-manifest
   binding.
3. Keep V2 baked identity limited to the canonical SHA and pre-image archive
   digest. Do not insert OCI image digests, Compose values, runtime data,
   secrets, credentials, nonce values, or host-derived data.
4. Generate the detached post-build manifest only after final image outputs are
   available. Bind the canonical SHA, exact Compose SHA, and complete keyed
   final OCI service-image digest map; reject unknown, duplicate, missing, or
   tag-only entries.
5. Preserve deterministic manifest canonicalization and integrity verification
   suitable for DEC-0253 admission. A later controller must consume the
   admitted manifest rather than independently resolving tags, Compose files,
   image digests, or source identity.
6. Keep the two stages explicitly labeled: baked V2 identity is pre-image
   provenance; the detached manifest is final-output binding. Do not represent
   either artifact alone as installed-host or public-serving evidence.
7. Do not implement a self-digest rebuild loop or runtime provenance endpoint
   as a substitute. Any future change to the identity fields or final-image
   binding requires a new confirmed decision.

## Required tests and acceptance evidence

1. Tests prove V2 baked identity contains exactly a full canonical commit SHA
   and the defined pre-image archive digest, with no OCI self-digest, Compose,
   runtime, credential, or nonce field.
2. Determinism tests prove the same defined pre-image release input yields the
   same archive digest and that excluded/altered/ambiguous inputs are rejected
   or change the digest as defined.
3. Detached-manifest tests prove it binds the identical canonical SHA, exact
   Compose SHA, and each required named final OCI service digest.
4. Negative tests reject abbreviated or malformed SHA values, archive mismatch,
   Compose mismatch, missing/extra/duplicate service keys, mutable tags,
   malformed OCI digests, altered manifest material, and mismatched identity.
5. Tests prove no fixpoint/rebuild loop or runtime registry/host lookup is used
   to establish provenance.
6. Review output must label all results source-only. Passing tests must not
   issue host activation, Compose, cutover, nonce-controller, credentials,
   public-probe, rollback, or release-success credit.

## Implementation and documentation impact

- **Code / architecture:** Future source work may define the constrained V2
  identity and detached post-build manifest contracts plus their validators. It
  must not activate hosts, execute Compose, perform cutover, operate a nonce
  controller, access credentials, or report release success.
- **Data / schema:** No ERP business-schema or database migration change.
- **Workflow / permissions:** No product, deployment-role, or host authority
  change.
- **UI / mobile:** None.
- **Reporting:** Provenance output must distinguish baked pre-image identity,
  detached final-output binding, and separately required host/public evidence.
- **Knowledge base / training:** No user-facing behavior changes; no Dunong
  handoff is required. Future operator enablement remains outside this scope.
- **Tests / UAT:** The listed source tests are prerequisites only; DEC-0248,
  DEC-0249, DEC-0250, and DEC-0253 operational evidence remains pending.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Define and implement the canonical pre-image release archive and V2 baked identity contract. | Engineering / DevOps | Before final-image provenance work | Pending; source-only |
| Define and implement the detached post-build manifest with canonical SHA, exact Compose SHA, and keyed final OCI service digests. | Engineering / DevOps | After final-image outputs are available; before controller admission | Pending; source-only |
| Add the positive and negative source-contract tests, including self-reference and runtime-provenance prohibitions. | Engineering / Security / QA | Before any provenance claim | Pending |
| Admit the detached manifest only through the DEC-0253 controller-integrity contract. | Engineering / Security | Before any future release-controller progression | Pending |
| Perform host activation, Compose execution, nonce-controller work, credential handling, cutover, and release evidence only under separately confirmed scopes. | DevOps / Security / QA / Release | Before production GO | Pending; not authorized or credited here |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md`
- `docs/core/00-governance/decisions/DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0250-NGINX-SINGLE-HOP-SHARED-VPS-EDGE.md`
- `docs/core/00-governance/decisions/DEC-0253-SOURCE-ONLY-CONTROLLER-INTEGRITY-AND-RECOVERY-CLOSURE.md`
- Parent-confirmed two-stage provenance conclusion on 2026-07-29. Requested
  Code Spark and GPT-5.4 routes were unavailable; available GPT-5.6 fallback
  supported the bounded deliberation without relaxing hard gates.

## Supersession

This record supplements DEC-0249's served-identity provenance direction and
DEC-0253's immutable artifact-manifest admission by fixing the non-
self-referential two-stage provenance model. It does not supersede DEC-0248,
DEC-0249, DEC-0250, or DEC-0253, and it does not authorize operational release
actions or satisfy their evidence gates.
