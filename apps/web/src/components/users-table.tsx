import type { UserListItem } from '@helpdesk/shared';
import { DataTable, type DataTableColumn, DataTableSkeleton } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { UserFormDialog } from '@/components/user-form-dialog';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const userColumns: readonly DataTableColumn<UserListItem>[] = [
  {
    header: 'Name',
    cell: (user) => user.name,
    className: 'font-medium',
    skeletonClassName: 'h-4 w-28',
  },
  { header: 'Email', cell: (user) => user.email, skeletonClassName: 'h-4 w-44' },
  {
    header: 'Role',
    cell: (user) => (user.role === 'ADMIN' ? 'Admin' : 'Agent'),
    skeletonClassName: 'h-4 w-14',
  },
  {
    header: 'Status',
    cell: (user) => (
      <Badge variant={user.isActive ? 'secondary' : 'outline'}>
        {user.isActive ? 'Active' : 'Deactivated'}
      </Badge>
    ),
    skeletonClassName: 'h-5 w-16 rounded-full',
  },
  {
    header: 'Created',
    cell: (user) => dateFormat.format(new Date(user.createdAt)),
    skeletonClassName: 'h-4 w-24',
  },
  {
    header: 'Actions',
    hideHeader: true,
    cell: (user) => <UserFormDialog user={user} />,
    className: 'w-px text-right',
    skeletonClassName: 'ml-auto size-7',
  },
];

/** Users with their role, status and created date. */
export function UsersTable({ users }: { users: UserListItem[] }) {
  return (
    <DataTable
      columns={userColumns}
      rows={users}
      getRowKey={(user) => user.id}
      emptyMessage="No users yet."
    />
  );
}

export function UsersTableSkeleton() {
  return <DataTableSkeleton columns={userColumns} label="Loading users…" />;
}
