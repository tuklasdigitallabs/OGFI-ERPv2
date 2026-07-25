# DEC-0188 — Reopen SPF-004 for exact-candidate authorization evidence

## Decision

Reopen SPF-004 for the current release candidate. The prior closure remains
valid as historical evidence for exact SHA `60690ddd41c12fa31dbdeb3fdec6ebfc8a90f170`,
but it cannot cover later protected API classifications, lookup-route behavior,
or the newly bound Administration and Readiness reader surfaces.

Current status is **Reopened — exact-candidate revalidation pending**.

## Required revalidation

- Run the regenerated authorization manifest and clean-worktree checksum on the
  current candidate.
- Execute disposable PostgreSQL permission revocation, tenant/company isolation,
  selected-company Manage, target-user audit scope/redaction, lookup-route
  denial/no-disclosure, and Readiness-reader no-mutation cases.
- Produce exact-SHA hosted build, database authorization, manifest, and accepted
  development-fixture browser evidence. Production-mode `next start` E2E remains
  assigned to SPF-001/SPF-009 and is not substituted by this gate.

No route or service is considered production-authorized from structural registry
entries alone.

