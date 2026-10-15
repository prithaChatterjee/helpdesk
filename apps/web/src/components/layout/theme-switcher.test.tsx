import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeSwitcher } from './theme-switcher';

function renderSwitcher() {
  render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('ThemeSwitcher', () => {
  it('follows the system theme until one is chosen', () => {
    renderSwitcher();

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Match system theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches to the dark theme and remembers it', async () => {
    renderSwitcher();

    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }));

    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('switches back to the light theme', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderSwitcher();

    await userEvent.click(screen.getByRole('button', { name: 'Light theme' }));

    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
