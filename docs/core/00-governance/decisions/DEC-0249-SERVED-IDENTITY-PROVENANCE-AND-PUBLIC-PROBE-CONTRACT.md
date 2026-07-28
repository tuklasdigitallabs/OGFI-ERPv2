# DEC-0249 — Served-Identity Provenance and Public-Probe Contract

## Metadata

- Decision ID: `DEC-0249`
- Title: Served-Identity Provenance and Public-Probe Contract
- Status: `Confirmed — source foundation implemented; hosted evidence pending; production NO-GO`
- Date: 2026-07-28
- Decision owner: Shared Production Foundation / Hostinger deployment
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations; controlled release verification
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0246`, `DEC-0247`, `DEC-0248`
- Related decision brief: Parent-led served-identity contract deliberation and conclusion

## Decision

The release candidate's provenance is immutable and build-baked: the candidate's
approved full commit SHA and artifact identity are embedded during the controlled
build and must be the only provenance identity a served candidate can report.
The public identity response is a dynamic, `no-store` response that binds a
controller-supplied request nonce to that immutable build provenance.

At the public edge, Caddy must remove any controller-generated fence header from
the upstream response and re-stamp the canonical fence header itself only after
the edge has selected the active upstream. Before bounded smoke may be accepted,
an external public HTTPS probe must independently reach every configured public
address and verify the expected candidate identity, nonce binding, and edge
fence. A failed, missing, mismatched, cached, or unproven per-address probe is a
release failure and keeps production **NO-GO**.

## Context

DEC-0248 requires exact-candidate attribution through cutover and authoritative
served-SHA smoke. A controller-local check, a mutable runtime environment value,
or a response that can be cached cannot prove that each public HTTPS address is
serving the intended candidate. Likewise, an upstream-controlled fence header
can be forged, retained across a proxy change, or describe a controller state
rather than the public edge's selected target.

The contract separates immutable candidate provenance from per-request proof of
freshness, and makes the reverse proxy the authority for the externally observed
fence. It does not replace the DEC-0248 release service, phase journal,
immutable-artifact verification, migration gates, recovery controls, or hosted
acceptance evidence.

## Options considered

### Option A — selected: build-baked provenance, dynamic nonce, edge-restamped fence, per-address public probe

- Summary: Bake approved provenance into the immutable artifact; expose it only
  through a dynamic `no-store` identity response carrying a request nonce; have
  Caddy strip and re-stamp the canonical fence header; independently probe every
  public HTTPS address before smoke.
- Benefits: Binds the observed response to an immutable candidate and a fresh
  controller challenge, proves the live public route rather than an internal
  target, and detects address-specific DNS, certificate, cache, proxy, or
  upstream divergence.
- Failure modes: A build can be mislabeled before approval, a nonce may be
  replayed if uniqueness is weak, Caddy can be bypassed or misconfigured, a
  probe can originate from an unrepresentative network, or an address can be
  omitted from the configured probe set.
- Why selected: It is the only option considered that combines immutable
  provenance, response freshness, edge attribution, and independent proof for
  each public HTTPS address before smoke is credited.

### Option B — rejected: controller/runtime response identity with no edge re-stamp

- Summary: Let the application or release controller return the served identity
  and fence header directly, then use it as smoke evidence.
- Benefits: Lower initial implementation effort.
- Failure modes: Mutable runtime state and upstream headers do not prove which
  candidate Caddy selected; stale/cacheable responses and proxy-target drift can
  produce false success.
- Why rejected: It fails exact public-edge attribution and can credit a
  predecessor or non-authoritative upstream response.

### Option C — rejected: one hostname/address probe or internal-only verification

- Summary: Verify one preferred public endpoint, a loopback/internal route, or
  the controller's own upstream connection before smoke.
- Benefits: Faster and simpler operation.
- Failure modes: Alternate addresses can serve a different candidate, old DNS,
  certificate, cache, or proxy path; internal success does not establish public
  HTTPS reachability.
- Why rejected: It cannot establish the required per-address external public
  service identity.

### Option D — rejected: static/cacheable public identity response

- Summary: Publish a static provenance file or permit ordinary intermediary
  caching of the identity response.
- Benefits: Minimal runtime work.
- Failure modes: Cached predecessor responses can satisfy a check without a
  fresh request/response binding; no request nonce proves the checked response
  was generated for the release controller's challenge.
- Why rejected: It fails freshness and replay-resistance requirements.

## Hard-gate assessment

- **Exact-candidate integrity and audit:** Build-baked provenance is bound to
  the approved immutable candidate. The nonce, public address, response
  provenance, edge fence, time, and probe outcome must be retained as bounded
  release evidence without secrets.
- **Authorization and trust boundary:** Only the controlled release controller
  may issue a probe nonce. Caddy, not the application/controller upstream,
  authors the externally trusted fence header after upstream selection.
- **Transactional/recovery integrity:** This contract is an additional DEC-0248
  cutover-verification gate. It neither relaxes the single release fence and
  phase-journal recovery requirements nor makes independent release/database
  operations atomic.
- **Topology and public-route coverage:** Every configured public HTTPS address
  is in scope. An unconfigured address, an alternate proxy path, or a bypass of
  Caddy invalidates acceptance until covered or removed under controlled change.
- **Phase scope:** No ERP workflow, role, approval, inventory, finance, or
  user-facing business behavior changes.

The decision passes source-of-truth design hard gates only. Until the source
contract, installed Caddy configuration, and external per-address HTTPS evidence
are accepted, production remains **NO-GO**.

## Required safeguards

- Inject the provenance value only in the controlled immutable build after the
  approved full commit SHA and artifact identity are known; reject absent,
  malformed, mutable, or candidate-mismatched provenance.
- Make the public identity endpoint dynamic and explicitly `Cache-Control:
  no-store`; it must return the supplied one-time controller nonce unchanged in
  its bounded identity payload and must not expose credentials or internal paths.
- Generate cryptographically strong, single-use, expiry-bounded controller
  nonces; bind each evidence record to one release request and reject replay,
  missing, expired, or mismatched nonces.
- Configure Caddy to strip any upstream/controller fence header and re-stamp the
  canonical fence header from the active edge-controlled release context. Do not
  trust an upstream-provided value or a static proxy default.
- Define the complete approved set of public HTTPS addresses from controlled
  deployment configuration. Independently probe each address over public HTTPS,
  validate TLS for that address, and record the target address, resolved route,
  candidate provenance, nonce, fence, timestamp, and outcome.
- Run no bounded smoke credit until every required public probe passes for the
  same candidate and release fence. Any timeout, redirect/path ambiguity,
  certificate failure, cache indicator, header mismatch, provenance mismatch,
  nonce mismatch, or address omission must fail closed.
- Retain DEC-0248's immutable-artifact, cutover, journal/recovery, rollback,
  migration, credential-isolation, and hosted-evidence safeguards in full.

## Required tests and acceptance evidence

1. Prove the built artifact reports only its embedded approved provenance and
   rejects/does not substitute mutable runtime provenance.
2. Prove the public identity response is dynamic, `no-store`, bounded, and
   returns only the requested valid nonce with the exact build provenance.
3. Prove nonce uniqueness, expiry, one-time binding, replay rejection, and
   release-request evidence lineage.
4. Prove Caddy removes spoofed upstream fence headers and emits its own
   canonical fence only for the active edge-selected target.
5. From an external public network, prove every configured public HTTPS address
   reaches the expected candidate, validates TLS, returns the requested nonce,
   and carries the expected edge fence before smoke runs.
6. Fault-inject stale cache, old candidate, wrong DNS/address, redirect,
   certificate failure, missing/mismatched fence, spoofed upstream fence, nonce
   replay, and one-address failure; each must deny smoke credit and preserve
   evidence.
7. Preserve hosted raw evidence and reviewed release records proving the exact
   candidate, address set, probe output, Caddy configuration provenance, smoke,
   recovery, and rollback results. Source tests or fabricated artifacts alone do
   not satisfy this acceptance gate.

## Implementation and documentation impact

- **Code / architecture:** Add the controlled build-provenance contract, dynamic
  public identity responder, nonce issuance/validation, controller probe logic,
  and Caddy strip/re-stamp configuration only as part of the DEC-0248 release
  authority.
- **Data / schema:** No ERP business-schema change. Release evidence may record
  bounded nonce/probe fields as operational evidence; it must not store secrets.
- **Workflow / permissions:** No application-user permission change. The release
  controller owns nonce issuance; Caddy owns public fence stamping.
- **UI / mobile:** None.
- **Reporting:** Operational release evidence must distinguish source checks,
  installed-host checks, and external public per-address checks; only the latter
  can satisfy this served-identity gate.
- **Knowledge base / training:** No user-facing knowledge-base, release-note, or
  training update is required. DevOps/operator runbooks must document the
  address inventory, probe execution, failure handling, and evidence retention
  before hosted rehearsal. Dunong handoff is not required.
- **Tests / UAT:** The seven acceptance checks above, plus DEC-0248 hosted
  cutover/recovery/rollback evidence, are production gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement immutable build provenance, dynamic nonce identity response, and controller verification under the DEC-0248 service | DevOps / Engineering | Before installed-host rehearsal | Source identity and probe foundation implemented; controller integration pending |
| Install and review shared-VPS Nginx plus Caddy strip/re-stamp configuration and controlled public-address inventory | DevOps / Security | Before external HTTPS probe | Source templates implemented; hosted install pending |
| Execute and retain external public HTTPS probes for every configured address before bounded smoke | DevOps / QA / Release | Each hosted candidate promotion | Pending hosted evidence |
| Reassess production GO/NO-GO with full source, installed-host, and public evidence | Security / QA / Release | After all DEC-0248 and DEC-0249 gates pass | Pending |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md`
- `docs/core/00-governance/decisions/DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`
- `docs/core/00-governance/decisions/DEC-0246-APPROVAL-BACKFILL-MAINTENANCE-AUTHORITY.md`
- `docs/core/00-governance/decisions/DEC-0247-APPROVAL-V1-PRODUCER-BARRIER-AND-CLOSED-WRITER-PERIMETER.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- Confirmed parent-led served-identity conclusion, 2026-07-28. Requested
  Code Spark and exact GPT-5.4 subagent models were unavailable; the closest
  permitted GPT-5.6 specialist fallback was used without relaxing hard gates.

## Supersession

This record supplements DEC-0248's authoritative served-SHA requirement with
the confirmed build-provenance, freshness, edge-fence, and per-address public
probe contract. It does not supersede DEC-0248. A later confirmed decision
record is required before weakening public-address coverage, changing Caddy's
edge-authority boundary, or accepting cached/static identity evidence.
