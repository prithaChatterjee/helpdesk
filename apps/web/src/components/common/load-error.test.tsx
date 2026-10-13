import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadError } from './load-error';

describe('LoadError', () => {
  it('announces the message as an alert', () => {
    render(<LoadError>Couldn't load tickets: Unauthorized</LoadError>);

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load tickets: Unauthorized");
  });

  it('adds extra classes', () => {
    render(<LoadError className="py-12">Failed</LoadError>);

    expect(screen.getByRole('alert')).toHaveClass('py-12', 'text-destructive');
  });
});
