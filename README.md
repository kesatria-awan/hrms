# Tracky

A modern task management SaaS designed for SME companies to manage tasks with enterprise-grade isolation and consumer-grade simplicity.

## Overview

Tracky provides each SME company with a private workspace for task management, combining:
- **Enterprise-grade isolation** - Secure multi-tenant architecture
- **Consumer-grade simplicity** - Intuitive, fast, and clear UX
- **Platform control** - Super Admin dashboard for Tracky staff to manage all tenants

### Core Principles
- **Clarity** - Simple, intuitive interfaces
- **Safety** - Secure tenant isolation and data protection
- **Speed** - Fast, responsive user experience
- No unnecessary complexity

## Tech Stack

### Frontend (apps/web)
- **React** - UI library
- **TanStack Router** - Type-safe routing with file-based routing
- **TanStack Query** - Server state management
- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - UI component library
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety

### Backend (apps/api)
- **Hono** - Lightweight web framework for Cloudflare Workers
- **Drizzle ORM** - Type-safe ORM for database operations
- **Cloudflare D1** - Serverless SQL database (multi-tenant)
- **OpenAPI** - API documentation with Scalar
- **Vitest** - Testing framework
- **TypeScript** - Type safety

### Tooling
- **PNPM** - Fast, disk space efficient package manager
- **Monorepo** - PNPM workspaces for managing multiple packages
- **ESLint** - Code linting
- **Wrangler** - Cloudflare Workers CLI

## Project Structure

```
tracky/
├── apps/
│   ├── api/              # Hono API on Cloudflare Workers
│   │   ├── src/
│   │   │   ├── db/       # Database schema and migrations
│   │   │   ├── lib/      # Utilities and configuration
│   │   │   └── routes/   # API route handlers
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   └── web/              # React frontend
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── lib/         # Utilities and configurations
│       │   └── routes/      # TanStack Router routes
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── api-client/       # Type-safe API client
└── package.json          # Root package.json
```

## Architecture

### Multi-Tenancy Model

```
┌─────────────────────────────────────────────┐
│         Super Admin Control Plane           │
│    (Tracky staff - manage all tenants)      │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │ SME A  │  │ SME B  │  │ SME C  │
    │Workspace│  │Workspace│  │Workspace│
    └────────┘  └────────┘  └────────┘
        │           │           │
     Users       Users       Users
     Tasks       Tasks       Tasks
```

### User Roles
- **Super Admin** - Tracky platform staff with access to all workspaces
- **Workspace Admin** - SME company admin managing their workspace
- **Member** - SME company employee managing tasks

### Data Isolation
Each SME workspace operates in complete isolation:
- Separate task lists
- Independent user management
- Isolated settings and preferences
- Secure data boundaries

## Prerequisites

- **Node.js** >= 18
- **PNPM** >= 9.15.4
- **Cloudflare Account** (for deployment)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create environment files for both apps:

**apps/api/.env**
```bash
# Cloudflare D1 Database ID (get this after creating D1 database)
DATABASE_ID=your-d1-database-id

# Authentication secret (generate a random string)
AUTH_SECRET=your-secret-key

# Environment
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

**apps/web/.env**
```bash
# API URL for development (Vite proxy handles this)
VITE_API_URL=http://localhost:8787
```

### 3. Set Up Cloudflare D1 Database

#### Local Development
```bash
# Create local database
cd apps/api
pnpm wrangler d1 create tracky-db

# Copy the database ID from the output and update wrangler.jsonc
# Replace "00000000-0000-0000-0000-000000000000" with your actual database ID

# Run migrations locally
pnpm run db:migrate:local
```

#### Production Database
```bash
# Create production database
cd apps/api
pnpm wrangler d1 create tracky-db-prod

# Run migrations on production
pnpm run db:migrate:remote
```

### 4. Start Development Servers

```bash
# From root directory - starts both web and api
pnpm dev
```

This will start:
- Web app: http://localhost:5173
- API: http://localhost:8787
- API docs: http://localhost:8787/reference

The web app's Vite dev server is configured to proxy `/api` requests to the API server.

## Available Scripts

### Root Level
- `pnpm dev` - Start all dev servers in parallel
- `pnpm build` - Build all packages and apps
- `pnpm test` - Run tests for all packages
- `pnpm lint` - Lint all packages
- `pnpm deploy` - Build and deploy to production

### API (apps/api)
- `pnpm dev` - Start local development server
- `pnpm build` - Build for production
- `pnpm test` - Run tests
- `pnpm deploy` - Deploy to Cloudflare Workers
- `pnpm db:generate` - Generate new migration
- `pnpm db:migrate:local` - Run migrations locally
- `pnpm db:migrate:remote` - Run migrations on production

### Web (apps/web)
- `pnpm dev` - Start Vite dev server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Lint code

## Development Workflow

### Adding API Routes

1. Create a new route file in `apps/api/src/routes/`
2. Define your route with OpenAPI metadata:

```typescript
import { createRoute } from "@hono/zod-openapi"
import { z } from "zod"

export const myRoute = createRoute({
  method: "get",
  path: "/my-endpoint",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
      description: "Successful response",
    },
  },
})
```

3. Register the route in your app

### Adding Frontend Routes

1. Create a new file in `apps/web/src/routes/`
2. TanStack Router will auto-generate the route tree

```tsx
// apps/web/src/routes/about.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/about")({
  component: About,
})

function About() {
  return <div>About page</div>
}
```

### Database Migrations

```bash
# 1. Update schema in apps/api/src/db/schema.ts
# 2. Generate migration
cd apps/api
pnpm run db:generate

# 3. Apply migration locally
pnpm run db:migrate:local

# 4. For production
pnpm run db:migrate:remote
```

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
cd apps/api
pnpm test

# Watch mode
pnpm test --watch
```

## Deployment

### Prerequisites
- Cloudflare account
- Wrangler CLI authenticated: `pnpm wrangler login`
- Production D1 database created

### Deploy

```bash
# Build and deploy everything
pnpm deploy

# Or deploy individual apps
cd apps/api
pnpm deploy
```

### Environment Variables for Production

Set secrets in Cloudflare:
```bash
cd apps/api
pnpm wrangler secret put AUTH_SECRET
```

## API Documentation

- **Development**: http://localhost:8787/reference
- **Production**: Disabled by default (configure in `apps/api/src/lib/configure-open-api.ts`)

## Features

- ✅ Multi-tenant architecture with workspace isolation
- ✅ Type-safe API client
- ✅ File-based routing
- ✅ Server state management with TanStack Query
- ✅ Database migrations with Drizzle
- ✅ OpenAPI documentation
- ✅ Dark mode support
- ✅ Comprehensive UI component library
- ✅ Testing setup
- ✅ Monorepo architecture

## Roadmap

### Phase 1: Core Infrastructure
- [ ] Workspace management (create, update, delete)
- [ ] User authentication and authorization
- [ ] Role-based access control (Super Admin, Workspace Admin, Member)
- [ ] Tenant isolation middleware

### Phase 2: Task Management
- [ ] Task CRUD operations
- [ ] Task assignment and status tracking
- [ ] Task filtering and search
- [ ] Due dates and priorities

### Phase 3: Collaboration
- [ ] Comments on tasks
- [ ] Activity feed
- [ ] Notifications
- [ ] Team member invitations

### Phase 4: Super Admin Features
- [ ] Platform-wide analytics dashboard
- [ ] Tenant management
- [ ] Usage monitoring
- [ ] Billing integration

## License

MIT
