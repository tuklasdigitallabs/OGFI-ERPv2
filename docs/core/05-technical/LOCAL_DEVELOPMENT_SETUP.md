# OGFI ERP — Local Development Setup

**Status:** Bootstrap instruction  
**Audience:** Developer using VS Code and Docker on a local workstation

---

## 1. Local development goal

The local environment must match production architecture closely enough to validate workflow behavior without changing the live VPS.

Use local code + local containers for PostgreSQL and S3-compatible test storage. Redis is optional and only needed when a future approved worker/queue scope is active. Do not develop directly against the production database or production attachment store.

---

## 2. Required local tools

Install and verify:

- Git
- VS Code
- Node.js active LTS selected for the project
- `pnpm`
- Docker Desktop or Docker Engine with Docker Compose
- A modern Chromium-based browser plus Firefox for smoke testing

---

## 3. Local startup sequence after the application is scaffolded

```text
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Expected local services:

| Service | Typical local use |
|---|---|
| Web app | Modern SaaS ERP interface and initial API routes |
| PostgreSQL | Transactional ERP data |
| Redis | Future approved queue/cache backing service only; not required for current Phase I / Phase 1.5 no-queueing work |
| Worker | Future approved notifications, exports, and scheduled work only; not required for current Phase I / Phase 1.5 no-queueing work |
| MinIO | Test attachment storage |

---

## 4. Local data rules

- Use synthetic OGFI-like seed data only.
- Include sample company, brand, branch, warehouse, departments, roles, scopes, suppliers, items, PRs, POs, and stock movements.
- Do not put actual employee, supplier banking, salary, customer, or production inventory data into local development seeds.
- Resettable development data is acceptable; migration history is not disposable.

---

## 5. Minimum pre-push validation

Before pushing a feature branch:

```text
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm test:e2e` when the change affects a critical workflow, scope/permission rule, approval behavior, route protection, or inventory posting.
