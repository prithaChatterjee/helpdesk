import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_AGENT, findAiAgentId, unassignFromAiAgent, upsertAiAgent } from './ai-agent';
import { createPrismaClient } from './client';

// Prisma connects lazily, so stubbed queries need no running Postgres
const prisma = createPrismaClient('postgresql://unused:unused@localhost:1/unused');
const aiAgentId = '0199a000-0000-7000-8000-0000000000ff';
const ticketId = '0199a000-0000-7000-8000-0000000000a1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('upsertAiAgent', () => {
  it('creates an active, passwordless AGENT named AI, or restores it', async () => {
    const upsert = vi.spyOn(prisma.user, 'upsert').mockResolvedValue({ id: aiAgentId } as never);

    await expect(upsertAiAgent(prisma)).resolves.toBe(aiAgentId);

    expect(upsert).toHaveBeenCalledWith({
      where: { email: 'ai@helpdesk.example' },
      create: {
        name: 'AI',
        email: 'ai@helpdesk.example',
        role: 'AGENT',
        isActive: true,
        emailVerified: true,
      },
      update: { name: 'AI', role: 'AGENT', isActive: true, deletedAt: null },
      select: { id: true },
    });
    // No password: nobody can sign in as the AI Agent
    expect(JSON.stringify(upsert.mock.calls[0])).not.toMatch(/password|accounts/i);
  });
});

describe('findAiAgentId', () => {
  it('finds only an active, not deleted AI Agent', async () => {
    const findFirst = vi
      .spyOn(prisma.user, 'findFirst')
      .mockResolvedValue({ id: aiAgentId } as never);

    await expect(findAiAgentId(prisma)).resolves.toBe(aiAgentId);

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: AI_AGENT.email, isActive: true, deletedAt: null },
      select: { id: true },
    });
  });

  it('returns undefined when there is none', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    await expect(findAiAgentId(prisma)).resolves.toBeUndefined();
  });
});

describe('unassignFromAiAgent', () => {
  it('unassigns only while the ticket is still assigned to the AI Agent', async () => {
    const execute = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as never);

    await expect(unassignFromAiAgent(prisma, ticketId, aiAgentId)).resolves.toBe(true);

    const [sql, ...values] = execute.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(sql.join('?').replace(/\s+/g, ' ').trim()).toBe(
      'UPDATE tickets SET "assignedToId" = NULL WHERE id = ?::uuid AND "assignedToId" = ?::uuid',
    );
    expect(values).toEqual([ticketId, aiAgentId]);
  });

  it('reports false when someone else was assigned meanwhile', async () => {
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as never);

    await expect(unassignFromAiAgent(prisma, ticketId, aiAgentId)).resolves.toBe(false);
  });
});
