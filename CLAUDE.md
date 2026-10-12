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

| Path              | What                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 19 + Vite + Tailwind 4 + shadcn/ui (radix-nova) + React Router 8. `@/` alias → `src/`; pages in `src/pages/`                                                      |
| `apps/api`        | Express 5 REST API. All routes under `/api/*`. `createApp(auth, prisma)` in `app.ts` is separate from `index.ts` (listen) for supertest; route modules in `src/routes/` |
| `apps/worker`     | BullMQ consumers; processors in `src/processors/`                                                                                                                       |
| `packages/shared` | Zod schemas (form schemas like `signInSchema`, API response types like `UserListResponse`), enums (roles, ticket statuses, categories), queue names                     |
| `packages/db`     | Prisma 7 schema, migrations, generated client (`src/generated/`, gitignored), `createPrismaClient()`. Node-only                                                         |

## Commands

```sh
docker compose up -d   # PostgreSQL :5432, Redis :6379
npm run dev            # api :3000, worker, web :5173 (Vite proxies /api → :3000)
npm test               # Vitest (projects: packages/*, apps/api, apps/worker)
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

Every seed run also re-saves the Admin (role, active, password reset to `ADMIN_PASSWORD`).

Before finishing a task, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run format:check`. CI (`.github/workflows/ci.yml`) also runs `npm run build`.

Project subagent: `api-reviewer` (`.claude/agents/api-reviewer.md`) reviews API route changes for auth, role checks, validation, data exposure and tests. Read-only; use it before committing API work when asked.

## Authentication (Better Auth)

- `apps/api/src/auth.ts` `createAuth(config, prisma)` is the single Better Auth config; the seed script reuses it. Handler is mounted at `/api/auth/*splat` **before** `express.json()` (it parses its own bodies).
- Prisma models `User`, `Session`, `Account`, `Verification` are Better Auth's tables. Session fields are renamed (`token` → `tokenHash`, `updatedAt` → `lastSeenAt`), and `generateId: false` lets Prisma's `uuid(7)` defaults create ids. Passwords live in `Account` (`providerId: 'credential'`), hashed with Better Auth's scrypt (`(await auth.$context).password.hash`).
- User extra fields `role` and `isActive` are declared in `auth.ts` `user.additionalFields` **and** mirrored in `apps/web/src/lib/auth-client.ts` (`inferAdditionalFields`) — keep them in sync.
- Deactivated users are blocked twice: a `session.create.before` hook refuses sign-in, and `requireAuth(auth)` returns 401. `requireAuth` puts `res.locals.user` / `res.locals.session` (typed via `Express.Locals`).
- Sign-up is disabled, so users are created server-side via `upsertUser` (`apps/api/src/seed-admin.ts`), not the sign-up endpoint. The API seeds the first Admin on startup only when no users exist.
- Web: use `authClient` from `@/lib/auth-client` (`useSession`, `signIn.email`, `signOut`). Wrap protected routes in `<RequireAuth>` (redirects to `/login` with `state.from`). Same-origin `/api` via the Vite proxy is what makes the cookie work — don't add CORS or an absolute API base URL.
- Roles: protect API routes with `requireAuth(auth), requireRole('ADMIN')` (403 for other roles), e.g. `app.use('/api/users', …, usersRouter(prisma))`. In the web app, nest Admin-only routes under the `<RequireRole role="ADMIN" />` layout route (non-Admins go to `/`) and hide their nav links in `app-header.tsx`. The web check is only UX; the API check is the real guard.
- Forms: react-hook-form + `zodResolver` with the schema from `@helpdesk/shared`, rendered with `Controller` and shadcn `Field`/`FieldError`; server errors go to `form.setError('root', …)`.

## Conventions

- `@helpdesk/shared` exports **TypeScript source** (no build step). Vite/tsx compile it; tsdown bundles it into api/worker (`deps.alwaysBundle`).
- The shared root export (`@helpdesk/shared`) must stay **browser-safe**. Node-only code goes in a subpath export (e.g. `@helpdesk/shared/env`) added to `packages/shared/package.json` `exports`.
- Domain enums (`USER_ROLES`, `TICKET_STATUSES`, `TICKET_CATEGORIES`) and queue names live only in `packages/shared` — never redefine them in apps.
- Env vars are validated with Zod via `parseEnv` in each app's `src/env.ts`; add new variables there and to `.env.example`. Dev scripts load the root `.env` with `--env-file-if-exists`.
- TypeScript: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no TS `enum` — use `as const` arrays + `z.enum`; no constructor parameter properties). Extensionless relative imports (bundler resolution).
- Tests sit next to source as `*.test.ts`. API tests need no database or real session: `vi.spyOn(auth.api, 'getSession')` to sign in as a role and `vi.spyOn(prisma.user, 'findMany')` (etc.) to stub queries, with `vi.restoreAllMocks()` in `afterEach` (see `apps/api/src/app.test.ts`).
- API routes are `Router` factories taking their dependencies (`usersRouter(prisma)`), mounted in `createApp`. Response body types come from `@helpdesk/shared`; send dates as ISO strings.
- Web data fetching: TanStack Query (`useQuery`, provider in `main.tsx`) with `apiGet<T>(path)` from `@/lib/api` (relative `/api` path, throws `ApiError` with `status`). Handle pending and error states on every page.
- **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`). Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same version. npm's `latest` tag for the `prisma` CLI points to an 8.x release candidate, so always install with an explicit version (e.g. `prisma@7.10.0`).
- Import the client and model types from `@helpdesk/db`, never from `./generated` paths or `@prisma/client`. Each app creates its own client in `src/db.ts` from its validated env.
- Schema: models PascalCase, tables snake_case plural via `@@map`, ids `@default(uuid(7)) @db.Uuid`, timestamps `@db.Timestamptz(3)`. Change the schema, then run `npm run db:migrate -- --name <change>`; commit the migration folder.
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

Windows; Docker Desktop is not installed, so Redis may be unavailable locally. PostgreSQL 17 runs natively as the auto-start Windows service `postgresql-17` (binaries and data in `C:\Users\pchat\postgres17`) on `localhost:5432`, with the same `helpdesk`/`helpdesk` user and database as `docker-compose.yml` (superuser `postgres`/`postgres`), with `timezone = 'UTC'` (Prisma's pg adapter sends timestamps without an offset, so a non-UTC server timezone shifts every stored time). Avoid `npx prisma dev` for this project: it is PGlite, serves only `template1` (breaks shadow databases and DataGrip).
