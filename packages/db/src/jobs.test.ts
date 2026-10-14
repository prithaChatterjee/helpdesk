import { describe, expect, it, vi } from 'vitest';
import {
  JOB_PRIORITY,
  sendClassifyTicketJob,
  sendResolveTicketJob,
  sendSendEmailJob,
} from './jobs';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

describe.each([
  ['sendClassifyTicketJob', sendClassifyTicketJob, 'classify-ticket'],
  ['sendResolveTicketJob', sendResolveTicketJob, 'resolve-ticket'],
] as const)('%s', (_name, sendJob, queue) => {
  it('queues a new ticket ahead of the backlog', async () => {
    const send = vi.fn().mockResolvedValue('job-1');

    await expect(sendJob({ send }, ticketId, 'newTicket')).resolves.toBe('job-1');

    expect(send).toHaveBeenCalledWith(queue, { ticketId }, { priority: JOB_PRIORITY.newTicket });
  });

  it('queues the backlog at a lower priority', async () => {
    const send = vi.fn().mockResolvedValue('job-2');

    await sendJob({ send }, ticketId, 'backlog');

    expect(send).toHaveBeenCalledWith(queue, { ticketId }, { priority: JOB_PRIORITY.backlog });
    expect(JOB_PRIORITY.newTicket).toBeGreaterThan(JOB_PRIORITY.backlog);
  });
});

describe('sendSendEmailJob', () => {
  it('queues the message for sending', async () => {
    const send = vi.fn().mockResolvedValue('job-3');

    await expect(sendSendEmailJob({ send }, 'm1')).resolves.toBe('job-3');

    expect(send).toHaveBeenCalledWith('send-email', { messageId: 'm1' });
  });
});
