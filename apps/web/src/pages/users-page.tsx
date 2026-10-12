import type { UserListResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
          <p className="py-6 text-center text-sm text-muted-foreground">Loading users…</p>
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
