# KA HRMS

Modern Human Resource Management System for **Kesatria Awan Sdn Bhd** — built on Cloudflare's serverless stack, replacing heavyweight self-hosted HR software with something fast, simple, and ours.

**Status:** 🚧 In active development · Design: [`docs/design/2026-09-02-data-model.md`](docs/design/2026-09-02-data-model.md)

## What it does

### v1
- **Staff directory** — employee profiles (EA 1955 fields: NRIC, bumi status, statutory numbers), org chart, departments & designations, bank details, emergency contacts
- **Leave management** — 15 Malaysian leave types (incl. Paternity/Maternity/Umrah/Hajj), apply → approve flow, balances, MC attachment upload, holiday calendar (W.P. KL)
- **Attendance** — 9:00–6:00 Mon–Fri schedule, clock in/out, auto Present/Late/Absent, correction requests
- **Payroll** — monthly runs, statutory deductions (EPF 11%/13%, SOCSO, EIS, PCB), versioned statutory rate tables, payslip PDFs (R2) + email delivery
- **Expense claims** — submission → approval → paid via payroll, receipts in R2

### Later
- KPI / appraisal engine · authentik SSO (OIDC hook ready) · PWA mobile · multi-tenant (SaaS)

## Tech Stack

| Layer | Tech |
|-------|------|
| API | [Hono](https://hono.dev) on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Files | Cloudflare R2 (payslips, contracts, receipts, avatars) |
| Frontend | React 19 + TanStack Router/Query + Tailwind CSS v4 + shadcn/ui |
| Auth | Email OTP (6-digit via mailcow SMTP) → JWT (15-min access + refresh); OIDC-ready |
| Docs API | OpenAPI + Scalar |
| Testing | Vitest (API) + Playwright (e2e) |

Derived from the [Tracky](https://github.com/kesatria-awan/tracky) scaffold (commit `139348b`).

## Project Structure

```
hrms/
├── apps/
│   ├── api/              # Hono API on Cloudflare Workers
│   │   ├── src/
│   │   │   ├── db/       # Drizzle schema + migrations (D1)
│   │   │   ├── lib/      # Auth, email (OTP), storage, config
│   │   │   ├── routes/   # employees, leaves, attendance, payroll, claims
│   │   │   └── middlewares/
│   │   └── wrangler.jsonc
│   └── web/              # React SPA (builds into api/public — single Worker deploy)
│       └── src/routes/   # TanStack file-based routing
├── docs/design/          # Design specs
└── packages/api-client   # Type-safe Hono RPC client
```

## Getting Started

```bash
pnpm install
pnpm dev        # API on :8787, web on :5173 (proxies /api)
pnpm build      # Type-check + build all
pnpm test       # Tests
```

### Database

```bash
cd apps/api
pnpm db:generate         # Generate migrations from schema
pnpm db:migrate:local    # Apply locally (D1 miniflare)
pnpm db:migrate:remote   # Apply to production D1
```

### Deploy

```bash
pnpm deploy              # Build web → api/public, deploy Worker
```

Production URL: `hr.kesatria.my` (Cloudflare Access + tunnel, behind `@kesatria.my` email OTP)

## Roles

| Role | Access |
|------|--------|
| `hr_admin` | Everything: employees, approvals, payroll runs, settings (Syafi, Syak, Ridhwan, Kamal) |
| `employee` | Self-service: own profile, apply leave, clock in/out, view payslips, submit claims |

## Data

Seeded from real KA records: 11 employees, 15 leave types, 2026 W.P. KL holiday calendar (21 days, EA 1955 s.60D compliant), and 73 historical payslips (Nov 2025 – Aug 2026) migrated from MySyarikat payroll exports.

---

Built by Kesatria Awan. Yellow. 🟡