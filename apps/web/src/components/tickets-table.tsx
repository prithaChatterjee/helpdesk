import {
  type Page,
  type Sort,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketListItem,
  type TicketSortField,
  TicketStatus,
} from '@helpdesk/shared';
import { DataTable, type DataTableColumn, DataTableSkeleton } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ticketColumns: readonly DataTableColumn<TicketListItem, TicketSortField>[] = [
  {
    header: 'Subject',
    sortField: 'subject',
    cell: (ticket) => ticket.subject,
    className: 'max-w-80 truncate font-medium',
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
    cell: (ticket) => (
      <Badge variant={ticket.status === TicketStatus.OPEN ? 'default' : 'secondary'}>
        {TICKET_STATUS_LABELS[ticket.status]}
      </Badge>
    ),
    skeletonClassName: 'h-5 w-16 rounded-full',
  },
  {
    header: 'Category',
    sortField: 'category',
    cell: (ticket) => (ticket.category ? TICKET_CATEGORY_LABELS[ticket.category] : '—'),
    skeletonClassName: 'h-4 w-28',
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
  tickets: TicketListItem[];
  /** The order `tickets` came back in from the API */
  sort: Sort<TicketSortField>;
  onSortChange: (sort: Sort<TicketSortField>) => void;
  /** Which page `tickets` is */
  page: Page;
  /** Tickets on all pages together */
  total: number;
  onPageChange: (page: Page) => void;
  /** A refetch (e.g. for a new sort or page) is in progress */
  busy?: boolean;
}

/**
 * Tickets with their customer, status, category and last activity.
 * Headers sort and the controls below page through the API.
 */
export function TicketsTable({
  tickets,
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
      emptyMessage="No tickets yet."
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
