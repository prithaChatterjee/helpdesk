# Implementation Plan

Based on `project-scope.md` and `tech-stack.md`. Each phase ends with something working that can be demoed. Tasks are sized to roughly half a day to a day each.

## Assumptions (until the open questions are answered)

- **AI does not auto-send.** AI drafts a reply; an Agent reviews, edits, and sends. Auto-send can be added later per category.
- **All Agents see all tickets.** No assignment or teams in the first release.
- **Status meaning:** Open = needs attention; Resolved = reply sent; Closed = final (manual, or automatic after N days in Resolved). A customer reply on a Resolved ticket reopens it; on a Closed ticket it creates a new ticket.
- **Category is nullable** until AI classifies it. Agents can change the category manually.
- **Agents are deactivated, not deleted**, to keep ticket history.
- **Admin sets the initial password** for new Agents (no invite emails in the first release).

---

## Phase 0 — Project setup

Goal: an empty app runs locally and in CI.

- [x] 0.1 Create monorepo (npm workspaces): `apps/web`, `apps/api`, `apps/worker`, `packages/shared`
- [x] 0.2 Configure TypeScript, ESLint, Prettier shared across workspaces
- [x] 0.3 Scaffold `apps/web` with React + Vite + Tailwind + shadcn/ui
- [x] 0.4 Scaffold `apps/api` with Express, health check route `GET /health`
- [x] 0.5 Scaffold `apps/worker` with BullMQ connected to Redis
- [x] 0.6 `docker-compose.yml` for local PostgreSQL and Redis
- [x] 0.7 Environment config loading and validation with Zod (`DATABASE_URL`, `REDIS_URL`, `ADMIN_EMAIL`, etc.) plus `.env.example`
- [x] 0.8 Set up Vitest in api and shared packages
- [x] 0.9 CI pipeline (GitHub Actions): install, lint, typecheck, test

**Done when:** `docker compose up` + `npm run dev` starts all three apps, and CI is green.

---

## Phase 1 — Database and authentication

Goal: users can log in and out with database sessions.

- [x] 1.1 Set up Prisma; create `User` model (id, name, email, role `ADMIN | AGENT`, isActive, timestamps)
- [x] 1.2 Create `Session` model (id, tokenHash, userId, createdAt, expiresAt, lastSeenAt, ipAddress, userAgent)
- [x] 1.3 Password hashing utilities (argon2) with unit tests — Better Auth (scrypt)
- [x] 1.4 Seed first Admin on startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if no users exist
- [x] 1.5 Sessions via Better Auth: random token stored as-is in `token_hash` (the cookie is HMAC-signed with `BETTER_AUTH_SECRET`; not a SHA-256 hash, see the trade-off in `tech-stack.md`), validated for expiry and active user (`requireAuth`), revocable with Better Auth's session APIs
- [x] 1.6 `POST /auth/login`: verify credentials, create session, set cookie (`HttpOnly`, `Secure`, `SameSite=Lax`)
- [x] 1.7 `POST /auth/logout` and `GET /auth/me` — Better Auth `/api/auth/sign-out`, plus `GET /api/me`
- [x] 1.8 Auth middleware (`requireAuth`) and role middleware (`requireRole('ADMIN')`)
- [ ] 1.9 Rate limiting on login (per IP and per email) — Better Auth per-IP limit always enabled; pending: `advanced.ipAddress` trusted-proxy config (else `X-Forwarded-For` is spoofable) and a per-email limit
- [ ] 1.10 CSRF protection: Origin header check on state-changing requests — covered for `/api/auth/*` by Better Auth; app routes pending
- [x] 1.11 Frontend: login page, auth context, protected routes, logout button
- [ ] 1.12 Frontend: app shell layout (sidebar nav, header with current user) — header done; sidebar pending
- [ ] 1.13 API tests for login, logout, expired session, inactive user, wrong role

**Done when:** the seeded Admin can log in, see the empty app shell, and log out; invalid or expired sessions are rejected.

---

## Phase 2 — User management (Admin only)

Goal: Admin can manage Agents.

- [x] 2.1 `GET /users` (list, Admin only)
- [ ] 2.2 `POST /users` create Agent (name, email, initial password), with Zod validation and unique email check
- [ ] 2.3 `PATCH /users/:id` edit name/email
- [ ] 2.4 `POST /users/:id/deactivate` and `/activate`; deactivation deletes all of the user's sessions, and a Better Auth `hooks.before` rejects inactive users on `/api/auth/*` (except sign-out)
- [ ] 2.5 `POST /users/:id/reset-password`; deletes all of the user's sessions
- [ ] 2.6 Guard: Admin cannot deactivate themselves (prevents losing the last Admin)
- [x] 2.7 Frontend: Users page with table (name, email, role, status)
- [ ] 2.8 Frontend: create / edit Agent dialog
- [ ] 2.9 Frontend: deactivate / activate and reset password actions with confirmation
- [x] 2.10 Hide Users nav item for Agents; API tests that Agents get 403

**Done when:** Admin creates an Agent, the Agent logs in, Admin deactivates them, and the Agent is logged out immediately.

---

## Phase 3 — Receiving emails and creating tickets

Goal: incoming emails become tickets.

- [ ] 3.1 Prisma models: `Ticket` (id, subject, status `OPEN | RESOLVED | CLOSED`, category `GENERAL | TECHNICAL | REFUND` nullable, customerEmail, customerName, summary, timestamps) and `Message` (id, ticketId, direction `INBOUND | OUTBOUND`, fromEmail, bodyText, bodyHtml, emailMessageId, sentByUserId nullable, createdAt)
- [ ] 3.2 Add shared Zod schemas and enums in `packages/shared`
- [ ] 3.3 Set up Postmark inbound stream and a local tunnel for development (e.g. ngrok)
- [ ] 3.4 `POST /webhooks/inbound-email`: verify webhook authenticity (basic auth or secret)
- [ ] 3.5 Webhook stores the raw payload and enqueues an `ingest-email` job (respond quickly, process async)
- [ ] 3.6 Worker `ingest-email`: parse sender, subject, plain text and HTML body
- [ ] 3.7 Threading: match `In-Reply-To` / `References` headers to an existing ticket's message IDs; otherwise create a new ticket
- [ ] 3.8 Reopen rule: reply on a Resolved ticket sets it back to Open; reply on a Closed ticket creates a new ticket
- [ ] 3.9 Idempotency: ignore duplicate webhook deliveries (unique `emailMessageId`)
- [ ] 3.10 Filter auto-replies and bounces (`Auto-Submitted` header, out-of-office patterns) so they don't create tickets
- [ ] 3.11 Sanitize HTML email bodies before storage/display
- [ ] 3.12 Tests with sample email payloads (new ticket, reply, duplicate, auto-reply)

**Done when:** sending an email to the support address creates a ticket, and replying to it adds a message to the same ticket.

---

## Phase 4 — Ticket list and ticket details

Goal: Agents can find and read tickets.

- [ ] 4.1 `GET /tickets` with server-side pagination
- [ ] 4.2 Filters: status, category, date range, text search (subject, customer email)
- [ ] 4.3 Sorting: created date, last updated, status, category
- [ ] 4.4 Database indexes for status, category, createdAt; PostgreSQL full-text search index
- [ ] 4.5 `GET /tickets/:id` with all messages in order
- [ ] 4.6 `PATCH /tickets/:id` to change status and category manually
- [ ] 4.7 Frontend: ticket list page with TanStack Table (sortable columns, filter bar, pagination)
- [ ] 4.8 Keep filters and sort in the URL query string (shareable, survives refresh)
- [ ] 4.9 Frontend: ticket detail page with conversation thread (inbound vs outbound styling)
- [ ] 4.10 Frontend: status and category dropdowns on detail page
- [ ] 4.11 Empty, loading, and error states

**Done when:** an Agent can filter to "Open + Refund request", sort by newest, open a ticket, read the thread, and change its status.

---

## Phase 5 — Sending replies

Goal: Agents reply to customers from the app.

- [ ] 5.1 Configure Postmark sending domain (SPF, DKIM, Return-Path DNS records)
- [ ] 5.2 `POST /tickets/:id/replies`: save outbound message, enqueue `send-email` job
- [ ] 5.3 Worker `send-email`: send via Postmark with correct `In-Reply-To` / `References` headers so the customer's mail client threads it
- [ ] 5.4 Store the outbound `Message-ID`; mark message as sent or failed
- [ ] 5.5 Retry with backoff on send failure; show failed state in UI
- [ ] 5.6 Set ticket status to Resolved after a successful reply (Agent can override)
- [ ] 5.7 Frontend: reply editor on ticket detail page
- [ ] 5.8 Record which Agent sent each reply (`sentByUserId`)

**Done when:** an Agent replies from the app, the customer receives it in the same email thread, and the ticket moves to Resolved.

---

## Phase 6 — AI classification

Goal: every new ticket gets a category automatically.

- [ ] 6.1 Claude API client wrapper in worker (API key from env, timeouts, retries)
- [ ] 6.2 Classification prompt using `claude-haiku-5-5` returning structured JSON: `{ category, confidence, reason }`
- [ ] 6.3 Validate AI output with Zod; reject invalid categories
- [ ] 6.4 Worker `classify-ticket` job, triggered after ingestion of a new ticket
- [ ] 6.5 Store `category`, `categoryConfidence`, `categorySource` (`AI | AGENT`) on ticket
- [ ] 6.6 Low confidence (below threshold) leaves category empty and flags for manual review
- [ ] 6.7 If the AI API fails, the ticket stays usable without a category; job retries later
- [ ] 6.8 Frontend: show category badge with "AI" marker; Agent override sets source to `AGENT`
- [ ] 6.9 Evaluation set: ~50 real (anonymized) emails with known categories; script to measure accuracy

**Done when:** new tickets are categorized within seconds, with measured accuracy on the evaluation set.

---

## Phase 7 — AI summaries and reply suggestions

Goal: Agents get a summary and a draft reply for each ticket.

- [ ] 7.1 Summary prompt using `claude-sonnet-5-5`: 2–3 sentence summary of the whole thread
- [ ] 7.2 Worker `summarize-ticket` job; re-run when a new inbound message arrives
- [ ] 7.3 Reply suggestion prompt: uses thread, category, and tone guidelines
- [ ] 7.4 Store suggestions in an `AiSuggestion` table (ticketId, content, model, createdAt, status `PENDING | USED | EDITED | DISCARDED`)
- [ ] 7.5 Guardrail: refund requests get a draft that never promises a refund or amount
- [ ] 7.6 Frontend: summary panel at top of ticket detail page
- [ ] 7.7 Frontend: "Use suggestion" inserts the draft into the reply editor for editing; "Regenerate" button
- [ ] 7.8 Track whether each suggestion was used as-is, edited, or discarded (feeds the dashboard)
- [ ] 7.9 Log token usage per AI call for cost monitoring

**Done when:** opening a ticket shows a summary and a draft reply that an Agent can edit and send.

---

## Phase 8 — Dashboard

Goal: Admins and Agents see how support is performing.

- [ ] 8.1 `GET /dashboard/stats` with date-range parameter
- [ ] 8.2 Metrics: tickets by status, tickets by category, new tickets per day
- [ ] 8.3 Metrics: average first response time, average time to resolve
- [ ] 8.4 Metrics: AI suggestion usage rate (used / edited / discarded), AI category override rate
- [ ] 8.5 Frontend: stat tiles row (open count, resolved today, avg first response time)
- [ ] 8.6 Frontend: charts (tickets per day, by category, by status) with Recharts
- [ ] 8.7 Date range picker (today, 7 days, 30 days)
- [ ] 8.8 Make dashboard the default landing page after login

**Done when:** both roles see accurate live stats that match the ticket data.

---

## Phase 9 — Hardening and deployment

Goal: the system is safe to run in production.

- [ ] 9.1 Scheduled jobs: delete expired sessions daily; auto-close tickets Resolved for N days
- [ ] 9.2 Structured logging (pino) with request IDs; no email bodies or passwords in logs
- [ ] 9.3 Error tracking (e.g. Sentry) for api, worker, and web
- [ ] 9.4 Security headers (helmet), CORS config, request size limits for webhook
- [ ] 9.5 Playwright end-to-end tests: login, create Agent, receive email, reply, dashboard
- [ ] 9.6 Load test ingestion at expected peak volume (e.g. thousands of emails/hour)
- [ ] 9.7 Production Dockerfiles for web, api, worker
- [ ] 9.8 Provision managed PostgreSQL and Redis; automated database backups
- [ ] 9.9 Deploy to hosting provider; run migrations in the release step
- [ ] 9.10 Configure production Postmark inbound address and DNS
- [ ] 9.11 Queue monitoring (Bull Board, Admin-only) to see stuck or failed jobs
- [ ] 9.12 README: local setup, environment variables, deployment steps

**Done when:** production is live, emails flow end to end, errors and failed jobs are visible, and backups are running.

---

## Later (not in the first release)

- AI auto-send for selected categories, once suggestion accuracy is proven
- Ticket assignment to Agents, and teams/routing
- Internal notes on tickets
- Attachments (storage, virus scanning)
- Knowledge base for AI answers (retrieval from FAQ / past tickets)
- Invite emails and self-service password reset
- Customer satisfaction survey after resolution
- Additional channels (web form, chat)

## Dependencies between phases

```
0 → 1 → 2
    1 → 3 → 4 → 5
            3 → 6 → 7
        4, 5, 6, 7 → 8
                all → 9
```

Phases 2 and 3 can run in parallel after Phase 1. Phase 6 can start as soon as tickets exist (after Phase 3).
