import type { UserListResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserFormDialog } from '@/components/user-form-dialog';
import { UsersTable, UsersTableSkeleton } from '@/components/users-table';
import { apiGet } from '@/lib/api';

export function UsersPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<UserListResponse>('/users'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Admins and Agents who can sign in to Helpdesk.</CardDescription>
        <CardAction>
          <UserFormDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <UsersTableSkeleton />
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            Couldn't load users: {error.message}
          </p>
        ) : (
          <UsersTable users={data.users} />
        )}
      </CardContent>
    </Card>
  );
}
