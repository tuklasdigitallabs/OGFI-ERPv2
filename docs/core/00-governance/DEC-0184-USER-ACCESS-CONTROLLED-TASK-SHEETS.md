# DEC-0184 — User Access Controlled TaskSheets

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Evidence-heavy controlled Scope Request, controlled Role Request, and selected
request review flows in User Access use the shared `TaskSheet` with contained
scrolling and 44px controls. The sheet identifies the target user, selected
company, requester/status, evidence context, and next action. Stale or foreign
selections remain unavailable and read-only.

## Controls

- Existing server actions remain authoritative for tenant/company/target-user
  scope, no self-approval, MFA, segregation of duties, pending-only CAS,
  reason/evidence validation, audit, and rollback-on-denial behavior.
- Request creation and review preserve the section, request kind, status,
  page, selected ID, and safe return path through success and error redirects.
- Short assignment/deactivation controls remain separate; this decision does
  not expand into unrelated Administration routes.

## Deliberation and gates

Product and Architecture independently identified the evidence-heavy modal
finding. The requested Spark/GPT-5.4 models were unavailable; the closest
permitted GPT-5.6 fallbacks were used and recorded. Core Admin focused tests,
TypeScript, lint, production build, and diff checks pass. PostgreSQL
authorization/query-plan, responsive browser, hosted recovery, and UAT remain
open.
