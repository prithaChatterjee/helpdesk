import type { TicketDetail } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReplyThread } from './reply-thread';

const ticket: TicketDetail = {
  id: '0199a000-0000-7000-8000-0000000000a1',
  subject: "Can't log in",
  status: 'OPEN',
  category: null,
  customerEmail: 'jane@customer.test',
  customerName: 'Jane Doe',
  summary: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  messages: [
    {
      id: 'm1',
      direction: 'INBOUND',
      fromEmail: 'jane@customer.test',
      fromName: 'Jane Doe',
      bodyText: 'I forgot my password.',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'm2',
      direction: 'OUTBOUND',
      fromEmail: 'alan@helpdesk.test',
      fromName: 'Alan Agent',
      bodyText: 'Here is a reset link.',
      createdAt: '2026-10-02T10:00:00.000Z',
    },
  ],
};

function renderThread(props: TicketDetail = ticket) {
  // The reply form saves through TanStack Query
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReplyThread ticket={props} />
    </QueryClientProvider>,
  );
}

describe('ReplyThread', () => {
  it('has a Conversation heading', () => {
    renderThread();

    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeInTheDocument();
  });

  it('lists the messages in the order given', () => {
    renderThread();

    const items = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('I forgot my password.');
    expect(items[1]).toHaveTextContent('Here is a reset link.');
  });

  it('says so when the ticket has no messages', () => {
    renderThread({ ...ticket, messages: [] });

    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Messages' })).not.toBeInTheDocument();
  });

  it('has a reply box under the messages', () => {
    renderThread();

    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save reply' })).toBeInTheDocument();
  });

  it('still offers the reply box when there are no messages', () => {
    renderThread({ ...ticket, messages: [] });

    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
  });
});
