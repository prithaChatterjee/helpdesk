import type { TicketListResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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
    replyCount: 0,
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
    replyCount: 3,
    createdAt: '2026-09-20T08:30:00.000Z',
    updatedAt: '2026-09-21T08:30:00.000Z',
  },
];

const firstPage: TicketListResponse = { tickets, total: 2, page: 1, pageSize: 25 };

/** A ticket list response for a request URL, as the API pages `total` tickets. */
function pagedResponse(input: RequestInfo | URL, total: number) {
  const params = new URL(String(input), 'http://localhost').searchParams;
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  const count = Math.max(Math.min(pageSize, total - (page - 1) * pageSize), 0);
  const rows = Array.from({ length: count }, (_, i) => {
    const n = (page - 1) * pageSize + i + 1;
    return { ...tickets[0]!, id: String(n), subject: `Ticket ${n}` };
  });
  return Response.json({ tickets: rows, total, page, pageSize });
}

/** Stubs fetch with an API of `total` tickets; returns the spy. */
function mockPagedApi(total: number) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input) => Promise.resolve(pagedResponse(input, total)));
}

function renderPage() {
  // No retries, so error states show up right away
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* Subjects link to the ticket's page */}
      <MemoryRouter>
        <TicketsPage />
      </MemoryRouter>
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
    expect(screen.queryByRole('link', { name: "Can't log in" })).not.toBeInTheDocument();
  });

  it("requests the first page in the API's default order", async () => {
    const fetchSpy = mockFetch(Response.json(firstPage));
    renderPage();

    await screen.findByRole('link', { name: "Can't log in" });
    expect(fetchSpy).toHaveBeenCalledWith('/api/tickets?page=1&pageSize=25', expect.anything());
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('asks the API for the new order when a header is clicked', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json(firstPage)));
    renderPage();
    await screen.findByRole('link', { name: "Can't log in" });

    await user.click(screen.getByRole('button', { name: 'Subject' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/tickets?sortBy=subject&sortOrder=asc&page=1&pageSize=25',
        expect.anything(),
      ),
    );
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts, flips, then removes the sort on repeated clicks', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json(firstPage)));
    renderPage();
    await screen.findByRole('link', { name: "Can't log in" });
    const subject = screen.getByRole('columnheader', { name: 'Subject' });

    await user.click(screen.getByRole('button', { name: 'Subject' }));
    await waitFor(() => expect(subject).toHaveAttribute('aria-sort', 'ascending'));

    await user.click(screen.getByRole('button', { name: 'Subject' }));
    await waitFor(() => expect(subject).toHaveAttribute('aria-sort', 'descending'));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/tickets?sortBy=subject&sortOrder=desc&page=1&pageSize=25',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Subject' }));
    await waitFor(() => expect(subject).toHaveAttribute('aria-sort', 'none'));
    // Without a sort the API falls back to its default order
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/tickets?page=1&pageSize=25', expect.anything());
  });

  it('sorts the Updated column newest first on the first click', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json(firstPage)));
    renderPage();
    await screen.findByRole('link', { name: "Can't log in" });

    await user.click(screen.getByRole('button', { name: 'Updated' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/tickets?sortBy=updatedAt&sortOrder=desc&page=1&pageSize=25',
        expect.anything(),
      ),
    );
  });

  it('shows rows in the order the API returns them', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
      Promise.resolve(
        Response.json({
          ...firstPage,
          // The "API" returns the reverse order for subject sorting; the page must not re-sort
          tickets: String(input).includes('sortBy=subject') ? [...tickets].reverse() : tickets,
        }),
      ),
    );
    renderPage();
    await screen.findByRole('link', { name: "Can't log in" });

    await user.click(screen.getByRole('button', { name: 'Subject' }));

    await waitFor(() =>
      expect(screen.getAllByRole('row')[1]).toHaveTextContent('Refund for order 42'),
    );
  });

  it('lists each ticket with customer, status, category and last update', async () => {
    mockFetch(Response.json(firstPage));
    renderPage();

    const openRow = (await screen.findByRole('link', { name: "Can't log in" })).closest('tr');
    const refundRow = screen.getByRole('link', { name: 'Refund for order 42' }).closest('tr');
    expect(openRow).not.toBeNull();
    expect(refundRow).not.toBeNull();
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    const open = within(openRow!);
    expect(open.getByText('No replies')).toBeInTheDocument();
    expect(open.getByRole('cell', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(open.getByText('Open')).toBeInTheDocument();
    expect(open.getByRole('cell', { name: '—' })).toBeInTheDocument();
    expect(
      open.getByRole('cell', { name: date.format(new Date(tickets[0]!.updatedAt)) }),
    ).toBeInTheDocument();

    // Without a name, the customer is shown by email
    const refund = within(refundRow!);
    expect(refund.getByText('3 replies')).toBeInTheDocument();
    expect(refund.getByRole('cell', { name: 'bob@customer.test' })).toBeInTheDocument();
    expect(refund.getByText('Resolved')).toBeInTheDocument();
    expect(refund.getByRole('cell', { name: 'Refund request' })).toBeInTheDocument();
  });

  it('says "1 reply" for a single reply', async () => {
    mockFetch(Response.json({ ...firstPage, tickets: [{ ...tickets[0]!, replyCount: 1 }] }));
    renderPage();

    expect(await screen.findByText('1 reply')).toBeInTheDocument();
  });

  it("links each subject to the ticket's page", async () => {
    mockFetch(Response.json(firstPage));
    renderPage();

    expect(await screen.findByRole('link', { name: "Can't log in" })).toHaveAttribute(
      'href',
      '/tickets/1',
    );
  });

  it('says so when there are no tickets', async () => {
    mockFetch(Response.json({ ...firstPage, total: 0, tickets: [] }));
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

  describe('pagination', () => {
    it('shows the range and page count', async () => {
      mockPagedApi(101);
      renderPage();

      await screen.findByRole('link', { name: 'Ticket 1' });
      const nav = screen.getByRole('navigation', { name: 'Pagination' });
      expect(nav).toHaveTextContent('1–25 of 101');
      expect(nav).toHaveTextContent('Page 1 of 5');
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    });

    it('asks the API for the next page', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockPagedApi(101);
      renderPage();
      await screen.findByRole('link', { name: 'Ticket 1' });

      await user.click(screen.getByRole('button', { name: 'Next page' }));

      expect(await screen.findByRole('link', { name: 'Ticket 26' })).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/tickets?page=2&pageSize=25',
        expect.anything(),
      );
      expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
        '26–50 of 101',
      );
    });

    it('jumps to the last page, where Next is disabled', async () => {
      const user = userEvent.setup();
      mockPagedApi(101);
      renderPage();
      await screen.findByRole('link', { name: 'Ticket 1' });

      await user.click(screen.getByRole('button', { name: 'Last page' }));

      expect(await screen.findByRole('link', { name: 'Ticket 101' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
        '101–101 of 101',
      );
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();
    });

    it('asks for the first page with the new page size', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockPagedApi(101);
      renderPage();
      await screen.findByRole('link', { name: 'Ticket 1' });
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await screen.findByRole('link', { name: 'Ticket 26' });

      await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
      await user.click(screen.getByRole('option', { name: '50' }));

      await waitFor(() =>
        expect(fetchSpy).toHaveBeenLastCalledWith(
          '/api/tickets?page=1&pageSize=50',
          expect.anything(),
        ),
      );
      expect(await screen.findByRole('link', { name: 'Ticket 50' })).toBeInTheDocument();
    });

    it('goes back to the first page when the sort changes', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockPagedApi(101);
      renderPage();
      await screen.findByRole('link', { name: 'Ticket 1' });
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await screen.findByRole('link', { name: 'Ticket 26' });

      await user.click(screen.getByRole('button', { name: 'Subject' }));

      await waitFor(() =>
        expect(fetchSpy).toHaveBeenLastCalledWith(
          '/api/tickets?sortBy=subject&sortOrder=asc&page=1&pageSize=25',
          expect.anything(),
        ),
      );
    });

    it('moves to the new last page when its page no longer exists', async () => {
      const user = userEvent.setup();
      let total = 101;
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input) => Promise.resolve(pagedResponse(input, total)));
      renderPage();
      await screen.findByRole('link', { name: 'Ticket 1' });

      // Tickets disappear between loading page 1 and asking for page 5
      total = 60;
      await user.click(screen.getByRole('button', { name: 'Last page' }));

      expect(await screen.findByRole('link', { name: 'Ticket 60' })).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/tickets?page=3&pageSize=25',
        expect.anything(),
      );
    });
  });
});
