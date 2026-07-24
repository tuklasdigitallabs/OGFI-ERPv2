# DEC-0129 — Administration UAT Selected Review Actions

## Decision

UAT evidence rows are read-only list records. Verification and rejection actions are available only from the selected evidence detail panel, with the existing server-side management authorization, creator self-review block, `RECORDED`-only compare-and-set transition, reason capture, and immutable audit event.

The UAT filter namespace is independent from gate pagination (`uatQ`, evidence type/result/status/workflow/environment, `uatPage`, and `uatPageSize`) so changing evidence pages cannot change gate rows or counts.

## Hard gates and safeguards

Foreign or malformed selected IDs render a generic unavailable state. Verified and rejected evidence is read-only. A creator sees an explicit “another reviewer required” state. Accepted transitions claim only a still-`RECORDED` row before writing the audit event; retries fail closed.

## Model note

Independent architecture and product deliberation selected this master-detail action boundary. GPT-5.3-Codex-Spark and GPT-5.4 were unavailable; GPT-5.6 fallback specialists were used and reconciled by the Decision Chair.
