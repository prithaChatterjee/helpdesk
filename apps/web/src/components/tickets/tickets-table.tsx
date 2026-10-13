import {
  type Page,
  type Sort,
  TICKET_CATEGORY_LABELS,
  type TicketListRow,
  type TicketSortField,
} from '@helpdesk/shared';
import { Link } from 'react-router';
import { DataTable, type DataTableColumn, DataTableSkeleton } from '@/components/common/data-table';
import { TicketStatusBadge } from '@/components/tickets/ticket-status-badge';
import { dateTimeFormat } from '@/lib/format';

/** "No replies", "1 reply", "3 replies" */
function replyCountLabel(count: number) {
  if (count === 0) return 'No replies';
  return count === 1 ? '1 reply' : `${count} replies`;
}

const ticketColumns: readonly DataTableColumn<TicketListRow, TicketSortField>[] = [
  {
    header: 'Subject',
    sortField: 'subject',
    cell: (ticket) => (
      <>
        <Link to={`/tickets/${ticket.id}`} className="block truncate font-medium hover:underline">
          {ticket.subject}
        </Link>
        <span className="text-xs text-muted-foreground">{replyCountLabel(ticket.replyCount)}</span>
      </>
    ),
    className: 'max-w-80',
    skeletonClassName: 'h-4 w-56',
  },
  {
    header: 'Customer',
    sortField: 'customer',
    cell: (ticket) => ticket.customerName ?? ticket.customerEmail,
    skeletonClassName: 'h-4 w-36',
  },
  {
    header: 'Status',
    sortField: 'status',
    cell: (ticket) => <TicketStatusBadge status={ticket.status} />,
    skeletonClassName: 'h-5 w-16 rounded-full',
  },
  {
    header: 'Category',
    sortField: 'category',
    cell: (ticket) => (ticket.category ? TICKET_CATEGORY_LABELS[ticket.category] : '—'),
    skeletonClassName: 'h-4 w-28',
  },
  {
    header: 'Assignee',
    cell: (ticket) =>
      ticket.assignee ? (
        ticket.assignee.name
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
    skeletonClassName: 'h-4 w-24',
  },
  {
    header: 'Updated',
    sortField: 'updatedAt',
    sortDescFirst: true,
    cell: (ticket) => dateTimeFormat.format(new Date(ticket.updatedAt)),
    skeletonClassName: 'h-4 w-32',
  },
];

interface TicketsTableProps {
  /** One page of tickets */
  tickets: TicketListRow[];
  /** Shown when `tickets` is empty */
  emptyMessage?: string;
  /** The order `tickets` came back in from the API; `undefined` for the API's default order */
  sort: Sort<TicketSortField> | undefined;
  onSortChange: (sort: Sort<TicketSortField> | undefined) => void;
  /** Which page `tickets` is */
  page: Page;
  /** Tickets on all pages together */
  total: number;
  onPageChange: (page: Page) => void;
  /** A refetch (e.g. for a new sort or page) is in progress */
  busy?: boolean;
}

/**
 * Tickets with their customer, status, category, assignee and last activity.
 * Headers sort and the controls below page through the API.
 */
export function TicketsTable({
  tickets,
  emptyMessage = 'No tickets yet.',
  sort,
  onSortChange,
  page,
  total,
  onPageChange,
  busy,
}: TicketsTableProps) {
  return (
    <DataTable
      columns={ticketColumns}
      rows={tickets}
      getRowKey={(ticket) => ticket.id}
      emptyMessage={emptyMessage}
      sort={sort}
      onSortChange={onSortChange}
      page={page}
      total={total}
      onPageChange={onPageChange}
      busy={busy}
    />
  );
}

export function TicketsTableSkeleton() {
  return <DataTableSkeleton columns={ticketColumns} label="Loading tickets…" />;
}
