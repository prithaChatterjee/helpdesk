import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
