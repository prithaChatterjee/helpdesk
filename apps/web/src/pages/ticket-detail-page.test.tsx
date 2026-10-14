import type { DeliveryStatus, TicketDetailResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketDetailPage } from './ticket-detail-page';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

const detail: TicketDetailResponse = {
  ticket: {
    id: ticketId,
    subject: "Can't log in",
    status: 'OPEN',
    category: 'TECHNICAL',
    customerEmail: 'jane@customer.test',
    customerName: 'Jane Doe',
    assignee: null,
    summary: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    messages: [
      {
        id: 'm1',
        direction: 'INBOUND',
        fromEmail: 'jane@customer.test',
        fromName: 'Jane Doe',
        bodyText: 'I forgot my password.\nCan you help?',
        deliveryStatus: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'm2',
        direction: 'OUTBOUND',
        fromEmail: 'alan@helpdesk.test',
        fromName: 'Alan Agent',
        bodyText: 'Here is a reset link.',
        deliveryStatus: null,
        createdAt: '2026-10-02T10:00:00.000Z',
      },
    ],
  },
};

function renderPage(path = `/tickets/${ticketId}`) {
  // No retries, so error states show up right away
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
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

describe('TicketDetailPage', () => {
  it('shows a loading skeleton while the ticket loads', () => {
    // Never resolves, so the page stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading ticket…');
    expect(screen.queryByRole('heading', { name: "Can't log in" })).not.toBeInTheDocument();
  });

  it('requests the ticket from the URL', async () => {
    const fetchSpy = mockFetch(Response.json(detail));
    renderPage();

    await screen.findByRole('heading', { name: "Can't log in" });
    expect(fetchSpy).toHaveBeenCalledWith(`/api/tickets/${ticketId}`, expect.anything());
  });

  it('shows the customer, status, category and dates', async () => {
    mockFetch(Response.json(detail));
    renderPage();

    await screen.findByRole('heading', { name: "Can't log in" });
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const details = screen.getByRole('heading', { name: 'Details' }).closest('[data-slot="card"]');
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText('Jane Doe')).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText('jane@customer.test')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Technical question')).toBeInTheDocument();
    expect(
      screen.getAllByText(date.format(new Date(detail.ticket.createdAt))).length,
    ).toBeGreaterThan(0);
  });

  it("shows the ticket's saved summary", async () => {
    mockFetch(
      Response.json({ ticket: { ...detail.ticket, summary: 'Jane forgot her password.' } }),
    );
    renderPage();

    const summary = (await screen.findByRole('heading', { name: 'Summary' })).closest(
      '[data-slot="card"]',
    );
    expect(summary).not.toBeNull();
    expect(
      within(summary as HTMLElement).getByText('Jane forgot her password.'),
    ).toBeInTheDocument();
  });

  it('shows the thread in order, telling customer messages from replies', async () => {
    mockFetch(Response.json(detail));
    renderPage();

    const thread = await screen.findByRole('list', { name: 'Messages' });
    const items = within(thread).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[0]!).getByRole('article', { name: 'Customer message from Jane Doe' }),
    ).toHaveTextContent('I forgot my password.');
    expect(
      within(items[1]!).getByRole('article', { name: 'Reply from Alan Agent' }),
    ).toHaveTextContent('Here is a reset link.');
  });

  it('links back to the ticket list', async () => {
    mockFetch(Response.json(detail));
    renderPage();

    expect(await screen.findByRole('link', { name: 'All tickets' })).toHaveAttribute(
      'href',
      '/tickets',
    );
  });

  it('says the ticket does not exist on a 404', async () => {
    mockFetch(Response.json({ error: 'Ticket not found' }, { status: 404 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('This ticket does not exist.');
  });

  it('shows the API error message when the request fails', async () => {
    mockFetch(Response.json({ error: 'Internal Server Error' }, { status: 500 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load the ticket: Internal Server Error",
    );
  });

  describe('while a reply is being emailed', () => {
    /** The ticket with its reply in delivery status `status`. */
    function withReply(status: DeliveryStatus | null): TicketDetailResponse {
      const [first, reply] = detail.ticket.messages;
      return {
        ticket: {
          ...detail.ticket,
          messages: [first!, { ...reply!, deliveryStatus: status }],
        },
      };
    }

    /** Answers the ticket request with each of `responses` in turn (the last one repeats). */
    function mockTicketResponses(...responses: TicketDetailResponse[]) {
      let calls = 0;
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (String(input) !== `/api/tickets/${ticketId}`) return Response.json({});
        return Response.json(responses[Math.min(calls++, responses.length - 1)]);
      });
    }

    function ticketRequests(fetchSpy: ReturnType<typeof mockTicketResponses>) {
      return fetchSpy.mock.calls.filter(([input]) => String(input) === `/api/tickets/${ticketId}`);
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('checks back until the reply is emailed', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockTicketResponses(withReply('PENDING'), withReply('SENT'));
      renderPage();

      const reply = await screen.findByRole('article', { name: 'Reply from Alan Agent' });
      expect(reply).toHaveTextContent('Sending…');

      await vi.advanceTimersByTimeAsync(5_000);

      expect(
        await within(
          await screen.findByRole('article', { name: 'Reply from Alan Agent' }),
        ).findByText(/Emailed/),
      ).toBeInTheDocument();
    });

    it('does not check back when nothing is being sent', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchSpy = mockTicketResponses(withReply('SENT'));
      renderPage();
      await screen.findByRole('heading', { name: "Can't log in" });

      await vi.advanceTimersByTimeAsync(15_000);

      expect(ticketRequests(fetchSpy)).toHaveLength(1);
    });
  });
});
