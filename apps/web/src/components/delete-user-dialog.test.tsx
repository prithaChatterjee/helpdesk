import type { UserListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteUserDialog } from './delete-user-dialog';

const alan: UserListItem = {
  id: '0199a000-0000-7000-8000-000000000005',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'AGENT',
  isActive: true,
  createdAt: '2026-03-02T08:30:00.000Z',
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteUserDialog user={alan} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), invalidate };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete Alan Agent' }));
  return screen.findByRole('alertdialog', { name: 'Delete Alan Agent?' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteUserDialog', () => {
  it('asks for confirmation before deleting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderDialog();

    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent('alan@example.com will be signed out');
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('closes without deleting on Cancel', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user } = renderDialog();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deletes on confirm, shows a toast, refreshes the list and closes', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { user, invalidate } = renderDialog();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Deleted Alan Agent (alan@example.com)')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/users/${alan.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('stays open with both buttons disabled while deleting', async () => {
    // Never resolves, so the mutation stays pending
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
    const { user } = renderDialog();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(dialog).toBeInTheDocument();
  });

  it('shows the API error in the dialog and stays open', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: "Admins can't be deleted" }, { status: 403 }),
    );
    const { user } = renderDialog();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't delete the user: Admins can't be deleted",
    );
    expect(dialog).toBeInTheDocument();
  });
});
