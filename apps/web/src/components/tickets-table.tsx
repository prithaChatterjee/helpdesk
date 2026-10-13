import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketListItem,
  TicketStatus,
} from '@helpdesk/shared';
import { DataTable, type DataTableColumn, DataTableSkeleton } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ticketColumns: readonly DataTableColumn<TicketListItem>[] = [
  {
    header: 'Subject',
    cell: (ticket) => ticket.subject,
    className: 'max-w-80 truncate font-medium',
    skeletonClassName: 'h-4 w-56',
  },
  {
    header: 'Customer',
    cell: (ticket) => ticket.customerName ?? ticket.customerEmail,
    skeletonClassName: 'h-4 w-36',
  },
  {
    header: 'Status',
    cell: (ticket) => (
      <Badge variant={ticket.status === TicketStatus.OPEN ? 'default' : 'secondary'}>
        {TICKET_STATUS_LABELS[ticket.status]}
      </Badge>
    ),
    skeletonClassName: 'h-5 w-16 rounded-full',
  },
  {
    header: 'Category',
    cell: (ticket) => (ticket.category ? TICKET_CATEGORY_LABELS[ticket.category] : '—'),
    skeletonClassName: 'h-4 w-28',
  },
  {
    header: 'Updated',
    cell: (ticket) => dateTimeFormat.format(new Date(ticket.updatedAt)),
    skeletonClassName: 'h-4 w-32',
  },
];

/** Tickets with their customer, status, category and last activity. */
export function TicketsTable({ tickets }: { tickets: TicketListItem[] }) {
  return (
    <DataTable
      columns={ticketColumns}
      rows={tickets}
      getRowKey={(ticket) => ticket.id}
      emptyMessage="No tickets yet."
    />
  );
}

export function TicketsTableSkeleton() {
  return <DataTableSkeleton columns={ticketColumns} label="Loading tickets…" />;
}
