import type { TicketListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketFieldsEditor } from './ticket-fields-editor';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

const ticket: Pick<TicketListItem, 'id' | 'status' | 'category' | 'assignee'> = {
  id: ticketId,
  status: 'OPEN',
  category: null,
  assignee: null,
};

const sam = { id: '0199a000-0000-7000-8000-000000000002', name: 'Sam Agent' };
const ann = { id: '0199a000-0000-7000-8000-000000000003', name: 'Ann Admin' };

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

/** Stubs fetch: `/api/assignees` lists Ann and Sam (or `assignees`), the PATCH gets `response`. */
function mockFetch(
  response: Response | Promise<Response>,
  assignees: () => Response | Promise<Response> = () => Response.json({ assignees: [ann, sam] }),
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input) =>
      Promise.resolve(String(input) === '/api/assignees' ? assignees() : response),
    );
}

/** The JSON body of the PATCH request. */
function sentBody(fetchSpy: ReturnType<typeof mockFetch>) {
  const patch = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PATCH');
  return JSON.parse(String(patch?.[1]?.body)) as unknown;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TicketFieldsEditor', () => {
  it('shows the current status, and a placeholder for an unclassified ticket', () => {
    mockFetch(new Promise<Response>(() => {}));
    renderEditor();

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Not classified');
  });

  it('shows the current category', () => {
    mockFetch(new Promise<Response>(() => {}));
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

  describe('assignee', () => {
    it('shows "Unassigned" for a ticket nobody is assigned to', async () => {
      mockFetch(new Promise<Response>(() => {}));
      renderEditor();

      expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Unassigned');
    });

    it('shows the current assignee while the list loads, without letting it change yet', () => {
      // The assignees never load
      mockFetch(new Promise<Response>(() => {}), () => new Promise<Response>(() => {}));
      renderEditor({ ...ticket, assignee: sam });

      const assignee = screen.getByRole('combobox', { name: 'Assignee' });
      expect(assignee).toHaveTextContent('Sam Agent');
      expect(assignee).toBeDisabled();
    });

    it('offers everyone who can be assigned', async () => {
      const user = userEvent.setup();
      mockFetch(new Promise<Response>(() => {}));
      renderEditor();
      const assignee = screen.getByRole('combobox', { name: 'Assignee' });
      await waitFor(() => expect(assignee).toBeEnabled());

      await user.click(assignee);

      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Unassigned',
        'Ann Admin',
        'Sam Agent',
      ]);
    });

    it('assigns the ticket and confirms', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockFetch(Response.json({ ticket: { ...ticket, assignee: sam } }));
      const { invalidate } = renderEditor();
      const assignee = screen.getByRole('combobox', { name: 'Assignee' });
      await waitFor(() => expect(assignee).toBeEnabled());

      await user.click(assignee);
      await user.click(screen.getByRole('option', { name: 'Sam Agent' }));

      expect(await screen.findByText('Assigned to Sam Agent')).toBeInTheDocument();
      expect(sentBody(fetchSpy)).toEqual({ assigneeId: sam.id });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    });

    it('unassigns the ticket and confirms', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockFetch(Response.json({ ticket }));
      renderEditor({ ...ticket, assignee: sam });
      const assignee = screen.getByRole('combobox', { name: 'Assignee' });
      await waitFor(() => expect(assignee).toBeEnabled());

      await user.click(assignee);
      await user.click(screen.getByRole('option', { name: 'Unassigned' }));

      expect(await screen.findByText('Unassigned', { selector: '[data-title]' })).toBeVisible();
      expect(sentBody(fetchSpy)).toEqual({ assigneeId: null });
    });

    it('keeps showing an assignee who can no longer be picked', async () => {
      const user = userEvent.setup();
      mockFetch(new Promise<Response>(() => {}));
      // Deactivated, so not in the list
      const gone = { id: '0199a000-0000-7000-8000-000000000009', name: 'Former Agent' };
      renderEditor({ ...ticket, assignee: gone });
      const assignee = screen.getByRole('combobox', { name: 'Assignee' });
      await waitFor(() => expect(assignee).toBeEnabled());

      expect(assignee).toHaveTextContent('Former Agent');
      await user.click(assignee);
      expect(screen.getByRole('option', { name: 'Former Agent' })).toBeInTheDocument();
    });

    it('says so when the assignees fail to load', async () => {
      mockFetch(new Promise<Response>(() => {}), () =>
        Response.json({ error: 'Unauthorized' }, { status: 401 }),
      );
      renderEditor();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't load assignees: Unauthorized",
      );
      expect(screen.getByRole('combobox', { name: 'Assignee' })).toBeDisabled();
    });
  });
});
