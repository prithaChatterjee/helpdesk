import {
  listQueryString,
  type Sort,
  type UserListResponse,
  type UserSortField,
} from '@helpdesk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  // No sort: the API's default order (oldest first)
  const [sort, setSort] = useState<Sort<UserSortField>>();
  const { data, isPending, isPlaceholderData, error } = useQuery({
    // Mutations invalidate ['users'], which also matches every sort
    queryKey: ['users', sort],
    // Sorted by the API, never in the browser
    queryFn: () => apiGet<UserListResponse>(`/users${listQueryString({ sort })}`),
    // Keep showing the current rows while a new sort loads, instead of the skeleton
    placeholderData: keepPreviousData,
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
          <UsersTable
            users={data.users}
            sort={sort}
            onSortChange={setSort}
            busy={isPlaceholderData}
          />
        )}
      </CardContent>
    </Card>
  );
}
