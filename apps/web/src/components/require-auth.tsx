import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveSession } from '@/lib/auth-client';

/** Renders children only for signed-in users; everyone else goes to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useActiveSession();
  const location = useLocation();

  if (isPending) {
    return <AppShellSkeleton />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

/** Placeholder shaped like AppLayout (header + content card) while the session loads. */
function AppShellSkeleton() {
  return (
    <div className="min-h-svh bg-background" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-14" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4">
        <div className="space-y-3 rounded-xl border p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
    </div>
  );
}
