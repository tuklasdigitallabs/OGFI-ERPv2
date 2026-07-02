# Local Development

This scaffold is the minimum runnable Phase I Core Administration foundation. It supports local sign-in with configured placeholder context, authorized Company / Brand / Location context selection, scoped Purchase Request draft creation, submission for approval, approval action, basic approved-PR supplier quote capture, supplier recommendation recording and approval, Core Admin inspection, location scope assignment and deactivation, constrained supplier/item master-data setup, supplier-item links, and audit history display.

## Prerequisites

- Node.js pinned by `.nvmrc`
- pnpm via Corepack
- Docker Engine or Docker Desktop

## Setup

```text
corepack enable
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000/sign-in`.

## Demo Personas

- Requester: creates draft Purchase Requests and submits them for approval.
- Approver: reviews pending Purchase Requests for assigned approval scope.
- Admin: opens Core Administration, inspects access, switches authorized location context, assigns/deactivates location scopes for other users, manages initial supplier/item master records and supplier-item links, records supplier quotes for approved Purchase Requests, reviews lowest recorded quote cost, records supplier recommendations with required justifications, submits recommendations for approval, exports quote data, and reviews audit events.

Role assignment is writable only for the constrained non-sensitive path approved in `DEC-0002`; sensitive/admin/approver role grants remain blocked pending policy.

## Checks

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

Playwright starts its own Next.js test server on `http://127.0.0.1:3100` so browser tests do not depend on an already-running local server at `http://localhost:3000`.

## Current Scope

Working:

- Local scaffold sign-in
- Configured Company / Brand / Location context display and guarded location switching
- Core Administration overview and drilldowns for users, roles, permissions, company, location, approval rule, and audit event detail
- Audited location scope assignment and deactivation for non-self users
- Supplier master-data list plus audited supplier creation/deactivation and supplier-item link/deactivation for the selected company
- Item category, UOM, item, and UOM conversion foundation for the selected company, including audited item deactivation
- Draft Purchase Request creation
- Purchase Request search, status filters, and scoped CSV export
- Submit for approval state change
- Scoped Purchase Request comments with audit event creation
- Approval inbox and approval action with self-approval guard and acted-by snapshot
- Purchase Request approval action history on request detail
- Approved Purchase Request supplier quote capture with audit event creation, lowest recorded cost highlighting, and scoped CSV export
- Supplier recommendation recording and approval for quoted approved Purchase Requests with selected-quote lineage, evaluated-total snapshot, single-source justification, non-lowest justification guard, approval inbox routing, self-approval guard, and audit event creation
- Audit event timeline for create, submit, approve, return, reopen, cancel, comment, and admin scope changes
- Web health endpoint at `/api/health`
- Worker health foundation
- Prisma schema and initial migration structure

Deferred:

- Purchase Orders
- Quote attachments and quote-to-PO conversion
- Receiving
- Inventory posting and ledger movements
- Transfers
- Wastage, counts, adjustments
- Dashboards and reports
- External email/object-storage integrations beyond configuration boundaries
- Production deployment
