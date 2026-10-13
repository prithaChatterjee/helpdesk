import { Outlet } from 'react-router';
import { AppHeader } from '@/components/layout/app-header';

export function AppLayout() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
