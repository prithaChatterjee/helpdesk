# Helpdesk

AI-assisted support ticket system: receives support emails, AI classifies/summarizes/drafts replies, Agents review and send.

Planning docs (read before starting a phase):

- `project-scope.md` — features, decisions, open questions
- `tech-stack.md` — stack and database-session auth design
- `implementation-plan.md` — phased task list; tick `- [x]` when a task is done

## Documentation lookup

**Always use Context7 (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`) to fetch up-to-date docs before writing or changing code that uses a library, framework, CLI, or SDK** — even well-known ones. Versions in this repo are newer than most training data (e.g. Vitest 5, ESLint 10, TypeScript 6, Zod 4, Express 5, Vite 8, Tailwind 4, shadcn 4, tsdown, BullMQ 6, Prisma). Prefer Context7 over web search for library docs. Check the installed version in `package.json` and query that version when Context7 lists it.

For Better Auth, prefer the `better-auth` MCP server (`search_docs` → `get_doc`, using the installed `better-auth` version) and the Better Auth skills in `.claude/skills/` (e.g. `better-auth-best-practices`, `better-auth-security-best-practices`).

## Structure

npm workspaces monorepo, TypeScript everywhere, ESM (`"type": "module"`).

| Path              | What                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 19 + Vite + Tailwind 4 + shadcn/ui (radix-nova) + React Router 8. `@/` alias → `src/`; pages in `src/pages/`                                                              |
| `apps/api`        | Express 5 REST API. All routes under `/api/*`. `createApp(auth, prisma, config)` in `app.ts` is separate from `index.ts` (listen) for supertest; route modules in `src/routes/` |
| `apps/worker`     | BullMQ consumers; processors in `src/processors/`                                                                                                                               |
| `packages/shared` | Zod schemas (form schemas like `signInSchema`, API response types like `UserListResponse`), enums (roles, ticket statuses, categories), queue names                             |
| `packages/db`     | Prisma 7 schema, migrations, generated client (`src/generated/`, gitignored), `createPrismaClient()`. Node-only                                                                 |
| `e2e`             | Playwright end-to-end tests (`tests/`). Own database `helpdesk_test` and ports (API :3001, web :5174), settings and seeded `TEST_USERS` in `test-env.ts`                        |

## Commands

```sh
docker compose up -d   # PostgreSQL :5432, Redis :6379
npm run dev            # api :3000, worker, web :5173 (Vite proxies /api → :3000)
                       # without Redis: npm run dev -w @helpdesk/api (the worker only logs connection errors)
npm test               # Vitest (projects: packages/*, apps/api, apps/worker, apps/web)
npm run test:e2e       # Playwright: resets + seeds helpdesk_test, starts api :3001 and web :5174, runs e2e/tests
                       # first time: npx playwright install chromium (from e2e/)
npm run lint           # ESLint flat config at root
npm run typecheck
npm run format         # Prettier
npm run build          # tsdown (api, worker), vite (web)
npm run db:migrate     # prisma migrate dev (create + apply migration)
npm run db:generate    # regenerate Prisma client (also runs on postinstall)
npm run db:seed        # create/update the Admin (ADMIN_*) and optional extra user (SEED_USER_*)
                       # one-off user: SEED_USER_EMAIL=… SEED_USER_PASSWORD=… SEED_USER_ROLE=AGENT npm run db:seed
npm run db:studio      # Prisma Studio
```

Every seed run also re-saves the Admin (role, active, password reset to `ADMIN_PASSWORD`), so it refuses to run with `NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=true`. In production the API env also rejects the `.env.example` secrets (`BETTER_AUTH_SECRET`, `INBOUND_EMAIL_SECRET`)/Admin password and non-https `BETTER_AUTH_URL`/`WEB_ORIGIN`. The seed script loads the full API env, so it also needs every required API variable (including `INBOUND_EMAIL_SECRET`).

Before finishing a task, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run format:check`. CI (`.github/workflows/ci.yml`) also runs `npm run build`. When a change touches flows that existing `e2e/tests` specs cover (e.g. auth, user management, tickets), also run `npm run test:e2e` (needs local PostgreSQL; not in CI yet). It never reuses running servers, so it fails while ports :3001/:5174 are taken, e.g. by an open `npm run test:e2e:ui` session; ask before stopping the user's session.

Project subagents: `security-reviewer` (`.claude/agents/security-reviewer.md`) audits the whole codebase (or the branch) for security vulnerabilities: auth/sessions, authorization/IDOR, injection, data exposure, secrets, XSS, prompt injection in AI features, dependencies. Read-only. `e2e-tester` writes Playwright tests (see "End-to-end tests" below).

## Testing

Three layers. Test behavior at the lowest layer that can show it, and add tests with the change, not after. **UI changes get component tests by default; write e2e tests only when necessary** (see "When to write e2e tests" below).

| Layer      | Files                                                                 | Run                                                                                        |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unit / API | `*.test.ts` next to source in `packages/*`, `apps/api`, `apps/worker` | `npm test` (all Vitest projects), `npx vitest run --project @helpdesk/api`, or a file path |
| Component  | `*.test.tsx` next to the component in `apps/web/src`                  | `npx vitest run --project @helpdesk/web`                                                   |
| End-to-end | `e2e/tests/*.spec.ts`                                                 | `npm run test:e2e` (needs local PostgreSQL), written by the `e2e-tester` subagent          |

Vitest project names are the package names (`@helpdesk/shared`, `@helpdesk/api`, `@helpdesk/worker`, `@helpdesk/web`). Vitest globals are off: import `describe`/`it`/`expect`/`vi` from `vitest`. After writing a test, break the code it covers once and check that the test fails.

### Unit tests

- Pure logic (Zod schemas and helpers in `packages/shared`, worker processors, small API helpers) gets plain unit tests with real inputs and no mocks. Pass inputs as arguments rather than reading globals, e.g. `parseEnv(schema, source)` takes the env object (see `packages/shared/src/env.test.ts`, `apps/worker/src/processors/maintenance.test.ts`).
- Cover the success path, each validation or error branch, and edge values (empty, boundary, wrong type). One behavior per `it`, named for the behavior (`'throws listing every invalid variable'`).
- Tests must not import a module that parses `process.env` or opens connections on import (`src/env.ts`, `src/db.ts`); pass config to factories (`createAuth`, `createApp`) instead.
- API route tests use supertest against `createApp` with no database or real session: `vi.spyOn(auth.api, 'getSession')` to sign in as a role and `vi.spyOn(prisma.user, 'findMany')` (etc.) to stub queries, with `vi.restoreAllMocks()` in `afterEach` (see `apps/api/src/app.test.ts`). Check status codes for each role (401 signed out, 403 wrong role) and that responses never include secrets like password hashes or `tokenHash`.
- Array-form `prisma.$transaction([...])`: stub `$transaction` and spy the queries inside with `mockReturnValue` (Prisma queries are lazy, so they never run) to assert their arguments (see `apps/api/src/inbound-email/ingest.test.ts`). Callback-form transactions: `mockImplementation((fn) => fn(prisma))`.

### Component tests

The main way to test the web app. Every new or changed page, dialog, form or table gets a `*.test.tsx` next to it covering its states and interactions: rendering from API data, pending/empty/error states, form validation messages, submitting (request method, path and body), server errors, and role-dependent UI. They are fast, need no database or servers, and run in CI.

- Vitest in jsdom via `apps/web/vitest.config.ts`, which merges `vite.config.ts` (so `@/` works; import it with the `.ts` extension or Vite warns). React Testing Library + jest-dom matchers are loaded in `src/test/setup.ts`, which also runs `cleanup` because globals are off.
- Render inside a fresh `QueryClient` with `retry: false`. Stub `fetch` with `vi.spyOn(globalThis, 'fetch')` (e.g. `Response.json(body, { status })`) rather than mocking `apiGet`, so the request path and error handling are tested too.
- Query by role, label or text, as a user would. Cover the pending (skeleton, `role="status"`), success, and error (`role="alert"`) states (see `src/pages/users-page.test.tsx`).

### End-to-end tests

Write e2e tests only when necessary: for behavior that only shows up with the real API, database, cookies and browser together, which component and API tests (with stubbed `fetch`/Prisma) can't prove. Keep specs to happy paths; edge cases and error branches belong in unit, API or component tests.

When to write e2e tests:

- Auth and sessions: sign-in/out, cookies, redirects, deactivated or deleted users locked out mid-session.
- Role access end to end: an Agent can't reach Admin pages or APIs.
- A critical flow across layers, e.g. an email posted to the webhook appears on `/tickets`, or an Admin-created user can sign in.

Not for: layout, form validation messages, loading/empty/error states, or one component's behavior. Those get component tests.

Hand e2e work to the `e2e-tester` subagent (`.claude/agents/e2e-tester.md`) instead of writing specs inline. This covers adding specs for a new flow, fixing failing or flaky specs, and checking a flow in a real browser.

- In the prompt, name the flows and roles to cover (Admin, Agent), the pages and API routes involved, and whether it may change app code. By default it only edits `e2e/`.
- When it reports app bugs, relay them to the user and fix them here, then have it re-run the affected specs.
- After a feature, add component tests yourself first; only suggest an e2e spec through the agent when the change matches "When to write e2e tests" above.
- The e2e setup (database reset, `TEST_USERS`, ports, env isolation, test-writing rules) is documented only in the agent file. Read it before changing anything in `e2e/` yourself.

## Authentication (Better Auth)

- `apps/api/src/auth.ts` `createAuth(config, prisma)` is the single Better Auth config; the seed script reuses it. Handler is mounted at `/api/auth/*splat` **before** `express.json()` (it parses its own bodies).
- Prisma models `User`, `Session`, `Account`, `Verification` are Better Auth's tables. Session fields are renamed (`token` → `tokenHash`, `updatedAt` → `lastSeenAt`), and `generateId: false` lets Prisma's `uuid(7)` defaults create ids. Passwords live in `Account` (`providerId: 'credential'`), hashed with Better Auth's scrypt (`(await auth.$context).password.hash`).
- User extra fields `role` and `isActive` are declared in `auth.ts` `user.additionalFields` **and** mirrored in `apps/web/src/lib/auth-client.ts` (`inferAdditionalFields`) — keep them in sync.
- Deactivated users are blocked twice: a `session.create.before` hook refuses sign-in, and `requireAuth(auth)` returns 401. `requireAuth` puts `res.locals.user` / `res.locals.session` (typed via `Express.Locals`). Gap: Better Auth's own `/api/auth/*` endpoints (`change-password`, `update-user`, …) don't go through `requireAuth`, and deactivation doesn't delete sessions yet (plan 2.4). Changing a password via `PATCH /api/users/:id` deletes the user's sessions (except the editing Admin's current one); any new password path must do the same.
- Users are soft-deleted (`User.deletedAt`), never removed: `DELETE /api/users/:id` sets `deletedAt` **and** `isActive: false` and deletes their sessions, so the deactivation guards above lock them out (the sign-in hook also checks `deletedAt`). Admins can't be deleted. Every user query must filter `deletedAt: null` (list, edit and delete 404 for deleted users). The email stays unique, so it can't be reused; seeding an email brings that user back.
- Rate limiting is on only in production: `createAuth` takes an explicit `rateLimit` flag, which `index.ts` sets to `NODE_ENV === 'production'` (dev, tests and e2e sign in without 429s). A production deploy must set `NODE_ENV=production` or it runs without brute-force protection. It keys on `X-Forwarded-For`; with no header everyone shares one bucket (~3 sign-ins per 10 s). Trusted-proxy config and a per-email limit are still pending (plan 1.9).
- Sign-up is disabled, so users are created server-side via `upsertUser` (`apps/api/src/seed-admin.ts`), not the sign-up endpoint. The API seeds the first Admin on startup only when no users exist.
- Web: use `authClient` from `@/lib/auth-client` (`signIn.email`, `signOut`), but read the session with `useActiveSession()` from the same file, never `authClient.useSession()`: Better Auth's get-session ignores `isActive`, so the hook treats a deactivated user as signed out (otherwise they keep seeing the app, and `LoginPage`/`RequireAuth` would redirect-loop). Wrap protected routes in `<RequireAuth>` (redirects to `/login` with `state.from`). Same-origin `/api` via the Vite proxy is what makes the cookie work — don't add CORS or an absolute API base URL.
- Roles: protect API routes with `requireAuth(auth), requireRole('ADMIN')` (403 for other roles), e.g. `app.use('/api/users', …, usersRouter(auth, prisma))`. In the web app, nest Admin-only routes under the `<RequireRole role="ADMIN" />` layout route (non-Admins go to `/`) and hide their nav links in `app-header.tsx`. The web check is only UX; the API check is the real guard.
- Forms: react-hook-form + `zodResolver` with the schema from `@helpdesk/shared`, rendered with `Controller` and shadcn `Field`/`FieldError`; server errors go to `form.setError('root', …)`.

## Inbound email (tickets)

- No email provider yet. `POST /api/webhooks/inbound-email` takes a provider-neutral JSON email (`inboundEmailSchema` in `packages/shared/src/inbound-email.ts`: `messageId`, `from { email, name? }`, `subject`, `text`, `html?`, `inReplyTo?`, `references` (string or array), `headers`). A future Postmark/SendGrid adapter only maps its payload to this shape.
- Auth is `Authorization: Bearer $INBOUND_EMAIL_SECRET` (constant-time compare), not a session. The route is mounted before the app-wide `express.json()` and checks the secret before parsing its own 10 MB body.
- `ingestInboundEmail` (`apps/api/src/inbound-email/ingest.ts`) runs in the request, no queue: auto-replies/bounces are ignored (`detectAutoReply`), a known `emailMessageId` is a duplicate (also on a P2002 race), a reply whose `In-Reply-To`/`References` match a message of a non-Closed ticket **from that ticket's customer** is appended (Resolved → Open), anything else creates a ticket. Responses: 201 `created`, 200 `appended`/`duplicate`/`ignored`.
- Message ids are stored without `<>` (`normalizeMessageId`). HTML bodies are stored sanitized (`sanitizeEmailHtml`: no scripts, styles, event handlers, images; links get `rel="noopener noreferrer nofollow"`); `bodyText` falls back to `htmlToText`. Still render bodies as text or through the sanitizer, never raw.
- `GET /api/tickets` (any signed-in role) is sorted and paginated on the server (see Tables under Conventions); the web Tickets page is `src/pages/tickets-page.tsx`.
- Local test:

  ```sh
  curl -X POST localhost:3000/api/webhooks/inbound-email \
    -H "Authorization: Bearer $INBOUND_EMAIL_SECRET" -H "Content-Type: application/json" \
    -d '{"messageId":"<a1@cust.test>","from":{"email":"jane@cust.test"},"subject":"Help","text":"Hi"}'
  ```

  Without a provider, nothing calls the webhook on its own: curl (or a test) stands in for it. e2e covers it in `e2e/tests/tickets.spec.ts` with `E2E_INBOUND_EMAIL_SECRET` from `test-env.ts`.

## Conventions

- `@helpdesk/shared` exports **TypeScript source** (no build step). Vite/tsx compile it; tsdown bundles it into api/worker (`deps.alwaysBundle`).
- The shared root export (`@helpdesk/shared`) must stay **browser-safe**. Node-only code goes in a subpath export (e.g. `@helpdesk/shared/env`) added to `packages/shared/package.json` `exports`.
- Domain enums (`USER_ROLES`, `TICKET_STATUSES`, `TICKET_CATEGORIES`) and queue names live only in `packages/shared` — never redefine them in apps.
- Ticket statuses and categories are defined by their label maps in `packages/shared/src/domain.ts` (`TICKET_STATUS_LABELS`, `TICKET_CATEGORY_LABELS`, `as const`): the keys are the type (`TicketStatus = keyof typeof TICKET_STATUS_LABELS`), and the list (`keysOf(...)`), Zod schema and enum-like object are derived from them. To add a value, add one label entry, then the matching value to the Prisma enum in `schema.prisma` and migrate (the Prisma enums are a separate copy). Show labels via the map, e.g. `TICKET_CATEGORY_LABELS[ticket.category]`.
- Env vars are validated with Zod via `parseEnv` in each app's `src/env.ts`; add new variables there and to `.env.example`. Dev scripts load the root `.env` with `--env-file-if-exists`. Production-only rules go in a `.superRefine` on the schema (see `apps/api/src/env.ts`). `src/env.ts` and `src/db.ts` parse `process.env` on import and tests have no `.env`, so tests must not import them — pass config to factories (`createAuth`, `createApp`) instead.
- Don't let a security control depend on `NODE_ENV` defaults: Better Auth (default-secret check) and Express (stack traces in error responses) silently weaken when it isn't `production`. Set them explicitly.
- TypeScript: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no TS `enum` — use `as const` arrays + `z.enum`, and the schema's `.enum` for enum-like access, e.g. `UserRole.AGENT`; no constructor parameter properties). Extensionless relative imports (bundler resolution).
- API routes are `Router` factories taking their dependencies (`usersRouter(auth, prisma)`), mounted in `createApp`. Response body types come from `@helpdesk/shared`; send dates as ISO strings. Errors: just throw (Express 5 forwards async rejections); the final error handler in `createApp` logs and returns `{ error: 'Internal Server Error' }` (500), keeping exposed 4xx errors like bad JSON. Mount new routes before it.
- Web data fetching: TanStack Query (`useQuery`, provider in `main.tsx`) with `apiGet<T>(path)` from `@/lib/api` (relative `/api` path, throws `ApiError` with `status`). Writes use `useMutation` with `apiPost<T>(path, body)`; in `onSuccess`, await `invalidateQueries` for the affected list (so `isPending` covers the refetch) and confirm with a Sonner `toast` (`<Toaster>` is in `main.tsx`). Handle pending and error states on every page: while pending, show a shadcn `Skeleton` shaped like the content (e.g. real table headers with placeholder rows) inside `role="status"` with an `sr-only` "Loading…" label, not a text message; show errors in a `role="alert"` element.
- Tables: `DataTable` (`apps/web/src/components/data-table.tsx`) uses TanStack Table **v9** (`useTable` + `tableFeatures({ rowSortingFeature })`, not v8's `useReactTable`). Sorting is **server-side only** (`manualSorting`): a column sorts if it has a `sortField` from the API's field union (e.g. `TicketSortField`); header clicks cycle sort → flip → remove (`sortDescFirst` columns start descending); the page keeps a `Sort | undefined` in state (`undefined` = the API's default order, no params sent), puts it in the query key and builds the request with `listQueryString({ sort, page })`, with `placeholderData: keepPreviousData`. The API parses it with a `sortQuerySchema` from `@helpdesk/shared` (400 for unknown fields) and maps each field to a fixed Prisma `orderBy` plus `id` as tie-breaker. Never sort rows in the browser.
- Pagination is server-side too (`rowPaginationFeature`, `manualPagination`): pass `DataTable` `page`, `total` and `onPageChange` and it renders "Rows per page" (`PAGE_SIZES` 10/25/50/100), the range, "Page X of Y" and first/previous/next/last. The API extends its query schema with `paginationQueryShape` (`?page=&pageSize=`, 1-based, default 25), runs `findMany` (`skip`/`take`) and `count` in one `RepeatableRead` transaction, and returns `{ rows, total, page, pageSize }`. The page resets to 1 on a new sort or page size and clamps to the last page when rows disappear. Only the Tickets table is paginated so far.
- **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`). Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same version. npm's `latest` tag for the `prisma` CLI points to an 8.x release candidate, so always install with an explicit version (e.g. `prisma@7.10.0`).
- Import the client and model types from `@helpdesk/db`, never from `./generated` paths or `@prisma/client`. Each app creates its own client in `src/db.ts` from its validated env.
- Schema: models PascalCase, tables snake_case plural via `@@map`, ids `@default(uuid(7)) @db.Uuid`, timestamps `@db.Timestamptz(3)`. Columns keep the camelCase field names (no `@map`), so raw SQL must quote them (`"ticketId"`, `"customerEmail"`). Change the schema, then run `npm run db:migrate -- --name <change>`; commit the migration folder.
- api/worker builds (tsdown) bundle `@helpdesk/*` and keep npm packages external (`deps.neverBundle` regex) — don't bundle `pg`/Prisma runtime.
- Add shadcn components with `npx shadcn@latest add <name>` from `apps/web`; don't hand-write them. Utilities come from the `cn` package (shadcn's).
- Global styles go in `@layer base` in `apps/web/src/index.css`. Tailwind's preflight already resets most browser defaults; `index.css` also covers autofill, `color-scheme`, number spinners and the search clear button. Base-layer rules lose to utility classes on components (e.g. the shadcn `Input`'s `transition-colors`), so a global override of a property a component sets needs `!important`.
- Prettier: single quotes, print width 100.

## Product decisions (see project-scope.md)

- Roles: `ADMIN`, `AGENT`. First Admin is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; only Admins manage users.
- Ticket statuses: `OPEN`, `RESOLVED`, `CLOSED`. Categories: `GENERAL`, `TECHNICAL`, `REFUND` (one per ticket).
- Auth: Better Auth (email + password, sign-up disabled) with database sessions in PostgreSQL and a signed httpOnly cookie, not JWT. Protect routes with `requireAuth(auth)`. Redis is for the job queue only.
- AI drafts replies; an Agent approves and sends (no auto-send in the first release).
- Claude models: `claude-haiku-5-5` for classification, `claude-sonnet-5-5` for summaries/reply drafts.

## Environment

Use npm only (`package-lock.json`); Bun and other package managers aren't installed or supported. In the user's PowerShell, `npm.ps1` needs the `CurrentUser` execution policy `RemoteSigned` (already set); if "running scripts is disabled" comes back, use `npm.cmd`.

Windows; Docker Desktop is not installed, so Redis may be unavailable locally. PostgreSQL 17 runs natively as the auto-start Windows service `postgresql-17` (binaries and data in `C:\Users\pchat\postgres17`) on `localhost:5432`, with the same `helpdesk`/`helpdesk` user and database as `docker-compose.yml` (superuser `postgres`/`postgres`), with `timezone = 'UTC'` (Prisma's pg adapter sends timestamps without an offset, so a non-UTC server timezone shifts every stored time). Avoid `npx prisma dev` for this project: it is PGlite, serves only `template1` (breaks shadow databases and DataGrip).
