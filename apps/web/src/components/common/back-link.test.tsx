import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BackLink } from './back-link';

describe('BackLink', () => {
  it('links to the given page with its text as the name', () => {
    render(
      <MemoryRouter>
        <BackLink to="/tickets">All tickets</BackLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'All tickets' })).toHaveAttribute('href', '/tickets');
  });

  it('adds extra classes', () => {
    render(
      <MemoryRouter>
        <BackLink to="/users" className="mb-2">
          All users
        </BackLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'All users' })).toHaveClass('mb-2', 'text-sm');
  });
});
