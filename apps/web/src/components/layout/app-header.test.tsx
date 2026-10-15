import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { useActiveSession } from '@/lib/auth-client';
import { AppHeader } from './app-header';

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useActiveSession: vi.fn(),
}));

function signInAs(role: 'ADMIN' | 'AGENT') {
  vi.mocked(useActiveSession).mockReturnValue({
    data: { user: { name: 'Alan Agent', role } },
  } as never);
}

function renderHeader(path = '/') {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppHeader />
      </MemoryRouter>
    </ThemeProvider>,
  );
  return within(screen.getByRole('navigation', { name: 'Main' }));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppHeader', () => {
  it('shows the main tabs, without Users for an Agent', () => {
    signInAs('AGENT');
    const nav = renderHeader();

    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Home',
      'Tickets',
      'Dashboard',
    ]);
  });

  it('adds the Users tab for an Admin', () => {
    signInAs('ADMIN');
    const nav = renderHeader();

    expect(nav.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
  });

  it('marks the open tab as the current page', () => {
    signInAs('AGENT');
    const nav = renderHeader('/tickets/123');

    expect(nav.getByRole('link', { name: 'Tickets' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it("shows the user's name, the theme switcher and sign out", () => {
    signInAs('AGENT');
    renderHeader();

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByText('Alan Agent')).toBeInTheDocument();
    expect(banner.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(banner.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
