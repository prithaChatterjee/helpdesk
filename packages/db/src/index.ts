// Node-only package: never import from apps/web.
export { createPrismaClient } from './client';
export * from './generated/prisma/client';
