# BreachNotificationClock

BreachNotificationClock is a statutory-and-contractual breach notification deadline engine and notice-tracking system for privacy and security teams. From a single incident timeline, it computes every applicable regulator and customer notification deadline across all jurisdictions and sectors a company is exposed to, sorts them by soonest due, and tracks each individual notice from draft, through approver sign-off, to verified proof of delivery.

When a data incident hits, the platform turns a chaotic spreadsheet-and-email scramble into a deterministic, defensible, countdown-driven workflow with an immutable audit trail. It is built on a maintained rules dataset of breach-notification laws (GDPR Article 33/34, US state breach laws across all 50 states, HIPAA, GLBA, sector and contractual obligations), where each rule encodes its trigger, clock-start anchor, deadline offset, recipient, content requirements, and delivery method.

See [docs/idea.md](docs/idea.md) for the full product and feature specification.

## Who it is for

- Privacy Counsel and General Counsel at multi-jurisdiction companies who personally sign breach notifications.
- Data Protection Officers responsible for GDPR Article 33/34 compliance.
- CISOs and Incident Response leads who own the incident timeline.
- Privacy program managers running breach-readiness drills.
- Outside privacy law firms and incident-response consultancies managing notifications for multiple clients.

## Stack

- **Backend:** Hono on Node, drizzle-orm with Neon serverless Postgres. Run with `node --import tsx/esm src/index.ts` (no compile step at runtime). Lives in `backend/`.
- **Frontend:** Next.js 16, React 19, TypeScript strict, Tailwind 4, App Router. Auth via `@neondatabase/auth`. Lives in `web/`.
- **Database:** Neon Postgres. Tables are provisioned out of band (drizzle schema push or Neon console); the backend only runs an idempotent seed on boot.
- **Package manager:** pnpm for all Node and TypeScript work.

The backend trusts an `X-User-Id` header. The Next.js proxy route (`web/app/api/proxy/[...path]/route.ts`) resolves the session server-side and injects that header on every forwarded request; the browser only ever calls relative `/api/proxy/...` URLs.

## Local development

Prerequisites: Node 22+, pnpm, and a Neon Postgres database with the schema already pushed.

### Backend

```bash
cd backend
pnpm install
cp .env.example .env        # fill in DATABASE_URL, FRONTEND_URL
pnpm dev                    # serves on http://localhost:3001
```

### Frontend

```bash
cd web
pnpm install
cp .env.example .env.local  # fill in NEON_AUTH_* and NEXT_PUBLIC_API_URL
pnpm dev                    # serves on http://localhost:3000
```

Open http://localhost:3000, sign up, and you are in.

### Docker

`docker-compose.yml` brings the backend and web up together:

```bash
docker compose up --build
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port. Defaults to `3001` locally; Render injects `10000`. |
| `DATABASE_URL` | Neon Postgres connection string (`?sslmode=require`). |
| `FRONTEND_URL` | Allowed CORS origin, e.g. `http://localhost:3000`. |
| `ADMIN_USER_IDS` | Optional comma-separated list of admin user IDs. |

### Frontend (`web/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEON_AUTH_BASE_URL` | Neon Auth endpoint base URL (server-only). |
| `NEON_AUTH_COOKIE_SECRET` | Random 32-byte hex cookie secret (server-only). |
| `NEXT_PUBLIC_API_URL` | Backend base URL, baked into the bundle at build time. |

## Pricing

All features are free for signed-in users. There is no paid tier and no payment wall. Create an account, sign in, and every capability in the obligation engine, matrix views, notice tracking, and defensibility export is available.

## Deployment

- **Backend** deploys to Render via `render.yaml` (single web service, free plan, Oregon region). Set `DATABASE_URL` and `FRONTEND_URL` as Render environment variables.
- **Frontend** deploys to Vercel with `rootDirectory: web`, framework `nextjs`, Node `22.x`.
