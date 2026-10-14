import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireAuth } from '@/components/auth/require-auth';
import { RequireRole } from '@/components/auth/require-role';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { TicketDetailPage } from '@/pages/ticket-detail-page';
import { TicketsPage } from '@/pages/tickets-page';
import { UsersPage } from '@/pages/users-page';

// Its own chunk: the charting library is only downloaded when someone opens the dashboard
const DashboardPage = lazy(() =>
  import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
