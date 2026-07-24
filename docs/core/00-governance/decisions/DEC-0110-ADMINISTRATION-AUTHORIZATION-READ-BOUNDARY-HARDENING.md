# DEC-0110 — Administration Authorization and Read-Boundary Hardening Before Role Pagination

## Metadata

- Decision ID: `DEC-0110`
- Title: Administration authorization and read-boundary hardening before role pagination
- Status: `Confirmed`
- Date: 2026-07-24
- Decision owner: Product / Engineering / Security
- Decision Chair: Parent implementation agent
- Related phase/module: Phase I / Core Administration / Roles and organization reads
- Related decision brief: Parent-confirmed Administration authorization/read-boundary slice (2026-07-24)

## Decision

Harden the Administration authorization and read boundaries first, including the Role Library's server-enforced, non-enumerating read posture and explicit denied/error/empty states, before adding further role or organization pagination. The implemented checkpoint also requires tenant-role authority for company creation, requires current-company `MANAGE` for the Administration overview, filters organization reads to the selected company plus documented tenant-wide rules, preflights selected-company membership for user detail, and redacts cross-company scopes. Preserve `DEC-0043`: `core.tenant_role_administer` is the authority for tenant-role catalog and assignment administration; UI visibility or selected-company context alone must not authorize role reads or mutations.

Role and organization pagination is deferred until each surface has an independently reviewed query/projection contract, scope predicate, detail boundary, and visible-surface test evidence. The Users pagination pilot in `DEC-0108` remains the only confirmed Administration pagination slice.

## Context

The Administration workspace has a proven Users pagination pilot, but role, organization, audit, request/permission, and detail surfaces still have unbounded or hard-capped reads and inconsistent page-level denial behavior. The implemented hardening closes the principal authorization/read-boundary gaps: company creation is tenant-role-authorized; the overview is current-company `MANAGE`-gated; organization projections honor selected-company and tenant-wide rules; user detail checks selected-company membership before reading and does not disclose cross-company scopes. The Role Library remains especially sensitive: permission summaries can disclose tenant-global authority and may be mistaken for a capability token if the browser or route is treated as the security boundary. An independent role-library review and security review therefore required these safeguards before expanding pagination.

## Options considered

### Option A — selected: authorization/read-boundary hardening first

- Summary: Apply the existing tenant-role permission at every Role Library overview/detail read, return a truthful non-enumerating denied state before privileged queries, use explicit field projections, and define safe role-summary semantics. Keep pagination deferred until its contract is reviewed.
- Benefits: Closes the highest-risk disclosure and direct-URL gaps, preserves the tenant-global role boundary, and creates reusable evidence for later bounded pagination.
- Failure modes: A caller could add a new role read without the shared guard; summaries could expose sensitive permission names or imply assignability; count and row predicates could diverge when pagination is later introduced.
- Why selected: It addresses the independent security findings without widening authority or coupling several Administration surfaces into one release.

### Option B — rejected: paginate roles and organization together now

- Summary: Add server pagination for Role Library, organization, and related detail surfaces in one broad cutover.
- Benefits: Faster visual uniformity and fewer interim states.
- Failure modes: Distinct tenant/company/scope predicates and sensitive projections would be reviewed together under a larger regression surface; a page-level guard could be mistaken for service authorization; incomplete tabs could appear complete.
- Why selected or rejected: Rejected because the authorization/read contract is not yet independently evidenced for each surface.

### Option C / defer — selected as fallback: leave role pagination unchanged

- Summary: Do not expose new role pagination controls; retain the current role read only behind the existing service guard while documenting the surface as pending.
- Benefits: No new disclosure or query-cost risk is introduced while the hardening slice is implemented and tested.
- Failure modes: Existing unbounded reads and any misleading denial/empty state remain until the hardening work lands.
- Why selected or rejected: Selected as the safe delivery fallback for pagination, not as acceptance of the current UX or read contract.

## Hard-gate assessment

- **Tenant and scope isolation:** Role catalog reads remain tenant-qualified. Target-user eligibility rules from `DEC-0043` continue to require active/effective selected-company membership for target-user actions; role assignments remain tenant-global.
- **Server-enforced authorization:** Every Role Library overview/detail and related role-permission read must enforce `core.tenant_role_administer` in the service/data-access layer. Page guards are additive UX and query-cost protection only.
- **Administration read boundaries:** Company creation requires tenant-role authority; the overview requires current-company `MANAGE`; organization reads are filtered to the selected company and permitted tenant-wide records; user detail requires selected-company membership before reading and redacts cross-company scopes.
- **Non-enumerating denial:** Missing authority returns a safe denied state without role names, permission names, counts, or existence clues.
- **Sensitive-authority boundary:** Permission summaries are read-only and never grant, imply, or mint capability. Sensitive/admin/approver roles retain controlled request/review, MFA, segregation, audit, epoch, and session-invalidation safeguards.
- **Phase and recovery:** This is a read-boundary hardening slice. It introduces no role, scope, organization, approval, money, or inventory mutation and can be rolled back without data migration. Pagination remains separately gated.

## Required safeguards

- Centralize and reuse the service authorization guard for company creation, Administration overview, Role Library overview/detail, permission summary, user detail, and any direct-link/API entrypoint; reauthorize each mutation or linked source independently.
- Run permission preflight before privileged role queries and return a truthful denied state that does not enumerate tenant data. Distinguish denied, empty, loading, and error states.
- Use explicit allowlisted projections. Do not expose credentials, internal policy metadata, hidden tenant identifiers, unrestricted user assignments, or sensitive permission detail beyond the approved summary contract.
- Keep role assignment semantics tenant-global; selected-company membership is an eligibility check, never a company-bound role grant.
- Treat role-page URLs, serialized IDs, counts, and cached/browser data as untrusted input; validate identifiers and prevent cross-tenant or inactive-role leakage.
- Add tests for missing permission/no-query denial, cross-tenant and revoked-scope access, direct URL/API access, projection redaction, stable empty/error behavior, and no mutation on failed authorization.
- Before role or organization pagination, independently approve page size/limits, shared count-row predicates, deterministic ordering, URL state, detail authorization, export behavior, and responsive visible-surface evidence.
- If any required evidence is incomplete, retain the current authorized read or disable the new surface; do not substitute client-side slicing or a larger unbounded read.

## Implementation and documentation impact

- Code / architecture: The checkpoint hardens company-create authorization, current-company overview gating, organization projections, and user-detail preflight/redaction, alongside Role Library read services and route/page preflight using existing authorization patterns. No schema, permission, or role-engine change is authorized by this record.
- Data / schema: None. Role assignments remain tenant-global under `DEC-0043`.
- Workflow / permissions: No permission is added or removed. Existing sensitive-role request/review, no-self-action, MFA, audit, privilege-epoch, and session-invalidation controls remain mandatory.
- UI / mobile: Provide an explicit restricted state and truthful loading/empty/error states; do not show pagination controls for roles/organization until their contracts are confirmed. Role Library remains read-only where stated.
- Reporting: No export or report change. Any role export requires a separate bounded, authorized decision.
- Knowledge base / training: Dunong handoff is required once labels, permission-summary wording, and denied-state copy are implemented; user guidance must not imply that viewing a role grants authority.
- Tests / UAT: Verify service and direct-route denial, no sensitive-data enumeration, cross-tenant isolation, role-summary redaction, and desktop/tablet/mobile states before the next pagination decision.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Preserve and regression-test company-create, overview, organization, and user-detail authorization/read boundaries | Engineering + Security + QA | Before role pagination work | Implemented checkpoint; regression evidence pending |
| Implement shared Role Library read guard, projection, and denied-state contract | Engineering + Security | Before role pagination work | Pending |
| Add independent role-library and security regression tests, including direct URL/API negatives | QA + Security | Before UAT | Pending |
| Reassess organization, audit, request/permission, and role pagination as separate contracts | Decision Chair + Product | After hardening evidence | Deferred |
| Assess permission-summary and denied-state guidance for users | Dunong | After verified UI behavior | Handoff required |

## Evidence

- Parent Decision Chair confirmation dated 2026-07-24: authorization/read-boundary hardening is the next Administration slice; role and organization pagination are deferred.
- Independent role-library review (2026-07-24): role overview/detail and permission-summary reads must remain server-authorized, read-only, explicitly projected, and non-enumerating on denial; role-page visibility must not imply assignment authority.
- Independent Security review (2026-07-24): identified the page-level denial/read-boundary gap, direct URL/API disclosure risk, unbounded role reads, and tenant-global versus selected-company scope confusion; required shared service guards, no-query denial, redacted projections, and negative tests.
- Implemented Administration hardening checkpoint (2026-07-24): company creation now requires tenant-role authority; overview access requires current-company `MANAGE`; organization reads are constrained to selected-company and documented tenant-wide records; user detail preflights selected-company membership and redacts cross-company scopes.
- `DEC-0043-TENANT-ROLE-ADMINISTRATION-BOUNDARY.md` — authoritative tenant-role administration permission and target-company eligibility boundary.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md` and `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` — role-library, sensitive-role, audit, MFA, and session invalidation controls.
- `docs/phases/phase-01-procurement-inventory/specs/users-roles-ui-spec.md` — Role Library and role-detail screen requirements and `DEC-0108` pagination boundary.
- `DEC-0108-USERS-REGISTRY-PAGINATION-PILOT.md` — Users-only pagination pilot and explicit deferral of role/organization/detail pagination.
- Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing any hard gate or safeguard.

## Supersession

This decision does not supersede `DEC-0043` or `DEC-0108`. It sequences and constrains the next Administration slice. A later role or organization pagination decision must preserve this read boundary and provide its own reviewed contract and evidence.
