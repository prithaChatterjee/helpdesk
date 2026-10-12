import type { UserRole } from '@helpdesk/shared';
import { Navigate, Outlet } from 'react-router';
import { authClient } from '@/lib/auth-client';

/** Layout route that renders child routes only for users with `role`; others go home. Use inside `RequireAuth`. */
export function RequireRole({ role }: { role: UserRole }) {
  const { data: session } = authClient.useSession();

  if (session?.user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
