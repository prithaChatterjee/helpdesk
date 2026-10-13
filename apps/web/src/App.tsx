import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { TicketDetailPage } from '@/pages/ticket-detail-page';
import { TicketsPage } from '@/pages/tickets-page';
import { UsersPage } from '@/pages/users-page';

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
