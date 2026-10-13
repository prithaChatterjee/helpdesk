import type { TicketListResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketsPage } from './tickets-page';

const tickets: TicketListResponse['tickets'] = [
  {
    id: '1',
    subject: "Can't log in",
    status: 'OPEN',
    category: null,
    customerEmail: 'jane@customer.test',
    customerName: 'Jane Doe',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  },
  {
    id: '2',
    subject: 'Refund for order 42',
    status: 'RESOLVED',
    category: 'REFUND',
    customerEmail: 'bob@customer.test',
    customerName: null,
    createdAt: '2026-09-20T08:30:00.000Z',
    updatedAt: '2026-09-21T08:30:00.000Z',
  },
];

function renderPage() {
  // No retries, so error states show up right away
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TicketsPage />
    </QueryClientProvider>,
  );
}

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TicketsPage', () => {
  it('shows a loading skeleton while tickets load', () => {
    // Never resolves, so the page stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading tickets…');
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: "Can't log in" })).not.toBeInTheDocument();
  });

  it('requests GET /api/tickets', async () => {
    const fetchSpy = mockFetch(Response.json({ tickets }));
    renderPage();

    await screen.findByRole('cell', { name: "Can't log in" });
    expect(fetchSpy).toHaveBeenCalledWith('/api/tickets', expect.anything());
  });

  it('lists each ticket with customer, status, category and last update', async () => {
    mockFetch(Response.json({ tickets }));
    renderPage();

    const openRow = (await screen.findByRole('cell', { name: "Can't log in" })).closest('tr');
    const refundRow = screen.getByRole('cell', { name: 'Refund for order 42' }).closest('tr');
    expect(openRow).not.toBeNull();
    expect(refundRow).not.toBeNull();
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    const open = within(openRow!);
    expect(open.getByRole('cell', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(open.getByText('Open')).toBeInTheDocument();
    expect(open.getByRole('cell', { name: '—' })).toBeInTheDocument();
    expect(
      open.getByRole('cell', { name: date.format(new Date(tickets[0]!.updatedAt)) }),
    ).toBeInTheDocument();

    // Without a name, the customer is shown by email
    const refund = within(refundRow!);
    expect(refund.getByRole('cell', { name: 'bob@customer.test' })).toBeInTheDocument();
    expect(refund.getByText('Resolved')).toBeInTheDocument();
    expect(refund.getByRole('cell', { name: 'Refund request' })).toBeInTheDocument();
  });

  it('says so when there are no tickets', async () => {
    mockFetch(Response.json({ tickets: [] }));
    renderPage();

    expect(await screen.findByRole('cell', { name: 'No tickets yet.' })).toBeInTheDocument();
  });

  it('shows the API error message when the request fails', async () => {
    mockFetch(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load tickets: Unauthorized",
    );
  });
});
