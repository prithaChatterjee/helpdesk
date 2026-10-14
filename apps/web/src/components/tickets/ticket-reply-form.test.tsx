import type { TicketListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketReplyForm } from './ticket-reply-form';

const ticketId = '0199a000-0000-7000-8000-0000000000a1';

const ticket: TicketListItem = {
  id: ticketId,
  subject: "Can't log in",
  status: 'OPEN',
  category: null,
  customerEmail: 'jane@customer.test',
  customerName: 'Jane Doe',
  assignee: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

const savedReply = {
  message: {
    id: 'm3',
    direction: 'OUTBOUND',
    fromEmail: 'agent@helpdesk.test',
    fromName: 'Alan Agent',
    bodyText: 'Here is a reset link.',
    deliveryStatus: null,
    createdAt: '2026-10-03T10:00:00.000Z',
  },
};

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <TicketReplyForm ticket={ticket} />
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

describe('TicketReplyForm', () => {
  it('says replies are saved but not emailed yet', () => {
    renderForm();

    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveAccessibleDescription(
      "Saved to the conversation. Emailing replies to the customer isn't set up yet.",
    );
  });

  it('saves the trimmed reply, refreshes the ticket, clears the box and confirms', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(Response.json(savedReply, { status: 201 }));
    const { invalidate } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), '  Here is a reset link. ');
    await user.click(screen.getByRole('button', { name: 'Save reply' }));

    expect(await screen.findByText('Reply saved')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/tickets/${ticketId}/replies`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      body: 'Here is a reset link.',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] });
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('');
  });

  it('keeps line breaks in the reply', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(Response.json(savedReply, { status: 201 }));
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Hi Jane,{Enter}{Enter}Done.');
    await user.click(screen.getByRole('button', { name: 'Save reply' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      body: 'Hi Jane,\n\nDone.',
    });
  });

  it('disables both buttons until the reply has text', async () => {
    const user = userEvent.setup();
    renderForm();
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    const save = screen.getByRole('button', { name: 'Save reply' });
    const polish = screen.getByRole('button', { name: 'Polish' });

    expect(save).toBeDisabled();
    expect(polish).toBeDisabled();

    await user.type(reply, '   ');
    expect(save).toBeDisabled();
    expect(polish).toBeDisabled();

    await user.type(reply, 'Hi');
    expect(save).toBeEnabled();
    expect(polish).toBeEnabled();

    await user.clear(reply);
    expect(save).toBeDisabled();
    expect(polish).toBeDisabled();
  });

  it('disables the button while saving', async () => {
    const user = userEvent.setup();
    // Never resolves, so the save stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Save reply' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('shows the API error and keeps the reply when saving fails', async () => {
    const user = userEvent.setup();
    mockFetch(Response.json({ error: 'Ticket not found' }, { status: 404 }));
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Save reply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Hi');
    expect(screen.getByRole('button', { name: 'Save reply' })).toBeEnabled();
  });
  describe('Polish', () => {
    it('replaces the draft with the polished reply and asks for a review', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockFetch(Response.json({ body: 'Hi Jane,\n\nHere is a reset link.' }));
      renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), ' hi here is reset link ');
      await user.click(screen.getByRole('button', { name: 'Polish' }));

      expect(await screen.findByText('Reply polished')).toBeInTheDocument();
      expect(screen.getByText('Review it before saving.')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(
        'Hi Jane,\n\nHere is a reset link.',
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/tickets/${ticketId}/replies/polish`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
        body: 'hi here is reset link',
      });
    });

    it('does not save the reply', async () => {
      const user = userEvent.setup();
      const fetchSpy = mockFetch(Response.json({ body: 'Polished' }));
      const { invalidate } = renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'hi');
      await user.click(screen.getByRole('button', { name: 'Polish' }));

      await screen.findByText('Reply polished');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('restores the original draft on Undo', async () => {
      const user = userEvent.setup();
      mockFetch(Response.json({ body: 'Polished' }));
      renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'my draft');
      await user.click(screen.getByRole('button', { name: 'Polish' }));
      await user.click(await screen.findByRole('button', { name: 'Undo' }));

      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('my draft');
    });

    it('saves the polished reply', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ body: 'Polished reply.' }))
        .mockResolvedValueOnce(Response.json(savedReply, { status: 201 }));
      renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'draft');
      await user.click(screen.getByRole('button', { name: 'Polish' }));
      await screen.findByText('Reply polished');
      await user.click(screen.getByRole('button', { name: 'Save reply' }));

      expect(await screen.findByText('Reply saved')).toBeInTheDocument();
      expect(fetchSpy.mock.calls[1]?.[0]).toBe(`/api/tickets/${ticketId}/replies`);
      expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
        body: 'Polished reply.',
      });
    });

    it('locks the reply and both buttons while polishing', async () => {
      const user = userEvent.setup();
      mockFetch(new Promise<Response>(() => {}));
      renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'hi');
      await user.click(screen.getByRole('button', { name: 'Polish' }));

      expect(await screen.findByRole('button', { name: 'Polishing…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save reply' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveAttribute('readonly');
    });

    it('shows the API error and keeps the draft when polishing fails', async () => {
      const user = userEvent.setup();
      mockFetch(Response.json({ error: "Couldn't polish the reply. Try again." }, { status: 502 }));
      renderForm();

      await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'hi');
      await user.click(screen.getByRole('button', { name: 'Polish' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't polish the reply. Try again.",
      );
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('hi');
      expect(screen.getByRole('button', { name: 'Polish' })).toBeEnabled();
    });
  });
});
