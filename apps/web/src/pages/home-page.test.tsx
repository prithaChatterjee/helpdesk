import type { TicketListResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActiveSession } from '@/lib/auth-client';
import { HomePage } from './home-page';

vi.mock('@/lib/auth-client', () => ({ useActiveSession: vi.fn() }));

function ticket(id: string, subject: string): TicketListResponse['tickets'][number] {
  return {
    id,
    subject,
    status: 'OPEN',
    category: null,
    customerEmail: `${id}@customer.test`,
    customerName: id === 't1' ? 'Jane Doe' : null,
    assignee: { id: 'u1', name: 'Alan Agent' },
    replyCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  };
}

function list(total: number, tickets: TicketListResponse['tickets'] = []): TicketListResponse {
  return { tickets, total, page: 1, pageSize: 10 };
}

/** Answers the "assigned to me" and "unassigned" requests. */
function mockQueue(mine: TicketListResponse, unassigned: TicketListResponse) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const assignee = new URL(String(input), 'http://localhost').searchParams.get('assignee');
    return Response.json(assignee === 'me' ? mine : unassigned);
  });
}

/** Shows where a queue link led and with which filters. */
function TicketsRoute() {
  const location = useLocation();
  return <p>Tickets list {JSON.stringify(location.state)}</p>;
}

function renderPage() {
  vi.mocked(useActiveSession).mockReturnValue({ data: { user: { name: 'Alan Agent' } } } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tickets" element={<TicketsRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomePage', () => {
  it('welcomes the user and shows a skeleton while the queue loads', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome, Alan Agent');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('asks for open tickets assigned to the user and unassigned ones', async () => {
    const fetchSpy = mockQueue(list(0), list(0));
    renderPage();

    await screen.findByText('No open tickets are assigned to you.');
    const paths = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(paths).toContain('/api/tickets?assignee=me&status=OPEN&page=1&pageSize=10');
    expect(paths).toContain('/api/tickets?assignee=unassigned&status=OPEN&page=1&pageSize=10');
  });

  it('counts the queue in sentences', async () => {
    mockQueue(list(3, [ticket('t1', "Can't log in")]), list(1));
    renderPage();

    expect(await screen.findByText('3 open tickets are assigned to you.')).toBeInTheDocument();
    expect(screen.getByText('1 open ticket has no one on it yet.')).toBeInTheDocument();
  });

  it('says when nothing is waiting', async () => {
    mockQueue(list(0), list(0));
    renderPage();

    expect(await screen.findByText('No open tickets are assigned to you.')).toBeInTheDocument();
    expect(screen.getByText('Every open ticket has someone on it.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your open tickets' })).not.toBeInTheDocument();
  });

  it("lists the user's open tickets, linking to each", async () => {
    mockQueue(list(2, [ticket('t1', "Can't log in"), ticket('t2', 'Refund please')]), list(0));
    renderPage();

    const link = await screen.findByRole('link', { name: "Can't log in" });
    expect(link).toHaveAttribute('href', '/tickets/t1');
    expect(screen.getByText(/Jane Doe, last activity/)).toBeInTheDocument();
    // No customer name: the address instead
    expect(screen.getByText(/t2@customer.test, last activity/)).toBeInTheDocument();
  });

  it('lists at most five tickets', async () => {
    const tickets = Array.from({ length: 8 }, (_, i) => ticket(`t${i}`, `Ticket ${i}`));
    mockQueue(list(8, tickets), list(0));
    renderPage();

    await screen.findByRole('link', { name: 'Ticket 0' });
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('ol'))).toHaveLength(5);
  });

  it('opens the tickets list filtered to what the sentence counts', async () => {
    mockQueue(list(3), list(1));
    renderPage();

    await userEvent.click(await screen.findByText('3 open tickets are assigned to you.'));

    expect(
      screen.getByText('Tickets list {"filters":{"assignee":"me","status":"OPEN"}}'),
    ).toBeInTheDocument();
  });

  it('shows an error when the queue cannot load', async () => {
    // A fresh response per request: a body can only be read once
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ error: 'Internal Server Error' }, { status: 500 }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your queue: Internal Server Error",
    );
  });
});
