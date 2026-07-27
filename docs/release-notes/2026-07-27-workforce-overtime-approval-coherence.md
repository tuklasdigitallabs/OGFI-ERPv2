# Workforce overtime approval coherence — July 27, 2026

Submitted overtime records linked to a governed approval graph can no longer
be approved through the legacy Workforce action while normalized approval
routing is disabled. The Workforce page explains that the Approval Inbox is the
authoritative destination when controlled routing is enabled.

This prevents a source record from being approved while its pending approval
graph remains active. Historical graphless compatibility records retain the
source-only path with scope, status, requester, and optimistic-concurrency
checks. Rejection and cancellation continue to use their documented reason,
scope, graph-termination, and audit controls.

This change does not enable normalized routing, grant new approval authority,
or complete Phase I production readiness.
