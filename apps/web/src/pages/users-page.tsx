import type { UserListResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiGet } from '@/lib/api';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

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
      </CardHeader>
      <CardContent>
        {isPending ? (
          <UsersTableSkeleton />
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            Couldn't load users: {error.message}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role === 'ADMIN' ? 'Admin' : 'Agent'}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'secondary' : 'outline'}>
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </Badge>
                  </TableCell>
                  <TableCell>{dateFormat.format(new Date(user.createdAt))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const USER_COLUMNS = ['Name', 'Email', 'Role', 'Status', 'Created'] as const;

/** Table-shaped placeholder while users load, so the layout doesn't jump. */
function UsersTableSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading users…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {USER_COLUMNS.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, row) => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-44" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
