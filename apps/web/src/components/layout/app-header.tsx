import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { authClient, useActiveSession } from '@/lib/auth-client';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' });
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
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Helpdesk</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/tickets" className={navLinkClass}>
              Tickets
            </NavLink>
            {session?.user.role === 'ADMIN' && (
              <NavLink to="/users" className={navLinkClass}>
                Users
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session?.user.name}</span>
          <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
