# Helpdesk

AI-assisted support ticket system: receives support emails, AI classifies/summarizes/drafts replies, Agents review and send.

Planning docs (read before starting a phase):

- `project-scope.md` — features, decisions, open questions
- `tech-stack.md` — stack and database-session auth design
- `implementation-plan.md` — phased task list; tick `- [x]` when a task is done

## Documentation lookup

**Always use Context7 (`mcp__context7__resolve-library-id` → `mcp__context7__query-docs`) to fetch up-to-date docs before writing or changing code that uses a library, framework, CLI, or SDK** — even well-known ones. Versions in this repo are newer than most training data (e.g. Vitest 5, ESLint 10, TypeScript 6, Zod 4, Express 5, Vite 8, Tailwind 4, shadcn 4, tsdown, BullMQ 6, Prisma). Prefer Context7 over web search for library docs. Check the installed version in `package.json` and query that version when Context7 lists it.

## Structure

npm workspaces monorepo, TypeScript everywhere, ESM (`"type": "module"`).

| Path              | What                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 19 + Vite + Tailwind 4 + shadcn/ui (radix-nova). `@/` alias → `src/`                                                  |
| `apps/api`        | Express 5 REST API. All routes under `/api/*`. `createApp()` in `app.ts` is separate from `index.ts` (listen) for supertest |
| `apps/worker`     | BullMQ consumers; processors in `src/processors/`                                                                           |
| `packages/shared` | Zod schemas, enums (roles, ticket statuses, categories), queue names                                                        |
| `packages/db`     | Prisma 7 schema, migrations, generated client (`src/generated/`, gitignored), `createPrismaClient()`. Node-only             |

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
npm run db:studio      # Prisma Studio
```

Before finishing a task, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run format:check`.

## Conventions

- `@helpdesk/shared` exports **TypeScript source** (no build step). Vite/tsx compile it; tsdown bundles it into api/worker (`deps.alwaysBundle`).
- The shared root export (`@helpdesk/shared`) must stay **browser-safe**. Node-only code goes in a subpath export (e.g. `@helpdesk/shared/env`) added to `packages/shared/package.json` `exports`.
- Domain enums (`USER_ROLES`, `TICKET_STATUSES`, `TICKET_CATEGORIES`) and queue names live only in `packages/shared` — never redefine them in apps.
- Env vars are validated with Zod via `parseEnv` in each app's `src/env.ts`; add new variables there and to `.env.example`. Dev scripts load the root `.env` with `--env-file-if-exists`.
- TypeScript: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no TS `enum` — use `as const` arrays + `z.enum`). Extensionless relative imports (bundler resolution).
- Tests sit next to source as `*.test.ts`.
- **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`). Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same version. npm's `latest` tag for the `prisma` CLI points to an 8.x release candidate, so always install with an explicit version (e.g. `prisma@7.10.0`).
- Import the client and model types from `@helpdesk/db`, never from `./generated` paths or `@prisma/client`. Each app creates its own client in `src/db.ts` from its validated env.
- Schema: models PascalCase, tables snake_case plural via `@@map`, ids `@default(uuid(7)) @db.Uuid`, timestamps `@db.Timestamptz(3)`. Change the schema, then run `npm run db:migrate -- --name <change>`; commit the migration folder.
- api/worker builds (tsdown) bundle `@helpdesk/*` and keep npm packages external (`deps.neverBundle` regex) — don't bundle `pg`/Prisma runtime.
- Add shadcn components with `npx shadcn@latest add <name>` from `apps/web`; don't hand-write them. Utilities come from the `cn` package (shadcn's).
- Prettier: single quotes, print width 100.

## Product decisions (see project-scope.md)

- Roles: `ADMIN`, `AGENT`. First Admin is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; only Admins manage users.
- Ticket statuses: `OPEN`, `RESOLVED`, `CLOSED`. Categories: `GENERAL`, `TECHNICAL`, `REFUND` (one per ticket).
- Auth: Better Auth (email + password, sign-up disabled) with database sessions in PostgreSQL and a signed httpOnly cookie, not JWT. Protect routes with `requireAuth(auth)`. Redis is for the job queue only.
- AI drafts replies; an Agent approves and sends (no auto-send in the first release).
- Claude models: `claude-haiku-5-5` for classification, `claude-sonnet-5-5` for summaries/reply drafts.

## Environment

Windows; Docker Desktop is not installed, so Redis may be unavailable locally. PostgreSQL 17 runs natively as the auto-start Windows service `postgresql-17` (binaries and data in `C:\Users\pchat\postgres17`) on `localhost:5432`, with the same `helpdesk`/`helpdesk` user and database as `docker-compose.yml` (superuser `postgres`/`postgres`), with `timezone = 'UTC'` (Prisma's pg adapter sends timestamps without an offset, so a non-UTC server timezone shifts every stored time). Avoid `npx prisma dev` for this project: it is PGlite, serves only `template1` (breaks shadow databases and DataGrip).
