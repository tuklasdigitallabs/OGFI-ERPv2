# Audit Event detail safeguards

Audit Event detail now uses an explicit tenant-safe projection and rejects malformed event IDs without a database lookup. Sensitive nested values remain redacted, while depth, node, and serialized-byte budgets prevent oversized payloads from overwhelming the detail view.

When a budget is reached, the page says the payload is only partially shown and that the immutable event was not changed. Timestamps use the event company timezone and JSON panels remain contained and scrollable.

Disposable PostgreSQL isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain required.
