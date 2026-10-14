import { describe, expect, it, vi } from 'vitest';
import { CLASSIFY_PRIORITY, sendClassifyTicketJob } from './jobs';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

describe('sendClassifyTicketJob', () => {
  it('queues a new ticket ahead of the backlog', async () => {
    const send = vi.fn().mockResolvedValue('job-1');

    await expect(sendClassifyTicketJob({ send }, ticketId, 'newTicket')).resolves.toBe('job-1');

    expect(send).toHaveBeenCalledWith(
      'classify-ticket',
      { ticketId },
      { priority: CLASSIFY_PRIORITY.newTicket },
    );
  });

  it('queues the backlog at a lower priority', async () => {
    const send = vi.fn().mockResolvedValue('job-2');

    await sendClassifyTicketJob({ send }, ticketId, 'backlog');

    expect(send).toHaveBeenCalledWith(
      'classify-ticket',
      { ticketId },
      { priority: CLASSIFY_PRIORITY.backlog },
    );
    expect(CLASSIFY_PRIORITY.newTicket).toBeGreaterThan(CLASSIFY_PRIORITY.backlog);
  });
});
