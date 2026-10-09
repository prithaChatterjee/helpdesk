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
| Email (in/out)         | Postmark (or SendGrid)                                                 | Inbound webhook + outbound sending, SPF/DKIM handled by provider                                                        |
| AI                     | Claude API                                                             | Haiku 5.5 (`claude-haiku-5-5`) for classification; Sonnet 5.5 (`claude-sonnet-5-5`) for summaries and reply suggestions |
| Authentication         | Database sessions (PostgreSQL)                                         | See below                                                                                                               |
| Testing                | Vitest + Playwright                                                    | Unit/API tests and end-to-end tests                                                                                     |
| Deployment             | Docker Compose (`web`, `api`, `worker`) + managed PostgreSQL and Redis | Render / Railway / Fly.io / AWS                                                                                         |

## Authentication: database sessions

Sessions are stored in PostgreSQL. The browser only holds an opaque, random session ID in a cookie. No JWTs.

### Flow

1. User submits email + password to `POST /auth/login`.
2. API verifies the password hash (argon2).
3. API generates a cryptographically random session token, stores a **hash** of it in the `sessions` table, and sets the raw token in a cookie.
4. On each request, middleware reads the cookie, hashes the token, looks up the session, checks expiry and that the user is active, and attaches `user` (with role) to the request.
5. `POST /auth/logout` deletes the session row and clears the cookie.

### Sessions table

| Column         | Type            | Notes                                                 |
| -------------- | --------------- | ----------------------------------------------------- |
| `id`           | uuid            | Primary key                                           |
| `token_hash`   | text, unique    | SHA-256 of the session token (raw token never stored) |
| `user_id`      | uuid → users.id | On delete cascade                                     |
| `created_at`   | timestamptz     |                                                       |
| `expires_at`   | timestamptz     | Absolute expiry (e.g. 7 days)                         |
| `last_seen_at` | timestamptz     | For idle timeout (e.g. 24 hours)                      |
| `ip_address`   | text            | Optional, for audit                                   |
| `user_agent`   | text            | Optional, for audit                                   |

### Cookie settings

- `HttpOnly` (not readable by JavaScript)
- `Secure` (HTTPS only)
- `SameSite=Lax`
- `Path=/`
- Max-Age matching session expiry

### Rules

- **Role checks:** middleware `requireRole('admin')` protects user-management routes; all other app routes require any authenticated user.
- **Revocation:** when an Admin deactivates an Agent or resets their password, all of that user's sessions are deleted immediately (the main advantage over JWTs).
- **Session rotation:** issue a new session ID on login to prevent session fixation.
- **Cleanup:** a scheduled BullMQ job deletes expired sessions daily.
- **Brute-force protection:** rate-limit `POST /auth/login` per IP and per email.
- **CSRF:** `SameSite=Lax` plus a check of the `Origin` header on state-changing requests.
- **Initial Admin:** on first startup, if no users exist, the API creates an Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.

## Ticket processing flow

```
Inbound email → Postmark webhook → API stores ticket (Open) → enqueue job
  → worker: classify category (Haiku) → summarize + draft reply (Sonnet)
  → Agent reviews in UI → sends via Postmark → status Resolved
Customer reply → matched to ticket via In-Reply-To / References headers
```

## Services

| Service    | Responsibility                                             |
| ---------- | ---------------------------------------------------------- |
| `web`      | React frontend (static build)                              |
| `api`      | REST API, auth, webhooks                                   |
| `worker`   | BullMQ consumers: AI jobs, outbound email, session cleanup |
| PostgreSQL | Primary data store, including sessions                     |
| Redis      | Job queue only (not used for sessions)                     |
