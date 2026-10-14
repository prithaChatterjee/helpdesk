import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketSummaryCard } from './ticket-summary-card';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

function renderCard(summary: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <TicketSummaryCard ticket={{ id: ticketId, summary }} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { invalidate };
}

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response));
}

afterEach(() => {
  vi.restoreAllMocks();
  // Sonner keeps toasts in a global store, so they would show up in the next test's Toaster
  toast.dismiss();
});

describe('TicketSummaryCard', () => {
  it('has a Summary heading', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
  });

  it('says there is no summary yet and offers to summarize', () => {
    renderCard();

    expect(screen.getByText(/No summary yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled();
  });

  it('shows the saved summary and offers to resummarize', () => {
    renderCard('Jane forgot her password.');

    expect(screen.getByText('Jane forgot her password.')).toBeInTheDocument();
    expect(screen.queryByText(/No summary yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resummarize' })).toBeInTheDocument();
  });

  it('summarizes the ticket, refreshes it and confirms', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(Response.json({ summary: 'Jane forgot her password.' }));
    const { invalidate } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Summarize' }));

    expect(await screen.findByText('Summary updated')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/tickets/${ticketId}/summary`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
  });

  it('disables the button while summarizing', async () => {
    const user = userEvent.setup();
    // Never resolves, so the summary stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Summarize' }));

    expect(await screen.findByRole('button', { name: 'Summarizing…' })).toBeDisabled();
  });

  it('shows the API error and keeps the old summary when summarizing fails', async () => {
    const user = userEvent.setup();
    mockFetch(
      Response.json({ error: "Couldn't summarize the ticket. Try again." }, { status: 502 }),
    );
    renderCard('Old summary');

    await user.click(screen.getByRole('button', { name: 'Resummarize' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't summarize the ticket. Try again.",
    );
    expect(screen.getByText('Old summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resummarize' })).toBeEnabled();
  });
});
