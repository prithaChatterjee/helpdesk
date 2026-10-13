import type { TicketListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketFieldsEditor } from './ticket-fields-editor';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

const ticket: Pick<TicketListItem, 'id' | 'status' | 'category'> = {
  id: ticketId,
  status: 'OPEN',
  category: null,
};

function renderEditor(props = ticket) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <dl>
        <TicketFieldsEditor ticket={props} />
      </dl>
      <Toaster />
    </QueryClientProvider>,
  );
  return { invalidate };
}

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response));
}

/** The JSON body of the fetch call. */
function sentBody(fetchSpy: ReturnType<typeof mockFetch>) {
  return JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as unknown;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TicketFieldsEditor', () => {
  it('shows the current status, and a placeholder for an unclassified ticket', () => {
    renderEditor();

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Not classified');
  });

  it('shows the current category', () => {
    renderEditor({ ...ticket, category: 'REFUND' });

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Refund request');
  });

  it('saves a new status, refreshes the tickets and confirms', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(Response.json({ ticket: { ...ticket, status: 'RESOLVED' } }));
    const { invalidate } = renderEditor();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Resolved' }));

    expect(await screen.findByText('Status changed to Resolved')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/tickets/${ticketId}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(sentBody(fetchSpy)).toEqual({ status: 'RESOLVED' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
  });

  it('saves a new category and confirms', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(Response.json({ ticket: { ...ticket, category: 'TECHNICAL' } }));
    renderEditor();

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Technical question' }));

    expect(await screen.findByText('Category changed to Technical question')).toBeInTheDocument();
    expect(sentBody(fetchSpy)).toEqual({ category: 'TECHNICAL' });
  });

  it('shows the new value and disables both dropdowns while saving', async () => {
    const user = userEvent.setup();
    // Never resolves, so the change stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderEditor();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Closed' }));

    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(status).toHaveTextContent('Closed');
    expect(status).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeDisabled();
  });

  it('shows the API error and goes back to the saved value when saving fails', async () => {
    const user = userEvent.setup();
    mockFetch(Response.json({ error: 'Ticket not found' }, { status: 404 }));
    renderEditor();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Closed' }));

    expect(
      await screen.findByText("Couldn't update the ticket: Ticket not found"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open'),
    );
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeEnabled();
  });
});
