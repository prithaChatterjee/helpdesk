import { createOpenAI } from '@ai-sdk/openai';
import { AI_MODEL, createReplyPolisher, createTicketSummarizer } from './routes/tickets';
import { createApp } from './app';
import { createAuth } from './auth';
import { prisma } from './db';
import { env } from './env';
import { seedAdmin } from './seed-admin';

const auth = createAuth(
  {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
    rateLimit: env.NODE_ENV === 'production',
  },
  prisma,
);

await seedAdmin(auth, prisma, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });

// Explicit key, so the provider never falls back to some other OPENAI_API_KEY source
const model = env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: env.OPENAI_API_KEY })(AI_MODEL)
  : undefined;
if (!model)
  console.warn('OPENAI_API_KEY is not set: polishing replies and summarizing tickets are disabled');
const ai = model && {
  replyPolisher: createReplyPolisher(model),
  ticketSummarizer: createTicketSummarizer(model),
};

const server = createApp(auth, prisma, {
  inboundEmailSecret: env.INBOUND_EMAIL_SECRET,
  ai,
}).listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down API`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
