import type { PrismaClient } from '@helpdesk/db';
import { USER_ROLES } from '@helpdesk/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';

export interface AuthConfig {
  secret: string;
  baseURL: string;
  webOrigin: string;
  // Per-IP rate limiting on the auth endpoints; the API enables it only in production
  rateLimit: boolean;
}

export function createAuth(config: AuthConfig, prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.webOrigin],
    // Users are created by Admins (and the seeded first Admin), never by public sign-up
    emailAndPassword: { enabled: true, disableSignUp: true },
    // Set explicitly rather than relying on Better Auth's own NODE_ENV-based default
    rateLimit: { enabled: config.rateLimit },
    user: {
      additionalFields: {
        role: { type: [...USER_ROLES], required: false, defaultValue: 'AGENT', input: false },
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
      },
    },
    session: {
      fields: { token: 'tokenHash', updatedAt: 'lastSeenAt' },
    },
    advanced: {
      // Let Prisma's uuid(7) defaults generate ids
      database: { generateId: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { isActive: true },
            });
            if (!user?.isActive) {
              throw new APIError('FORBIDDEN', { message: 'Account is deactivated' });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
