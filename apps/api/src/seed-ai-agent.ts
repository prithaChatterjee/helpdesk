// Creates the "AI" Agent that new tickets are assigned to while the AI tries to auto-resolve them,
// or restores it (active, not deleted). It has no password, so nobody can sign in as it. Run with
// `npm run db:seed:ai-agent`. Safe to run again.
import { AI_AGENT, upsertAiAgent } from '@helpdesk/db';
import { prisma } from './db';

try {
  const id = await upsertAiAgent(prisma);
  console.log(`AGENT ${AI_AGENT.name} <${AI_AGENT.email}> ready (${id})`);
} finally {
  await prisma.$disconnect();
}
