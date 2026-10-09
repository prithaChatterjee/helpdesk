import type { PrismaClient } from '@helpdesk/db';
import type { Auth } from './auth';

/** Creates the first Admin from ADMIN_EMAIL / ADMIN_PASSWORD when no users exist. */
export async function seedAdmin(
  auth: Auth,
  prisma: PrismaClient,
  admin: { email: string; password: string },
) {
  if ((await prisma.user.count()) > 0) return;

  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(admin.password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: 'Admin', email: admin.email.toLowerCase(), emailVerified: true, role: 'ADMIN' },
    });
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });
  });

  console.log(`Seeded admin user ${admin.email}`);
}
