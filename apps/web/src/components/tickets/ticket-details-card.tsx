import type { TicketListItem } from '@helpdesk/shared';
import { TicketFieldsEditor } from '@/components/tickets/ticket-fields-editor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dateTimeFormat } from '@/lib/format';

interface TicketDetailsCardProps {
  ticket: TicketListItem;
  /** Placement on the page, e.g. the grid column */
  className?: string;
}

/** The ticket's customer, editable status and category, and when it was created and updated. */
export function TicketDetailsCard({ ticket, className }: TicketDetailsCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-1">
          <div className="col-span-2 lg:col-span-1">
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="mt-1">
              {ticket.customerName && <p className="font-medium">{ticket.customerName}</p>}
              <p className="break-all">{ticket.customerEmail}</p>
            </dd>
          </div>
          <TicketFieldsEditor ticket={ticket} />
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="mt-1">{dateTimeFormat.format(new Date(ticket.createdAt))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="mt-1">{dateTimeFormat.format(new Date(ticket.updatedAt))}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
