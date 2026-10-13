import { type Sort, type UserListItem, UserRole, type UserSortField } from '@helpdesk/shared';
import { DataTable, type DataTableColumn, DataTableSkeleton } from '@/components/common/data-table';
import { DeleteUserDialog } from '@/components/users/delete-user-dialog';
import { Badge } from '@/components/ui/badge';
import { UserFormDialog } from '@/components/users/user-form-dialog';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const userColumns: readonly DataTableColumn<UserListItem, UserSortField>[] = [
  {
    header: 'Name',
    sortField: 'name',
    cell: (user) => user.name,
    className: 'font-medium',
    skeletonClassName: 'h-4 w-28',
  },
  {
    header: 'Email',
    sortField: 'email',
    cell: (user) => user.email,
    skeletonClassName: 'h-4 w-44',
  },
  {
    header: 'Role',
    sortField: 'role',
    cell: (user) => (user.role === 'ADMIN' ? 'Admin' : 'Agent'),
    skeletonClassName: 'h-4 w-14',
  },
  {
    header: 'Status',
    sortField: 'isActive',
    cell: (user) => (
      <Badge variant={user.isActive ? 'secondary' : 'outline'}>
        {user.isActive ? 'Active' : 'Deactivated'}
      </Badge>
    ),
    skeletonClassName: 'h-5 w-16 rounded-full',
  },
  {
    header: 'Created',
    sortField: 'createdAt',
    sortDescFirst: true,
    cell: (user) => dateFormat.format(new Date(user.createdAt)),
    skeletonClassName: 'h-4 w-24',
  },
  {
    header: 'Actions',
    hideHeader: true,
    cell: (user) => (
      <div className="flex justify-end gap-1">
        <UserFormDialog user={user} />
        {user.role === UserRole.ADMIN ? (
          // Admins can't be deleted; the spacer keeps the edit buttons lined up
          <span aria-hidden className="size-7" />
        ) : (
          <DeleteUserDialog user={user} />
        )}
      </div>
    ),
    className: 'w-px',
    skeletonClassName: 'ml-auto h-7 w-15',
  },
];

interface UsersTableProps {
  users: UserListItem[];
  /** The order `users` came back in from the API; `undefined` for the API's default order */
  sort: Sort<UserSortField> | undefined;
  onSortChange: (sort: Sort<UserSortField> | undefined) => void;
  /** A refetch (e.g. for a new sort) is in progress */
  busy?: boolean;
}

/** Users with their role, status and created date. Headers sort via the API. */
export function UsersTable({ users, sort, onSortChange, busy }: UsersTableProps) {
  return (
    <DataTable
      columns={userColumns}
      rows={users}
      getRowKey={(user) => user.id}
      emptyMessage="No users yet."
      sort={sort}
      onSortChange={onSortChange}
      busy={busy}
    />
  );
}

export function UsersTableSkeleton() {
  return <DataTableSkeleton columns={userColumns} label="Loading users…" />;
}
