import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useActiveSession } from '@/lib/auth-client';

/** Renders children only for signed-in users; everyone else goes to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useActiveSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
