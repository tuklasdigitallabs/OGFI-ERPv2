# DEC-0163 — Administration User Access tab isolation

Date: 2026-07-25  Status: Controlled implementation checkpoint

The User Access detail now renders the visible sections as mutually exclusive URL-backed workspaces: `Overview`, `Roles`, `Scopes`, `Requests`, and `Audit`. Overview presents the identity/status, assigned-role summary, and effective permissions; Roles presents the bounded assigned-role register; Scopes presents the bounded scope register and scope composer; Requests and Audit retain their dedicated contracts from DEC-0161 and DEC-0162. The selected company and target-user context remains visible in the page header and section navigation.

This is an additive presentation boundary. Existing role, scope, request, audit, authorization, mutation, and redaction services remain unchanged except for the already documented Audit wrapper. Full removal of non-active-section server reads, responsive browser evidence, PostgreSQL query plans, hosted recovery, and UAT remain open.

Evidence: Core Admin tests 34/34, web TypeScript, lint, production build, and diff checks pass. Administration and Phase I are not complete.
