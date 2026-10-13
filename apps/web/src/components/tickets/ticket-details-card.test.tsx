import type { TicketListItem } from '@helpdesk/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketDetailsCard } from './ticket-details-card';

const ticket: TicketListItem = {
  id: '0199a000-0000-7000-8000-0000000000a1',
  subject: "Can't log in",
  status: 'OPEN',
  category: 'TECHNICAL',
  customerEmail: 'jane@customer.test',
  customerName: 'Jane Doe',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function renderCard(props: TicketListItem = ticket) {
  // The status and category dropdowns save through TanStack Query
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TicketDetailsCard ticket={props} />
    </QueryClientProvider>,
  );
}

/** The `<dd>` for the `<dt>` labelled `term`. */
function valueOf(term: string) {
  return screen.getByText(term, { selector: 'dt' }).nextElementSibling;
}

describe('TicketDetailsCard', () => {
  it('has a Details heading', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Details' })).toBeInTheDocument();
  });

  it("shows the customer's name and email", () => {
    renderCard();

    expect(valueOf('Customer')).toHaveTextContent('Jane Doe');
    expect(valueOf('Customer')).toHaveTextContent('jane@customer.test');
  });

  it('shows only the email for a customer without a name', () => {
    renderCard({ ...ticket, customerName: null });

    expect(valueOf('Customer')).toHaveTextContent(/^jane@customer\.test$/);
  });

  it('shows the status and category in their dropdowns', () => {
    renderCard();

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent(
      'Technical question',
    );
  });

  it('says when a ticket is not classified yet', () => {
    renderCard({ ...ticket, category: null });

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Not classified');
  });

  it('shows when the ticket was created and last updated', () => {
    renderCard();

    expect(valueOf('Created')).toHaveTextContent(date.format(new Date(ticket.createdAt)));
    expect(valueOf('Updated')).toHaveTextContent(date.format(new Date(ticket.updatedAt)));
  });
});
