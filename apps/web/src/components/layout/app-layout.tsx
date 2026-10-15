import { Outlet } from 'react-router';
import { AppHeader } from '@/components/layout/app-header';

export function AppLayout() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-12">
        <Outlet />
      </main>
    </div>
  );
}
