# DEC-0250 — Nginx Single-Hop Shared-VPS Public Edge

## Metadata

- Decision ID: `DEC-0250`
- Title: Nginx Single-Hop Shared-VPS Public Edge
- Status: `Confirmed — source preview only; hosted cutover and release evidence pending; production NO-GO`
- Date: 2026-07-28
- Decision owner: Shared Production Foundation / Hostinger deployment
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations; public-edge and authentication trust boundary
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0040`, `DEC-0044`, `DEC-0050`, `DEC-0248`, `DEC-0249`
- Related decision brief: Confirmed parent-led Nginx single-hop shared-VPS deliberation, including Security, Architecture, and QA review

## Decision

For the shared VPS, host Nginx is the sole public TLS edge for one exact,
approved OGFI hostname. Its reviewed server block proxies only to the
loopback-only Caddy publication; the OGFI web/backend service has no direct
public host port and no alternate public upstream.

The Nginx cutover configuration and its nonblocking deployment fence are
root-owned operational controls. Nginx must replace, rather than forward or
trust, client-supplied `Forwarded`, `X-Real-IP`, and `X-Forwarded-For` values
with the direct public peer information. Caddy must trust only the exact
reviewed Nginx-to-Caddy CIDR, remove inbound forwarding headers at the
application hop, and set one authoritative `X-Forwarded-For` value. This is a
strict single-hop trust contract, not a forwarded-chain trust model.

The current source preview is not an installed-host proof, not an executable
release procedure, and not release-ready. Production remains **NO-GO** until
the DEC-0248 controlled release service, root-owned cutover fragment/fence,
installed Nginx/Caddy configuration, isolation checks, and external public
evidence all pass.

## Context

The shared VPS serves other sites. OGFI therefore needs a narrowly scoped
public edge that cannot become a default route, capture unrelated hosts, or
permit a direct path around application authentication and source-based rate
limits. The existing application trust mode assumes exactly one reviewed proxy
hop. Client-controlled forwarding headers, broad trusted ranges, public backend
ports, or a second proxy would break the meaning of the client address used by
authentication controls.

The Security, Architecture, and QA deliberation confirmed that source templates
are useful foundation evidence only. They cannot establish that the live shared
host owns the exact hostname, keeps existing virtual hosts unchanged, binds
Caddy only to loopback, or prevents a parallel/direct backend exposure. The
review used the permitted GPT-5.6 specialist fallback after the requested
specialist-model route was unavailable; hard gates were not relaxed.

## Options considered

### Option A — selected: exact-host Nginx edge, loopback-only Caddy, one trusted hop

- Summary: Add one root-controlled Nginx server block for the exact OGFI host;
  terminate public TLS there; proxy only to `127.0.0.1` Caddy; replace
  forwarding headers; and permit Caddy to trust only the reviewed bridge CIDR.
- Benefits: Preserves shared-host isolation, provides one auditable public edge,
  prevents client header spoofing, and keeps the backend unreachable directly.
- Failure modes: A wrong host/certificate, broad server block, stale or
  unreviewed fragment, incorrect trusted CIDR, public Caddy/backend binding, or
  failed cutover can misroute traffic or undermine source attribution.
- Why selected: It is the only current-VPS option that meets exact-host,
  single-hop, isolation, least-privilege, and release-evidence hard gates.

### Option B — rejected: public Caddy or application/backend publication

- Summary: Publish Caddy or the web service directly on a public interface,
  with Nginx absent or optional.
- Benefits: Fewer apparent host layers.
- Failure modes: Creates a route that can bypass the approved public edge,
  makes shared-host ownership ambiguous, and permits proxy/header trust drift.
- Why rejected: It fails direct-backend prohibition and invalidates the
  reviewed single-hop boundary.

### Option C — rejected: wildcard/default/catch-all Nginx route or forwarded chain

- Summary: Use a `default_server`, wildcard/catch-all host rule, broad trusted
  private ranges, or preserve/appended forwarding chains.
- Benefits: Reduces per-host configuration effort.
- Failure modes: Can capture other VPS sites, accept spoofed client identity,
  and make routing and authentication attribution non-deterministic.
- Why rejected: It fails exact-host isolation and trusted-header replacement
  controls.

### Option D — rejected: deploy-user managed live cutover without root-owned fence

- Summary: Let a deploy user edit/activate the host edge independently of the
  controlled release lifecycle.
- Benefits: Simple operator access.
- Failure modes: Allows concurrent or partial cutovers, fragment substitution,
  incomplete rollback evidence, and release state that the DEC-0248 controller
  cannot prove or recover.
- Why rejected: It fails controlled-authority, serialization, and recovery
  gates. The root-owned cutover fragment/fence is required.

## Hard-gate assessment

- **Host and tenant isolation:** Nginx owns only the exact approved OGFI
  hostname. No default server, wildcard, catch-all, or modification of existing
  sites is permitted.
- **Server-enforced authentication boundary:** Nginx replaces inbound forwarding
  headers. Caddy trusts only the exact reviewed upstream CIDR, strips the
  forwarded inputs before the application hop, and emits one authoritative
  client-address value. Browser/UI behavior is not a security boundary.
- **Direct-backend isolation:** The OGFI web service exposes no public host
  port; Caddy is host-published only through loopback; Nginx is the sole public
  upstream route.
- **Controlled release authority and recovery:** The active cutover fragment and
  nonblocking fence are root-owned and must be operated by the DEC-0248 release
  service. A failed or ambiguous cutover fails closed and follows its durable
  journal/recovery path.
- **Audit and exact-candidate evidence:** Installed `nginx -t`, reviewed
  `nginx -T`, loopback port inspection, and every-address external HTTPS
  identity/fence probe are required. Source checks alone do not satisfy this
  gate.
- **Topology boundary:** A CDN, second proxy, public Caddy/backend port,
  wildcard Nginx route, alternate public upstream, or changed trusted CIDR is a
  release blocker pending a new confirmed security/architecture decision.

## Required safeguards

- Render and install only a root-owned Nginx include/fragment for the approved
  exact hostname, certificate paths, and loopback Caddy port. Keep permissions
  and parent include ownership such that the deploy user cannot substitute it.
- Acquire the DEC-0248 root-owned nonblocking release fence before staging,
  testing, enabling, reloading, rolling back, or removing the edge fragment;
  do not permit independent cutover commands.
- Reject `default_server`, `server_name _`, wildcards, broad catch-alls, a
  second public upstream, or a public web/backend/Caddy binding.
- Set `Forwarded` to empty and set `X-Real-IP` and `X-Forwarded-For` from
  Nginx's direct peer (`$remote_addr`); do not append, preserve, or trust
  client-provided forwarding values.
- Configure Caddy with only the exact reviewed
  `OGFI_EDGE_TRUSTED_PROXY_CIDR`, strict trusted-proxy interpretation, and
  header replacement before the application hop. Do not use `private_ranges` or
  unbounded proxy trust.
- Preserve the DEC-0249 edge-fence and public identity contract: upstream fence
  values cannot be authoritative, and every controlled public address must
  demonstrate expected candidate provenance, nonce, TLS, and edge fence before
  smoke receives credit.
- Fail closed to the predecessor or maintenance/withdrawn traffic when fragment
  validation, reload, port isolation, hostname/certificate validation, or any
  public probe is missing or fails. Retain durable release evidence.

## Required tests and acceptance evidence

1. Verify the rendered fragment has exactly the approved host, no default or
   wildcard/catch-all listener, and only the loopback Caddy upstream.
2. Under the release fence, run and retain successful `nginx -t` and reviewed
   `nginx -T` output proving existing site blocks are unchanged and the active
   OGFI fragment is exact.
3. Inspect live listeners and container/network publication to prove that Nginx
   is the only public OGFI entry point and that Caddy/backend ports are
   loopback-only or private as approved.
4. Send spoofed `Forwarded`, `X-Real-IP`, and `X-Forwarded-For` values through
   the public edge and prove they cannot reach the application as trusted
   client identity; prove Caddy accepts only the reviewed Nginx/Caddy source.
5. Prove the root-owned cutover fragment and fence reject deploy-user direct
   modification/activation and serialize reload, rollback, and recovery with
   the DEC-0248 release service.
6. From an external public network, probe every configured approved address;
   validate TLS, exact served identity/nonce, and the edge fence. Any address
   mismatch, redirect ambiguity, stale route, or missing proof fails the
   release.
7. Fault-inject invalid Nginx configuration, wrong hostname/certificate,
   public backend exposure, wrong trusted CIDR, and interrupted cutover. Each
   case must fail closed, preserve predecessor or maintenance state, and retain
   journal/evidence lineage.

## Implementation and documentation impact

- **Code / architecture:** The Nginx template and Caddy/Compose topology are
  source foundations for the selected edge. No ERP business code, schema, or
  workflow behavior changes under this decision.
- **Data / schema:** No change.
- **Workflow / permissions:** Host deployment authority is root-owned under
  DEC-0248; application-user permissions do not change.
- **UI / mobile:** No change.
- **Reporting:** Release evidence must distinguish source contract checks,
  installed-host verification, and external public probes. Only installed-host
  and external evidence can satisfy release acceptance.
- **Knowledge base / training:** No end-user documentation change. DevOps
  operator runbooks require controlled-host cutover and recovery instructions;
  Dunong handoff is not required.
- **Tests / UAT:** The seven acceptance checks above and all applicable
  DEC-0248/DEC-0249 gates are release prerequisites.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the DEC-0248 root-owned release service, cutover fragment activation, fence, journal, recovery, and rollback path | DevOps / Engineering | Before any hosted release rehearsal | Pending |
| Render and install the reviewed exact-host Nginx fragment without changing other VPS sites | DevOps / Security | During controlled hosted rehearsal | Pending |
| Capture configuration, listener-isolation, trusted-header, and external-address probe evidence | Security / Architecture / QA | Before smoke or promotion | Pending |
| Reassess production GO/NO-GO with complete hosted evidence | Security / QA / Release | After all listed gates pass | Pending; current preview is not release ready |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/05-technical/DEPLOYMENT_AND_ENVIRONMENT.md`
- `docs/core/05-technical/VPS_DEPLOYMENT_BOOTSTRAP.md`
- `infra/nginx/README.md`
- `infra/nginx/ogfi-shared-vps.conf.example`
- `infra/caddy/Caddyfile.example`
- `infra/hostinger/evidence/compose.production.yaml`
- `scripts/shared-vps-edge-contract.test.mjs`
- Completed Security, Architecture, and QA deliberation; user-approved shared-VPS Nginx single-hop conclusion, 2026-07-28. The requested specialist-model route was unavailable; permitted GPT-5.6 specialist fallback was used without relaxing hard gates.

## Supersession

This record supplements DEC-0248's controlled deployment authority and
DEC-0249's served-identity/public-probe contract with the confirmed shared-VPS
Nginx exact-host, one-hop trust, header-replacement, direct-backend isolation,
and root-owned cutover controls. It does not supersede either record. A later
confirmed decision record is required before changing the public-edge topology
or trust boundary.
