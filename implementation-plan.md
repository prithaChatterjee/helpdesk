# Implementation Plan

Based on `project-scope.md` and `tech-stack.md`. Each phase ends with something working that can be demoed. Tasks are sized to roughly half a day to a day each.

## Assumptions (until the open questions are answered)

- **AI auto-resolves only what the knowledge base answers.** When `apps/worker/knowledge-base.md` fully answers a new ticket and nobody needs to act (no refund, account change, bug or complaint), the AI saves a reply and resolves it; everything else stays Open for an Agent (decided October 2026, replacing "AI does not auto-send").
- **All Agents see all tickets.** A ticket can be assigned (manually, from the ticket page) to one active Admin or Agent, or left unassigned; assignment doesn't restrict who can see or edit it. Deleting an Agent unassigns their tickets. No teams or automatic routing in the first release.
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
- [ ] 1.9 Rate limiting on login (per IP and per email) — Better Auth per-IP limit enabled in production (`NODE_ENV=production`); pending: `advanced.ipAddress` trusted-proxy config (else `X-Forwarded-For` is spoofable) and a per-email limit
- [ ] 1.10 CSRF protection: Origin header check on state-changing requests — covered for `/api/auth/*` by Better Auth; app routes pending
- [x] 1.11 Frontend: login page, auth context, protected routes, logout button
- [ ] 1.12 Frontend: app shell layout (sidebar nav, header with current user) — header done; sidebar pending
- [ ] 1.13 API tests for login, logout, expired session, inactive user, wrong role

**Done when:** the seeded Admin can log in, see the empty app shell, and log out; invalid or expired sessions are rejected.

---

## Phase 2 — User management (Admin only)

Goal: Admin can manage Agents.

- [x] 2.1 `GET /users` (list, Admin only)
- [x] 2.2 `POST /users` create Agent (name, email, initial password), with Zod validation and unique email check
- [x] 2.3 `PATCH /users/:id` edit name/email (a non-blank `password` also replaces the password and deletes the user's other sessions)
- [ ] 2.4 `POST /users/:id/deactivate` and `/activate`; deactivation deletes all of the user's sessions, and a Better Auth `hooks.before` rejects inactive users on `/api/auth/*` (except sign-out)
- [ ] 2.5 `POST /users/:id/reset-password`; deletes all of the user's sessions
- [ ] 2.6 Guard: Admin cannot deactivate themselves (prevents losing the last Admin)
- [x] 2.7 Frontend: Users page with table (name, email, role, status)
- [x] 2.8 Frontend: create / edit Agent dialog (Users page "Create user" button, pencil button per row)
- [ ] 2.9 Frontend: deactivate / activate and reset password actions with confirmation
- [x] 2.10 Hide Users nav item for Agents; API tests that Agents get 403
- [x] 2.11 `DELETE /users/:id` soft delete (sets `deletedAt`, deactivates, deletes sessions; Admins can't be deleted) with a confirmation dialog on Agent rows. Deleted users stay out of the list and keep their email taken. 2.4's `/activate` must refuse deleted users

**Done when:** Admin creates an Agent, the Agent logs in, Admin deactivates them, and the Agent is logged out immediately.

---

## Phase 3 — Receiving emails and creating tickets

Goal: incoming emails become tickets.

- [x] 3.1 Prisma models: `Ticket` (id, subject, status `OPEN | RESOLVED | CLOSED`, category `GENERAL | TECHNICAL | REFUND` nullable, customerEmail, customerName, summary, timestamps) and `Message` (id, ticketId, direction `INBOUND | OUTBOUND`, fromEmail, bodyText, bodyHtml, emailMessageId, sentByUserId nullable, createdAt)
- [x] 3.2 Add shared Zod schemas and enums in `packages/shared`
- [ ] 3.3 Set up the inbound email provider and a local tunnel for development (ngrok) — SendGrid chosen; the Inbound Parse adapter (`POST /api/webhooks/sendgrid/inbound?token=`) is built and tested, ngrok works. Still needed: a domain (or subdomain) whose MX record points to `mx.sendgrid.net`, and the Inbound Parse setting in SendGrid
- [x] 3.4 `POST /api/webhooks/inbound-email`: verify webhook authenticity (`Authorization: Bearer INBOUND_EMAIL_SECRET`)
- [x] 3.5 Webhook stores the raw payload and enqueues an `ingest-email` job (respond quickly, process async) — done synchronously for now: the API creates the ticket in the request (no queue, no raw payload stored). Move to a worker job if ingestion gets slow
- [x] 3.6 Worker `ingest-email`: parse sender, subject, plain text and HTML body — in the API (`apps/api/src/inbound-email/ingest.ts`)
- [x] 3.7 Threading: match `In-Reply-To` / `References` headers to an existing ticket's message IDs; otherwise create a new ticket. Only when the sender is the ticket's customer (else a new ticket)
- [x] 3.8 Reopen rule: reply on a Resolved ticket sets it back to Open; reply on a Closed ticket creates a new ticket
- [x] 3.9 Idempotency: ignore duplicate webhook deliveries (unique `emailMessageId`)
- [x] 3.10 Filter auto-replies and bounces (`Auto-Submitted` header, out-of-office patterns) so they don't create tickets
- [x] 3.11 Sanitize HTML email bodies before storage/display
- [x] 3.12 Tests with sample email payloads (new ticket, reply, duplicate, auto-reply)

**Done when:** sending an email to the support address creates a ticket, and replying to it adds a message to the same ticket.

---

## Phase 4 — Ticket list and ticket details

Goal: Agents can find and read tickets.

- [x] 4.1 `GET /tickets` with server-side pagination — `?page=&pageSize=` (10/25/50/100, default 25), response carries `total`; Tickets page has page-size picker and page buttons
- [ ] 4.2 Filters: status, category, date range, text search (subject, customer email)
- [x] 4.3 Sorting: created date, last updated, status, category — server-side via `?sortBy=&sortOrder=` (also subject and customer); the Users table sorts the same way
- [ ] 4.4 Database indexes for status, category, createdAt; PostgreSQL full-text search index
- [x] 4.5 `GET /tickets/:id` with all messages in order
- [x] 4.6 `PATCH /tickets/:id` to change status and category manually
- [ ] 4.7 Frontend: ticket list page with TanStack Table (sortable columns, filter bar, pagination)
- [ ] 4.8 Keep filters and sort in the URL query string (shareable, survives refresh)
- [x] 4.9 Frontend: ticket detail page with conversation thread (inbound vs outbound styling)
- [x] 4.10 Frontend: status and category dropdowns on detail page
- [ ] 4.11 Empty, loading, and error states
- [x] 4.12 Manual assignment: `PATCH /tickets/:id` `assigneeId` (active users only, `null` unassigns), `GET /assignees`, Assignee dropdown on the detail page, Assignee column and "Assigned to me"/"Unassigned" filter on the list; deleting an Agent unassigns their tickets

**Done when:** an Agent can filter to "Open + Refund request", sort by newest, open a ticket, read the thread, and change its status.

---

## Phase 5 — Sending replies

Goal: Agents reply to customers from the app.

- [ ] 5.1 Configure the SendGrid sending domain (Domain Authentication: SPF/DKIM CNAME records) — for now a Single Sender (`SUPPORT_EMAIL`) is verified instead, which is enough to send
- [x] 5.2 `POST /tickets/:id/replies`: save outbound message, enqueue `send-email` job (pg-boss; only with `EMAIL_SENDING_ENABLED`)
- [x] 5.3 Worker `send-email`: send via SendGrid with correct `In-Reply-To` / `References` headers so the customer's mail client threads it
- [x] 5.4 Store the outbound `Message-ID`; mark message as sent or failed
- [x] 5.5 Retry with backoff on send failure; show failed state in UI (no resend button yet)
- [ ] 5.6 Set ticket status to Resolved after a successful reply (Agent can override)
- [x] 5.7 Frontend: reply editor on ticket detail page
- [x] 5.8 Record which Agent sent each reply (`sentByUserId`)

**Done when:** an Agent replies from the app, the customer receives it in the same email thread, and the ticket moves to Resolved.

---

## Phase 6 — AI classification

Goal: every new ticket gets a category automatically.

- [ ] 6.1 Claude API client wrapper in worker (API key from env, timeouts, retries)
- [ ] 6.2 Classification prompt using `claude-haiku-5-5` returning structured JSON: `{ category, confidence, reason }`
- [x] 6.3 Validate AI output with Zod; reject invalid categories — `Output.object` with `ticketCategorySchema` (`apps/api/src/inbound-email/classify.ts`)
- [x] 6.4 Worker `classify-ticket` job, triggered after ingestion of a new ticket — on pg-boss (PostgreSQL) instead of BullMQ, so it runs without Redis; Google Gemini `gemini-3.5-flash-lite`, paced to `AI_REQUESTS_PER_MINUTE`
- [ ] 6.5 Store `category`, `categoryConfidence`, `categorySource` (`AI | AGENT`) on ticket
- [ ] 6.6 Low confidence (below threshold) leaves category empty and flags for manual review
- [x] 6.7 If the AI API fails, the ticket stays usable without a category; job retries later — done: the ticket stays uncategorized and pg-boss retries the job (8 times, backoff up to 1 h)
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

- [ ] 8.1 `GET /dashboard/stats` with date-range parameter — `GET /api/dashboard/stats` exists (all time); date range still to do
- [ ] 8.2 Metrics: tickets by status, tickets by category, new tickets per day — status, category and resolved-by-AI done; per day still to do
- [ ] 8.3 Metrics: average first response time, average time to resolve
- [ ] 8.4 Metrics: AI suggestion usage rate (used / edited / discarded), AI category override rate
- [ ] 8.5 Frontend: stat tiles row (open count, resolved today, avg first response time)
- [ ] 8.6 Frontend: charts (tickets per day, by category, by status) with Recharts — `/dashboard` has stat tiles (total, open, resolved, resolved by AI, with percentages), a by-category bar chart and a by-status pie; per day still to do
- [ ] 8.7 Date range picker (today, 7 days, 30 days)
- [ ] 8.8 Make dashboard the default landing page after login

**Done when:** both roles see accurate live stats that match the ticket data.

---

## Phase 9 — Hardening and deployment

Goal: the system is safe to run in production.

- [ ] 9.1 Scheduled jobs: delete expired sessions daily; auto-close tickets Resolved for N days
- [ ] 9.2 Structured logging (pino) with request IDs; no email bodies or passwords in logs
- [x] 9.3 Error tracking (Sentry) for api, worker, and web — errors only, no tracing; source map upload for the web build still to do
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

- Measure how often customers reopen auto-resolved tickets (AI replies are emailed with `EMAIL_SENDING_ENABLED`)
- Resend a reply that failed to send; verify SendGrid Inbound Parse posts with its signed-webhook security policy instead of a URL token
- Automatic assignment, teams and routing (manual assignment is in the first release)
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
