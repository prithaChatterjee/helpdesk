import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorFallback } from './app-error-fallback';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppErrorFallback', () => {
  it('announces that something went wrong', () => {
    render(<AppErrorFallback />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('reloads the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<AppErrorFallback />);

    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
