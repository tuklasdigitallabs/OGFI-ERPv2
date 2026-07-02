# OGFI ERP — Repository Bootstrap

**Purpose:** Establish the initial repository layout before application scaffolding.

---

## 1. Target repository structure

```text
ogfi-erp/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .env.example
├── .gitignore
├── .nvmrc
├── docker-compose.example.yml
│
├── apps/
│   ├── web/                         # Next.js web app + initial API surface
│   │   └── AGENTS.md
│   └── worker/                      # Future approved background worker; not part of current no-queueing release
│       └── AGENTS.md
│
├── packages/
│   ├── database/                    # Prisma schema, migrations, DB client, seed tools
│   │   └── AGENTS.md
│   ├── ui/                          # Created when reusable component patterns stabilize
│   ├── config/                      # Shared lint, TypeScript, testing config
│   └── types/                       # Shared cross-app TypeScript contracts, only when justified
│
├── docs/                            # Canonical ERP specifications
│   └── AGENTS.md
│
├── infra/
│   ├── caddy/
│   │   └── Caddyfile.example
│   └── docker/
│       ├── Dockerfile.web.example
│       └── Dockerfile.worker.example
│
├── scripts/                         # Safe development, seed, backup, and release helpers
└── tests/                           # Cross-module / end-to-end test assets when justified
```

---

## 2. Initial scaffold sequence

1. Create the Git repository and add this documentation package.
2. Add root `AGENTS.md` and verify Codex reads it before edits.
3. Initialize `pnpm` workspace and pin the selected Node.js LTS runtime.
4. Scaffold `apps/web` with Next.js, TypeScript, App Router, ESLint, and Tailwind CSS.
5. Add `packages/database` with PostgreSQL connection, Prisma schema, migration tooling, and test seed tooling.
6. Add Docker Compose services for PostgreSQL, MinIO or equivalent object storage, and web. Redis and worker services are future-approved capabilities only.
7. Add health endpoints, environment validation, linting, type checks, unit-test tooling, and E2E test baseline.
8. Build Core Administration before Purchase Requests or Inventory.

---

## 3. Mandatory first implementation milestone

The first end-to-end milestone is:

> An authorized user can sign in, see only their assigned scope, select a valid branch or warehouse context, create a Purchase Request, submit it, and view an auditable approval timeline.

Do not build Purchase Order, receiving, transfers, or inventory posting before this foundation works.

---

## 4. Required scripts

The scaffold must provide these standard commands at the root or equivalent workspace commands:

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm docker:up
pnpm docker:down
```

Scripts may delegate to workspace packages, but names must remain predictable so developers and coding agents can validate work consistently.

---

## 5. Repository rules

- Use one canonical documentation tree under `docs/`.
- Never commit generated build output, local databases, backups, `.env` files, or attachments.
- Keep app code separate from infrastructure and documentation.
- Add a nested `AGENTS.md` only where folder-specific constraints materially differ from root rules.
- Do not create a separate API app unless the modular monolith’s route handlers and service layer become a proven constraint.
- Keep shared packages small and justified; do not over-abstract early.
