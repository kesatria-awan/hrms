# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tracky is a multi-tenant task management SaaS for SME companies. Each company gets an isolated workspace. Super Admins (Tracky staff) manage all tenants from a control plane.

**Core principles:** Clarity, safety, speed. Avoid unnecessary complexity.

## Commands

### Development
```bash
pnpm dev              # Start all dev servers (web: 5173, api: 8787)
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint all packages
```

### API (apps/api)
```bash
cd apps/api
pnpm dev              # Start Wrangler dev server
pnpm test             # Run Vitest with Cloudflare pool
pnpm test user        # Run single test file matching "user"
```

### Database (apps/api)
```bash
cd apps/api
pnpm db:generate           # Generate migration from schema changes
pnpm db:migrate:local      # Apply migrations locally
pnpm db:migrate:remote     # Apply migrations to production D1
```

### Web (apps/web)
```bash
cd apps/web
pnpm dev              # Start Vite dev server
pnpm build            # TypeScript check + Vite build
```

## Architecture

### Monorepo Structure
- `apps/api` - Hono API on Cloudflare Workers with D1 database
- `apps/web` - React SPA with TanStack Router/Query
- `packages/api-client` - Type-safe Hono RPC client

### API Layer
Routes use Hono OpenAPI with Zod schemas:
```
apps/api/src/routes/
├── index.ts           # registerRoutes() + router type export
├── index.route.ts     # Root endpoint
└── user/
    ├── user.index.ts    # Route registration
    ├── user.routes.ts   # OpenAPI route definitions
    └── user.handlers.ts # Route handlers
```

Type definitions in `apps/api/src/lib/types.ts`:
- `AppEnv` - Cloudflare bindings (DB, AUTH_SECRET, etc.)
- `AppOpenAPI` - Typed Hono app
- `AppRouteHandler<R>` - Handler type for route config

### Database
Drizzle ORM with SQLite/D1. Schema in `apps/api/src/db/schema/`. Migrations in `apps/api/src/db/migrations/`.

### Web Layer
- File-based routing: `apps/web/src/routes/` auto-generates route tree
- Import alias: `@tracky/web/*` maps to `apps/web/src/*`
- Providers configured in `__root.tsx` (QueryClientProvider wraps app)
- API proxy: `/api` routes proxy to `localhost:8787` in dev

### API Client
`packages/api-client` exports typed Hono RPC client. Import in web:
```typescript
import createClient from "@tracky/api-client"
const client = createClient("http://localhost:8787")
```

## User Roles
- **Super Admin** - Platform staff, access all workspaces
- **Workspace Admin** - Company admin for their workspace
- **Member** - Company employee

## Code Style Rules
- Never use `any` type in TypeScript. Always use proper types, `unknown`, or generics instead.
- If the type is truly unknown, use `unknown` and narrow it with type guards.
- Prefer explicit interfaces and type definitions over implicit typing.

## Development Workflow
- Follow Test-Driven Development (TDD) strictly: write tests before implementation
- Each feature starts with a failing test
- Follow red-green-refactor cycle