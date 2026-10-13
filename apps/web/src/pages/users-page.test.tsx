import type { UserListResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './users-page';

const users: UserListResponse['users'] = [
  {
    id: '1',
    name: 'Ada Admin',
    email: 'ada@example.com',
    role: 'ADMIN',
    isActive: true,
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'AGENT',
    isActive: false,
    createdAt: '2026-03-02T08:30:00.000Z',
  },
];

function renderPage() {
  // No retries, so error states show up right away
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UsersPage', () => {
  it('shows a loading skeleton while users load', () => {
    // Never resolves, so the page stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading users…');
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'ada@example.com' })).not.toBeInTheDocument();
  });

  it("requests GET /api/users in the API's default order", async () => {
    const fetchSpy = mockFetch(Response.json({ users }));
    renderPage();

    await screen.findByRole('cell', { name: 'Ada Admin' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/users', expect.anything());
  });

  it('asks the API to sort by the clicked header', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(Response.json({ users })));
    renderPage();
    await screen.findByRole('cell', { name: 'Ada Admin' });

    await user.click(screen.getByRole('button', { name: 'Email' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        '/api/users?sortBy=email&sortOrder=asc',
        expect.anything(),
      ),
    );
  });

  it('lists each user with role, status and created date', async () => {
    mockFetch(Response.json({ users }));
    renderPage();

    const adaRow = (await screen.findByRole('cell', { name: 'Ada Admin' })).closest('tr');
    const alanRow = screen.getByRole('cell', { name: 'Alan Agent' }).closest('tr');
    expect(adaRow).not.toBeNull();
    expect(alanRow).not.toBeNull();
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

    const ada = within(adaRow!);
    expect(ada.getByRole('cell', { name: 'ada@example.com' })).toBeInTheDocument();
    expect(ada.getByRole('cell', { name: 'Admin' })).toBeInTheDocument();
    expect(ada.getByText('Active')).toBeInTheDocument();
    expect(
      ada.getByRole('cell', { name: date.format(new Date(users[0]!.createdAt)) }),
    ).toBeInTheDocument();

    const alan = within(alanRow!);
    expect(alan.getByRole('cell', { name: 'alan@example.com' })).toBeInTheDocument();
    expect(alan.getByRole('cell', { name: 'Agent' })).toBeInTheDocument();
    expect(alan.getByText('Deactivated')).toBeInTheDocument();
    expect(
      alan.getByRole('cell', { name: date.format(new Date(users[1]!.createdAt)) }),
    ).toBeInTheDocument();

    // Header row + one row per user
    expect(screen.getAllByRole('row')).toHaveLength(users.length + 1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the API error message when the request fails', async () => {
    mockFetch(Response.json({ error: 'Forbidden' }, { status: 403 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load users: Forbidden");
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to the status code when the error response has no JSON body', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load users: Request failed (502)",
    );
  });

  it('opens the create user modal from the header button and closes it on Cancel', async () => {
    const fetchSpy = mockFetch(Response.json({ users }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('cell', { name: 'Ada Admin' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create user' }));

    const dialog = await screen.findByRole('dialog', { name: 'Create user' });
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Create user' })).toBeInTheDocument();
    // Only the initial GET /api/users: cancelling must not submit anything
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows an edit button on each row that opens that user in the edit modal', async () => {
    mockFetch(Response.json({ users }));
    const user = userEvent.setup();
    renderPage();

    const alanRow = (await screen.findByRole('cell', { name: 'Alan Agent' })).closest('tr');
    expect(screen.getByRole('button', { name: 'Edit Ada Admin' })).toBeInTheDocument();
    await user.click(within(alanRow!).getByRole('button', { name: 'Edit Alan Agent' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit user' });
    expect(within(dialog).getByLabelText('Email')).toHaveValue('alan@example.com');
  });

  it('offers delete on Agent rows but not on Admin rows', async () => {
    mockFetch(Response.json({ users }));
    renderPage();

    const adaRow = (await screen.findByRole('cell', { name: 'Ada Admin' })).closest('tr');
    const alanRow = screen.getByRole('cell', { name: 'Alan Agent' }).closest('tr');

    expect(within(alanRow!).getByRole('button', { name: 'Delete Alan Agent' })).toBeInTheDocument();
    expect(within(adaRow!).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(adaRow!).getByRole('button', { name: 'Edit Ada Admin' })).toBeInTheDocument();
  });
});
