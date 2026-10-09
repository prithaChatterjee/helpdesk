import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function AppHeader() {
  const { data: session } = authClient.useSession();
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
        <span className="font-semibold">Helpdesk</span>
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
