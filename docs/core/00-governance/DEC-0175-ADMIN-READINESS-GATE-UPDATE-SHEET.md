# DEC-0175 — Administration Readiness Gate Update Sheet

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Readiness gate updates use one URL-selected workspace TaskSheet rather than a
long `EntryModal` in every gate row. The selected gate retains category, search,
status, page, and page-size context through success and validation-error
redirects. Stale, malformed, foreign, or unavailable gate keys show a safe
unavailable state and cannot authorize a write.

## Controls preserved

- `updateReleaseReadinessGate` remains the source of truth for selected-company
  Core Administration Manage authorization, transition validation, required
  evidence/decision-note/blocker rules, audit, and transactional re-read/CAS.
- The sheet does not mutate Release Board GO/NO-GO decisions directly.
- Status, target date, evidence reference, decision note, blocker summary, and
  update reason remain editable only through the existing server action.

## Deliberation and gates

Architecture and Product independently reviewed the next slice and challenged
the ordering. Both accepted the gate composer first because it is the remaining
repeated action that directly changes release state; Deployment and Enablement
capture-sheet parity is the immediate follow-up and remains a completion gate.
The requested Spark/GPT-5.4 models were unavailable; the closest permitted
GPT-5.6 fallback was used and recorded.

Focused page/service tests, TypeScript, lint, production build, and diff checks
must pass. PostgreSQL authorization/query-plan, responsive browser, hosted
recovery, and UAT execution evidence remain external gates.
