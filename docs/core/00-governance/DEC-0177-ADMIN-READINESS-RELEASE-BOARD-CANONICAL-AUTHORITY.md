# DEC-0177 — Administration Readiness Release Board Canonical Authority

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

The main Readiness register no longer renders a second Release Board decision
creation form. It provides a 44px **Open Release Board workspace** navigation
action instead. `/admin/readiness/release-board` remains the single canonical
decision composer and source of truth for GO/NO-GO decisions.

The main register retains filtered, paginated, selected-decision read-only
detail with company-scoped unavailable handling and preserved return context.

## Controls preserved

- Dedicated Release Board authorization, readiness eligibility, UTC and required
  field validation, append-only audit, and no-direct-gate-mutation behavior are
  unchanged.
- Removing the duplicate main-route action prevents competing decision
  authorities; it does not alter decision semantics or gate status directly.
- The inherited default requested subagent models were unavailable; the closest
  permitted GPT-5.6 architecture/product fallbacks were used and recorded.

Focused readiness tests, TypeScript, lint, production build, and diff checks are
required. PostgreSQL authorization/query-plan, responsive browser, hosted
recovery, and UAT execution evidence remain external gates.
