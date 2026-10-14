import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  sendClassifyTicketJob,
  sendResolveTicketJob,
  sendSendEmailJob,
  startJobQueue,
} from '@helpdesk/db';
import { AI_MODEL } from '@helpdesk/shared';
import { createApp } from './app';
import { createAuth } from './auth';
import { prisma } from './db';
import { env } from './env';
import { createReplyPolisher, createTicketSummarizer } from './routes/tickets';
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

// Explicit key from the validated env, rather than the provider reading process.env itself
const model = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(AI_MODEL)
  : undefined;
if (!model)
  console.warn(
    'GOOGLE_GENERATIVE_AI_API_KEY is not set: polishing replies and summarizing tickets are disabled',
  );
const ai = model && {
  replyPolisher: createReplyPolisher(model),
  ticketSummarizer: createTicketSummarizer(model),
};

// pg-boss job queue in PostgreSQL; the worker classifies the tickets
const jobs = await startJobQueue(env.DATABASE_URL);

const server = createApp(auth, prisma, {
  inboundEmailSecret: env.INBOUND_EMAIL_SECRET,
  ai,
  enqueueNewTicketJobs: (ticketId) =>
    Promise.all([
      sendClassifyTicketJob(jobs, ticketId, 'newTicket'),
      sendResolveTicketJob(jobs, ticketId, 'newTicket'),
    ]),
  // The worker emails replies with SendGrid; off, replies are only saved to the thread
  enqueueSendEmail: env.EMAIL_SENDING_ENABLED
    ? (messageId) => sendSendEmailJob(jobs, messageId)
    : undefined,
}).listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down API`);
  server.close(() => {
    void jobs
      .stop({ graceful: true })
      .then(() => prisma.$disconnect())
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
