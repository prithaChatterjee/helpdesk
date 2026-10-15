import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

function Crash(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders its children', () => {
    render(
      <AppErrorBoundary>
        <p>Tickets</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error page instead of a blank screen when a child crashes', () => {
    // React logs the caught error
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Crash />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });
});
