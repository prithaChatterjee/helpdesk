import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn, DataTableSkeleton } from './data-table';

interface Ticket {
  id: string;
  subject: string;
  priority: number;
}

const columns: DataTableColumn<Ticket>[] = [
  { header: 'Subject', cell: (ticket) => ticket.subject, className: 'font-medium' },
  { header: 'Priority', cell: (ticket) => <strong>P{ticket.priority}</strong> },
];

const tickets: Ticket[] = [
  { id: 't1', subject: 'Refund please', priority: 1 },
  { id: 't2', subject: 'Login broken', priority: 2 },
];

describe('DataTable', () => {
  it('renders a header per column and a cell per column for each row', () => {
    render(<DataTable columns={columns} rows={tickets} getRowKey={(ticket) => ticket.id} />);

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Subject',
      'Priority',
    ]);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByRole('cell', { name: 'Refund please' })).toHaveClass('font-medium');
    expect(first.getByRole('cell', { name: 'P1' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('cell', { name: 'Login broken' })).toBeInTheDocument();
  });

  it('shows the empty message across all columns when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(ticket) => ticket.id}
        emptyMessage="No tickets yet."
      />,
    );

    expect(screen.getByRole('cell', { name: 'No tickets yet.' })).toHaveAttribute('colspan', '2');
  });

  it('falls back to a default empty message', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(ticket) => ticket.id} />);
    expect(screen.getByRole('cell', { name: 'Nothing to show yet.' })).toBeInTheDocument();
  });

  it('keeps a hidden header for screen readers', () => {
    render(
      <DataTable
        columns={[...columns, { header: 'Actions', hideHeader: true, cell: () => 'edit' }]}
        rows={tickets}
        getRowKey={(ticket) => ticket.id}
      />,
    );

    const header = screen.getByRole('columnheader', { name: 'Actions' });
    expect(header.firstElementChild).toHaveClass('sr-only');
  });
});

describe('DataTable sorting', () => {
  type SortField = 'subject' | 'priority';
  const sortableColumns: DataTableColumn<Ticket, SortField>[] = [
    { header: 'Subject', sortField: 'subject', cell: (ticket) => ticket.subject },
    {
      header: 'Priority',
      sortField: 'priority',
      sortDescFirst: true,
      cell: (ticket) => `P${ticket.priority}`,
    },
    { header: 'Actions', hideHeader: true, cell: () => 'edit' },
  ];

  function renderSortable(sort: { sortBy: SortField; sortOrder: 'asc' | 'desc' }) {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={sortableColumns}
        rows={tickets}
        getRowKey={(ticket) => ticket.id}
        sort={sort}
        onSortChange={onSortChange}
      />,
    );
    return onSortChange;
  }

  it('marks the sorted column and leaves the others unsorted', () => {
    renderSortable({ sortBy: 'subject', sortOrder: 'desc' });

    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Priority' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('does not make columns without a sort field sortable', () => {
    renderSortable({ sortBy: 'subject', sortOrder: 'asc' });

    expect(screen.getByRole('columnheader', { name: 'Actions' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('flips the direction of the sorted column', async () => {
    const onSortChange = renderSortable({ sortBy: 'subject', sortOrder: 'asc' });

    await userEvent.click(screen.getByRole('button', { name: 'Subject' }));

    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'subject', sortOrder: 'desc' });
  });

  it('sorts a new column ascending by default', async () => {
    const onSortChange = renderSortable({ sortBy: 'priority', sortOrder: 'asc' });

    await userEvent.click(screen.getByRole('button', { name: 'Subject' }));

    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'subject', sortOrder: 'asc' });
  });

  it('sorts a descending-first column descending on the first click', async () => {
    const onSortChange = renderSortable({ sortBy: 'subject', sortOrder: 'asc' });

    await userEvent.click(screen.getByRole('button', { name: 'Priority' }));

    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'priority', sortOrder: 'desc' });
  });

  it('keeps rows in the given order instead of sorting them', () => {
    renderSortable({ sortBy: 'subject', sortOrder: 'asc' });

    // 'Refund please' comes first as given, although 'Login broken' sorts first by subject
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Refund please');
  });

  it('renders plain headers without sort buttons when sorting is not wired up', () => {
    render(<DataTable columns={sortableColumns} rows={tickets} getRowKey={(t) => t.id} />);

    expect(screen.queryByRole('button', { name: 'Subject' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Subject' })).not.toHaveAttribute('aria-sort');
  });

  it('marks the table busy while a new sort loads', () => {
    render(<DataTable columns={columns} rows={tickets} getRowKey={(ticket) => ticket.id} busy />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DataTableSkeleton', () => {
  it('shows the real headers and placeholder rows inside a labelled status', () => {
    render(<DataTableSkeleton columns={columns} label="Loading tickets…" rowCount={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading tickets…');
    expect(screen.getByRole('columnheader', { name: 'Priority' })).toBeInTheDocument();
    // Header row + placeholder rows
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText('Refund please')).not.toBeInTheDocument();
  });
});
