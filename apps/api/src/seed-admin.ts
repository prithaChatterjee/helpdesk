import type { PrismaClient, UserRole } from '@helpdesk/db';
import type { Auth } from './auth';

interface SeedUser {
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Creates the user, or brings an existing user with that email up to date
 * (role, active, password reset). Safe to run repeatedly.
 */
export async function upsertUser(
  auth: Auth,
  prisma: PrismaClient,
  seed: SeedUser,
): Promise<'created' | 'updated'> {
  const email = seed.email.toLowerCase();
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(seed.password);
  const name = seed.role === 'ADMIN' ? 'Admin' : (email.split('@')[0] ?? email);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { role: seed.role, isActive: true, deletedAt: null },
        })
      : await tx.user.create({ data: { name, email, emailVerified: true, role: seed.role } });

    const credential = await tx.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    });
    if (credential) {
      await tx.account.update({ where: { id: credential.id }, data: { password: passwordHash } });
    } else {
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });
    }

    return existing ? 'updated' : 'created';
  });
}

/** On API startup: creates the first Admin when no users exist. */
export async function seedAdmin(
  auth: Auth,
  prisma: PrismaClient,
  admin: { email: string; password: string },
) {
  if ((await prisma.user.count()) > 0) return;
  await upsertUser(auth, prisma, { ...admin, role: 'ADMIN' });
  console.log(`Seeded admin user ${admin.email}`);
}
