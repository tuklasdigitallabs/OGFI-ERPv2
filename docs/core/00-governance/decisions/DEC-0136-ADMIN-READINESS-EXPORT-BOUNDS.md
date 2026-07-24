# DEC-0136 — Administration Readiness export bounds

**Date:** 2026-07-24  
**Status:** Implemented bounded synchronous export

Release Readiness CSV and SHA-256 exports now require strict UTC `from` and `to`
date-only parameters. The default UI link supplies the last 31 UTC calendar days.
The shared reporting policy controls the maximum inclusive date span and maximum
evidence/decision rows; invalid or reversed ranges return stable 400 errors and
over-limit requests return 413 without CSV bytes. Queries count each evidence
category before fetching, then use scoped date predicates, deterministic ordering,
bounded projections, and a maximum take. Gate metadata and the security snapshot
remain bounded separately.

The export route and service require Core Administration plus selected-company
Manage scope before logging or querying. Export audit start/failure/completion
events remain preserved. Asynchronous private-artifact delivery remains deferred
until queue, storage, expiry, permission recheck, and recovery controls exist.

Focused export/readiness tests, typecheck, lint, and diff checks pass. Database
volume/query-plan, browser, hosted recovery, and UAT evidence remain open. GPT-5.6
fallback review was used because the requested Spark/GPT-5.4 models were unavailable.
