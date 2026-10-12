import type { UserListResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

  it('requests GET /api/users', async () => {
    const fetchSpy = mockFetch(Response.json({ users }));
    renderPage();

    await screen.findByRole('cell', { name: 'Ada Admin' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/users', expect.anything());
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
});
