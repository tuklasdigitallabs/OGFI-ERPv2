# DEC-0125 — Administration Policy Settings Pagination

## Metadata

- Decision ID: `DEC-0125`
- Status: Confirmed (bounded registry checkpoint)
- Date: 2026-07-24
- Decision owner: Core Administration / Controls
- Decision Chair: Parent agent
- Related phase/module: Phase I — Configurable Policy Settings

## Decision

Admin Settings uses a server-owned category/search/page contract over the allowlisted DEC-0036 policy catalog. The page returns bounded items, exact matching totals, category counts, and global override/default totals; existing typed Configure and Use Recommended actions remain server-authorized and audited.

## Context and safeguards

The route had begun loading all policy definitions and filtering them in the browser. The catalog is finite and code-owned, so this reversible checkpoint keeps catalog hydration server-side, never sends the full registry to the browser, and adds URL-backed search and pagination. Policy semantics, update/reset transactions, source decisions, and audit history are unchanged.

The selected-company Core Admin plus company `MANAGE` guard runs before policy reads. Edit, import, bulk mutation, and lifecycle changes remain out of scope; a future drawer/detail contract is still a UX hardening follow-up for the High workspace-audit finding.

## Evidence

- `apps/web/src/server/services/policySettings.ts`
- `apps/web/src/app/(app)/admin/settings/page.tsx`
- `apps/web/src/server/services/policySettings.test.ts`
- `docs/knowledge-base/administration/configuring-policy-defaults.md`
- Independent architecture and UX reviews; GPT-5.6 fallback subagents used because Code Spark and GPT-5.4 were unavailable.
