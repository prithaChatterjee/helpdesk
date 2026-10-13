import { TICKET_STATUS_LABELS, TicketStatus } from '@helpdesk/shared';
import { Badge } from '@/components/ui/badge';

/** A ticket's status; Open stands out, Resolved and Closed are muted. */
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant={status === TicketStatus.OPEN ? 'default' : 'secondary'}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
