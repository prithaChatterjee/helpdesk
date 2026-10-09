# Helpdesk

AI-assisted support ticket system. See `project-scope.md`, `tech-stack.md` and `implementation-plan.md`.

## Structure

| Path              | What                                                       |
| ----------------- | ---------------------------------------------------------- |
| `apps/web`        | React + Vite + Tailwind + shadcn/ui frontend               |
| `apps/api`        | Express REST API (`/api/*`)                                |
| `apps/worker`     | BullMQ background job consumers                            |
| `packages/shared` | Shared Zod schemas, enums, queue names (TypeScript source) |
| `packages/db`     | Prisma schema, migrations and client (Node-only)           |

## Requirements

- Node.js 24+
- Docker Desktop (for local PostgreSQL and Redis)

## Local setup

```sh
npm install
cp .env.example .env        # then adjust values
docker compose up -d        # PostgreSQL on :5432, Redis on :6379
npm run db:deploy           # apply database migrations
npm run dev                 # api :3000, web :5173, worker
```

Open http://localhost:5173. In development, Vite proxies `/api` to the API so the app and API share one origin (required for session cookies).

## Scripts

| Command             | Does                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Run api, worker and web with hot reload |
| `npm run build`     | Build all apps                          |
| `npm test`          | Run all Vitest projects                 |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | TypeScript in every workspace           |
| `npm run format`    | Prettier                                |

## Notes

- `@helpdesk/shared` exports TypeScript source. Vite and `tsx` compile it directly; `tsdown` bundles it into the api/worker builds.
- Node-only shared code is imported from subpaths (e.g. `@helpdesk/shared/env`) so it never reaches the browser bundle.
- Environment variables are validated with Zod at startup; the process exits with a list of every invalid variable.
