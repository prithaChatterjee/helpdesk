import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketDetailSkeleton } from './ticket-detail-skeleton';

describe('TicketDetailSkeleton', () => {
  it('tells screen readers the ticket is loading', () => {
    render(<TicketDetailSkeleton />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading ticket…');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });
});
