# Tech Stack

Single TypeScript codebase end to end: shared types and validation between frontend and backend, one skill set to hire for.

## Overview

| Layer                  | Choice                                                                 | Purpose                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend               | React + Vite + TypeScript                                              | Authenticated single-page app (no SSR needed)                                                                           |
| UI components          | Tailwind CSS + shadcn/ui                                               | Tables, forms, dialogs for an internal tool                                                                             |
| Data fetching / tables | TanStack Query + TanStack Table                                        | Server-side sort, filter, pagination; client caching                                                                    |
| Charts                 | Recharts                                                               | Dashboard charts and stat tiles                                                                                         |
| Backend API            | Node.js + Express + TypeScript                                         | REST API                                                                                                                |
| Validation             | Zod (shared package)                                                   | Single source of truth for ticket, status, category, role schemas                                                       |
| Database               | PostgreSQL                                                             | Users, sessions, tickets, messages; full-text search for ticket list                                                    |
| ORM                    | Prisma                                                                 | Schema, migrations, typed queries                                                                                       |
| Background jobs        | BullMQ + Redis                                                         | Email ingestion, AI classification, summaries, reply drafts, with retries                                               |
| Email (in/out)         | SendGrid                                                               | Inbound webhook + outbound sending, SPF/DKIM handled by provider                                                        |
| AI                     | Claude API                                                             | Haiku 5.5 (`claude-haiku-5-5`) for classification; Sonnet 5.5 (`claude-sonnet-5-5`) for summaries and reply suggestions |
| Authentication         | Better Auth, database sessions (PostgreSQL)                            | See below                                                                                                               |
| Testing                | Vitest + Playwright                                                    | Unit/API tests and end-to-end tests                                                                                     |
| Deployment             | Docker Compose (`web`, `api`, `worker`) + managed PostgreSQL and Redis | Render / Railway / Fly.io / AWS                                                                                         |

## Authentication: database sessions

Implemented with [Better Auth](https://www.better-auth.com) (email + password, Prisma adapter) in `apps/api/src/auth.ts`, mounted at `/api/auth/*`. Sessions are stored in PostgreSQL. The browser only holds an opaque, random session token in a cookie. No JWTs. Public sign-up is disabled.

### Flow

1. User submits email + password to `POST /api/auth/sign-in/email`.
2. Better Auth verifies the password hash (scrypt), stored on the user's `credential` row in `accounts`.
3. Better Auth generates a random session token, stores it in the `sessions` table, and sets it in an HMAC-signed cookie (`better-auth.session_token`).
4. On each request, `requireAuth` calls `auth.api.getSession`, which verifies the cookie signature, looks up the session, checks expiry, and attaches `user` (with role) to `res.locals`. Inactive users get 401.
5. `POST /api/auth/sign-out` deletes the session row and clears the cookie. `GET /api/auth/get-session` and `GET /api/me` return the current user.

Trade-off: the database stores the raw session token (the cookie is signed with `BETTER_AUTH_SECRET`), not a SHA-256 hash.

### Sessions table

| Column         | Type            | Notes                                                       |
| -------------- | --------------- | ----------------------------------------------------------- |
| `id`           | uuid            | Primary key                                                 |
| `token_hash`   | text, unique    | Better Auth session token (`token` field, mapped)           |
| `user_id`      | uuid → users.id | On delete cascade                                           |
| `created_at`   | timestamptz     |                                                             |
| `expires_at`   | timestamptz     | Absolute expiry (7 days, extended on use after 1 day)       |
| `last_seen_at` | timestamptz     | Better Auth `updatedAt` (mapped); bumped on session refresh |
| `ip_address`   | text            | Optional, for audit                                         |
| `user_agent`   | text            | Optional, for audit                                         |

Better Auth also uses `accounts` (password hashes, future OAuth links) and `verifications` (email/reset tokens).

### Cookie settings

- `HttpOnly` (not readable by JavaScript)
- `Secure` (HTTPS only)
- `SameSite=Lax`
- `Path=/`
- Max-Age matching session expiry

### Rules

- **Role checks:** middleware `requireRole('admin')` protects user-management routes; all other app routes require any authenticated user.
- **Inactive users:** a `session.create.before` hook rejects sign-in (403) and `requireAuth` rejects existing sessions.
- **Revocation:** when an Admin deactivates an Agent or resets their password, all of that user's sessions are deleted immediately (the main advantage over JWTs).
- **Session rotation:** issue a new session ID on login to prevent session fixation.
- **Cleanup:** a scheduled BullMQ job deletes expired sessions daily.
- **Brute-force protection:** rate-limit sign-in per IP and per email (Better Auth has a built-in per-IP limiter, enabled in production).
- **CSRF:** `SameSite=Lax` plus Better Auth's `Origin` check against `trustedOrigins` (`WEB_ORIGIN`).
- **Initial Admin:** on first startup, if no users exist, the API (`seed-admin.ts`) creates an Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.

## Ticket processing flow

```
Inbound email → Postmark webhook → API stores ticket (Open) → enqueue job
  → worker: classify category (Haiku) → summarize + draft reply (Sonnet)
  → Agent reviews in UI → sends via Postmark → status Resolved
Customer reply → matched to ticket via In-Reply-To / References headers
```

For now there is no email provider and no ingestion job: `POST /api/webhooks/inbound-email` takes a provider-neutral JSON email and creates or updates the ticket within the request.

## Services

| Service    | Responsibility                                             |
| ---------- | ---------------------------------------------------------- |
| `web`      | React frontend (static build)                              |
| `api`      | REST API, auth, webhooks                                   |
| `worker`   | BullMQ consumers: AI jobs, outbound email, session cleanup |
| PostgreSQL | Primary data store, including sessions                     |
| Redis      | Job queue only (not used for sessions)                     |
