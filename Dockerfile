# One image for both Railway services (api, worker); each service picks its start command in
# railway/<service>.json. The api also serves the built web app (apps/web/dist).

FROM node:24-slim AS build
WORKDIR /app

# The web build reads these (Railway passes service variables to the matching build args).
# NODE_ENV stays unset here: with NODE_ENV=production, npm ci would skip the build tools.
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT

COPY . .
# postinstall runs prisma generate (needs packages/db/prisma, hence COPY . . first)
RUN npm ci
RUN npm run build
# Runtime needs only production dependencies (prisma CLI included, for migrate deploy)
RUN npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
CMD ["node", "apps/api/dist/index.mjs"]
