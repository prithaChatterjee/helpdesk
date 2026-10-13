import type { TicketFilters } from '@helpdesk/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TicketFiltersBar } from './ticket-filters';

/** Renders the bar with its filters kept in state, like the page does; returns the change spy. */
function renderBar(initial: TicketFilters = {}) {
  const onChange = vi.fn<(filters: TicketFilters) => void>();
  function Harness() {
    const [filters, setFilters] = useState(initial);
    return (
      <TicketFiltersBar
        filters={filters}
        onChange={(next) => {
          onChange(next);
          setFilters(next);
        }}
      />
    );
  }
  render(<Harness />);
  return onChange;
}

describe('TicketFiltersBar', () => {
  it('shows every status, category and assignee with no filters set', () => {
    renderBar();

    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories');
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('All assignees');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows the filters it is given', () => {
    renderBar({ status: 'RESOLVED', category: 'REFUND', search: 'order' });

    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('order');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Resolved');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Refund request');
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    const onChange = renderBar();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Open' }));

    expect(onChange).toHaveBeenLastCalledWith({ status: 'OPEN' });
  });

  it('filters by category, keeping the status', async () => {
    const user = userEvent.setup();
    const onChange = renderBar({ status: 'OPEN' });

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Refund request' }));

    expect(onChange).toHaveBeenLastCalledWith({ status: 'OPEN', category: 'REFUND' });
  });

  it('filters to unassigned tickets', async () => {
    const user = userEvent.setup();
    const onChange = renderBar();

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(screen.getByRole('option', { name: 'Unassigned' }));

    expect(onChange).toHaveBeenLastCalledWith({ assignee: 'unassigned' });
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveTextContent('Unassigned');
  });

  it('removes the status filter for "All statuses"', async () => {
    const user = userEvent.setup();
    const onChange = renderBar({ status: 'CLOSED' });

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'All statuses' }));

    expect(onChange).toHaveBeenLastCalledWith({ status: undefined });
  });

  it('sends the trimmed search once typing pauses', async () => {
    const user = userEvent.setup();
    const onChange = renderBar();

    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '  jane ');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ search: 'jane' }));
    // One search for the whole word, not one per keystroke
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removes the search when the box is emptied', async () => {
    const user = userEvent.setup();
    const onChange = renderBar({ search: 'jane' });

    await user.clear(screen.getByRole('searchbox', { name: 'Search tickets' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ search: undefined }));
  });

  it('does not search for spaces alone', async () => {
    const user = userEvent.setup();
    const onChange = renderBar();

    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '   ');
    // Longer than the debounce
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears every filter and the search box', async () => {
    const user = userEvent.setup();
    const onChange = renderBar({ status: 'OPEN', category: 'TECHNICAL', search: 'crash' });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenLastCalledWith({});
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
