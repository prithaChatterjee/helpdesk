import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';
import { authClient, useActiveSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

// Folder tabs cut into the masthead: the open one takes the page colour and runs into the page
// below, like a file pulled from the cabinet
function tabClass({ isActive }: { isActive: boolean }) {
  return cn(
    'shrink-0 rounded-t-md px-4 pt-2 pb-2.5 text-sm font-semibold transition-colors',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
    isActive
      ? 'bg-background text-foreground'
      : 'text-masthead-muted hover:bg-masthead-foreground/10 hover:text-masthead-foreground',
  );
}

export function AppHeader() {
  const { data: session } = useActiveSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <header className="bg-masthead text-masthead-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-6 px-4 pt-3">
        <Link
          to="/"
          className="mb-3 rounded-sm text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-masthead-foreground"
        >
          Helpdesk
        </Link>
        {/* Below the name and controls on phones (scrolling sideways if needed), between them on wider screens */}
        <nav
          aria-label="Main"
          className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pt-1 md:order-none md:mx-0 md:w-auto md:px-0"
        >
          <NavLink to="/" end className={tabClass}>
            Home
          </NavLink>
          <NavLink to="/tickets" className={tabClass}>
            Tickets
          </NavLink>
          <NavLink to="/dashboard" className={tabClass}>
            Dashboard
          </NavLink>
          {session?.user.role === 'ADMIN' && (
            <NavLink to="/users" className={tabClass}>
              Users
            </NavLink>
          )}
        </nav>
        <div className="mb-2 ml-auto flex items-center gap-3">
          <ThemeSwitcher />
          <span className="hidden text-sm text-masthead-muted sm:inline">{session?.user.name}</span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-masthead-muted transition-colors hover:bg-masthead-foreground/10 hover:text-masthead-foreground focus-visible:outline-2 focus-visible:outline-masthead-foreground disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
