# Helpdesk

AI-assisted support ticket system. See `project-scope.md`, `tech-stack.md` and `implementation-plan.md`.

## Structure

| Path              | What                                                       |
| ----------------- | ---------------------------------------------------------- |
| `apps/web`        | React + Vite + Tailwind + shadcn/ui frontend               |
| `apps/api`        | Express REST API (`/api/*`)                                |
| `apps/worker`     | pg-boss (and BullMQ) background job consumers              |
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

## Deploying to Railway

One Docker image (`Dockerfile`) runs as two Railway services. The api also serves the built web app,
so the browser, `/api` and the session cookie share one origin (no CORS).

| Service    | Config file            | Does                                                                             |
| ---------- | ---------------------- | -------------------------------------------------------------------------------- |
| `api`      | `/railway/api.json`    | Runs migrations (pre-deploy), then the API + web app; health check `/api/health` |
| `worker`   | `/railway/worker.json` | pg-boss jobs: AI classification/auto-resolve, sending email                      |
| PostgreSQL | Railway database       | Tickets, sessions and the pg-boss job queue                                      |

Redis is optional: nothing is queued on BullMQ yet, so skip it until a feature needs it.

1. Create a project, add **PostgreSQL**, then two services from this GitHub repo (`api`, `worker`).
2. In each service's **Settings**: leave Root Directory empty (the image needs the whole repo) and
   set **Config file path** to `/railway/api.json` or `/railway/worker.json`.
3. On `api`, **Networking → Generate Domain** (Railway terminates TLS; the API listens on `PORT`).
4. Variables. Generate secrets with `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`.

   **api**

   | Variable                                     | Value                                                                                                         |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                               | `${{Postgres.DATABASE_URL}}`                                                                                  |
   | `BETTER_AUTH_URL`, `WEB_ORIGIN`              | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (both the same: one origin)                                              |
   | `BETTER_AUTH_SECRET`, `INBOUND_EMAIL_SECRET` | two new random secrets                                                                                        |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD`              | the first Admin, created on first start when there are no users                                               |
   | optional                                     | `GOOGLE_GENERATIVE_AI_API_KEY`, `EMAIL_SENDING_ENABLED`, `SENTRY_DSN`, `VITE_SENTRY_DSN` (read at build time) |

   **worker**

   | Variable       | Value                                                                                                                                                    |
   | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`                                                                                                                             |
   | optional       | `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_REQUESTS_PER_MINUTE`, `EMAIL_SENDING_ENABLED` + `SENDGRID_API_KEY` + `SUPPORT_EMAIL`, `EMAIL_REPLY_TO`, `SENTRY_DSN` |

   The image sets `NODE_ENV=production`, which turns on sign-in rate limiting and rejects the
   `.env.example` secrets and non-https URLs.

5. Deploy. The api's pre-deploy step runs `prisma migrate deploy`; on first start it creates the Admin.
6. For auto-resolve, create the AI Agent once: `railway ssh -s api` then
   `npm run seed:ai-agent -w @helpdesk/api`.
7. SendGrid Inbound Parse: `https://<api domain>/api/webhooks/sendgrid/inbound?token=<INBOUND_EMAIL_SECRET>`.

Check the image locally with `docker build -t helpdesk .`.

## Notes

- `@helpdesk/shared` exports TypeScript source. Vite and `tsx` compile it directly; `tsdown` bundles it into the api/worker builds.
- Node-only shared code is imported from subpaths (e.g. `@helpdesk/shared/env`) so it never reaches the browser bundle.
- Environment variables are validated with Zod at startup; the process exits with a list of every invalid variable.
