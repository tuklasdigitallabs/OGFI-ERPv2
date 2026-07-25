# DEC-0178 — Administration Readiness Release Board Date Filters

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Release Board history supports strict UTC `decidedFrom` and `decidedTo`
filters. Date windows are inclusive, reject malformed/reversed/over-366-day
ranges safely, and preserve search, decision, pagination, selected-detail, and
create-action return context. Counts and rows share the same server-owned
predicate and deterministic `decidedAt`, `createdAt`, `id` ordering.

## Controls and gates

Selected-company Core Administration Manage authorization remains before every
count/page/detail query. Decisions remain append-only and no gate status is
mutated by filtering or decision creation. Focused readiness tests, TypeScript,
lint, production build, and diff checks are required; PostgreSQL
authorization/query-plan, responsive browser, hosted recovery, and UAT remain
external gates. The requested Spark/GPT-5.4 models were unavailable; the
closest permitted GPT-5.6 fallbacks were used and recorded.
