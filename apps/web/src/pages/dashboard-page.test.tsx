import type { DashboardStatsResponse } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard-page';

const stats: DashboardStatsResponse = {
  total: 160,
  open: 110,
  resolved: 40,
  resolvedByAi: 30,
  byStatus: [
    { status: 'OPEN', count: 110 },
    { status: 'RESOLVED', count: 40 },
    { status: 'CLOSED', count: 10 },
  ],
  byCategory: [
    { category: 'GENERAL', count: 50 },
    { category: 'TECHNICAL', count: 60 },
    { category: 'REFUND', count: 45 },
    { category: null, count: 5 },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

function mockFetch(response: Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response));
}

/** The stat tile labelled `label`. */
function tile(label: string) {
  return screen.getByRole('group', { name: label });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardPage', () => {
  it('shows a loading skeleton while the numbers load', () => {
    // Never resolves, so the page stays pending
    mockFetch(new Promise<Response>(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('group', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('requests the dashboard stats', async () => {
    const fetchSpy = mockFetch(Response.json(stats));
    renderPage();

    await screen.findByRole('group', { name: 'Total tickets' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard/stats', expect.anything());
  });

  it('shows total, open and resolved tickets with their share of all tickets', async () => {
    mockFetch(Response.json(stats));
    renderPage();

    await screen.findByRole('group', { name: 'Total tickets' });
    expect(tile('Total tickets')).toHaveTextContent('160');
    expect(tile('Open')).toHaveTextContent('110');
    expect(tile('Open')).toHaveTextContent('69% of all tickets');
    expect(tile('Resolved')).toHaveTextContent('40');
    expect(tile('Resolved')).toHaveTextContent('25% of all tickets');
  });

  it('shows tickets resolved by AI as a share of resolved tickets', async () => {
    mockFetch(Response.json(stats));
    renderPage();

    await screen.findByRole('group', { name: 'Resolved by AI' });
    expect(tile('Resolved by AI')).toHaveTextContent('30');
    expect(tile('Resolved by AI')).toHaveTextContent('75% of resolved tickets');
  });

  it('lists the tickets per category in a table behind the bar chart', async () => {
    mockFetch(Response.json(stats));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tickets by category' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Tickets by category' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(rows).toEqual([
      'General question50',
      'Technical question60',
      'Refund request45',
      'Not classified5',
    ]);
  });

  it('names each status slice of the pie chart with its count and share', async () => {
    mockFetch(Response.json(stats));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tickets by status' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Tickets by status' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Open11069%', 'Resolved4025%', 'Closed106%']);
  });

  it('shows 0% and an empty pie message when there are no tickets', async () => {
    mockFetch(
      Response.json({
        ...stats,
        total: 0,
        open: 0,
        resolved: 0,
        resolvedByAi: 0,
        byStatus: stats.byStatus.map((s) => ({ ...s, count: 0 })),
        byCategory: stats.byCategory.map((c) => ({ ...c, count: 0 })),
      }),
    );
    renderPage();

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument();
    expect(tile('Open')).toHaveTextContent('0% of all tickets');
    expect(tile('Resolved by AI')).toHaveTextContent('0% of resolved tickets');
  });

  it('shows the API error when the numbers fail to load', async () => {
    mockFetch(Response.json({ error: 'Internal Server Error' }, { status: 500 }));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load the dashboard: Internal Server Error",
    );
  });
});
