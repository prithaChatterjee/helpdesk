import type { PrismaClient } from './generated/prisma/client';

/**
 * The "AI" Agent that new tickets are assigned to while the AI tries to auto-resolve them. A normal
 * AGENT user without a password (no credential account), so nobody can sign in as it. Created by
 * `npm run db:seed:ai-agent`; deactivating or deleting it turns the assignment off.
 */
export const AI_AGENT = {
  name: 'AI',
  email: 'ai@helpdesk.example',
} as const;

/** Creates the AI Agent, or brings it back (active, not deleted, role AGENT). Returns its id. */
export async function upsertAiAgent(prisma: PrismaClient): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: AI_AGENT.email },
    create: { ...AI_AGENT, role: 'AGENT', isActive: true, emailVerified: true },
    update: { name: AI_AGENT.name, role: 'AGENT', isActive: true, deletedAt: null },
    select: { id: true },
  });
  return user.id;
}

/** The AI Agent's id, or undefined when it doesn't exist or is deactivated or deleted. */
export async function findAiAgentId(prisma: PrismaClient): Promise<string | undefined> {
  const user = await prisma.user.findFirst({
    where: { email: AI_AGENT.email, isActive: true, deletedAt: null },
    select: { id: true },
  });
  return user?.id;
}

/**
 * Unassigns a ticket from the AI Agent, e.g. when the AI couldn't resolve it, so it shows as
 * unassigned for Agents. Leaves it alone when someone else was assigned meanwhile. A raw UPDATE, so
 * `updatedAt` stays: this isn't activity on the ticket. Returns whether it was unassigned.
 */
export async function unassignFromAiAgent(
  prisma: PrismaClient,
  ticketId: string,
  aiAgentId: string,
): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE tickets SET "assignedToId" = NULL
    WHERE id = ${ticketId}::uuid AND "assignedToId" = ${aiAgentId}::uuid`;
  return count > 0;
}
