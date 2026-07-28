# DEC-0249 — Served Release Identity Gate

## Metadata

- Decision ID: `DEC-0249`
- Status: `Confirmed; implementation pending; production NO-GO`
- Date: 2026-07-28
- Decision owner: Shared Production Foundation / Hostinger deployment
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations
- Related decision: `DEC-0248`

## Decision

Before ordinary smoke can receive release credit, the public HTTPS route must
return a dynamic, no-store identity from immutable application provenance and a
Caddy-stamped controller fence. The controller must verify the response against
the admitted candidate through every approved public address. Status-only,
localhost, direct-web, host-inspection, or mutable-environment identity checks
cannot satisfy this gate.

## Required safeguards

- Embed full commit SHA, artifact digest, and web image provenance in the signed
  immutable artifact; never source it from runtime environment variables.
- Require a bounded controller nonce echoed by the public identity response.
- Caddy removes upstream fence headers and stamps the candidate-bound fence.
- Reject redirects, cache evidence, missing/duplicate/mismatched identity,
  predecessor responses, and incomplete approved address coverage.
- Keep traffic in maintenance and recover under the DEC-0248 fence until the
  served identity is verified. Repeat after rollback.

## Evidence and status

Security and DevOps independent review selected this combined public-path gate.
Requested Spark/GPT-5.4 reviewers were unavailable; GPT-5.6 fallbacks were used
without relaxing controls. No identity endpoint, controller helper, host install,
or external probe exists yet; production remains NO-GO.
