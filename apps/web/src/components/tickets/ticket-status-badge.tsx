import { TICKET_STATUS_LABELS, TicketStatus } from '@helpdesk/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Open needs someone, so it carries the ink; Resolved is "delivered" green; Closed recedes
const STATUS_CLASSES: Record<TicketStatus, string> = {
  OPEN: '',
  RESOLVED: 'bg-success/12 text-success dark:bg-success/16',
  CLOSED: 'text-muted-foreground',
};

/** A ticket's status; Open stands out, Resolved reads as done, Closed is muted. */
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge
      variant={status === TicketStatus.OPEN ? 'default' : 'secondary'}
      className={cn(STATUS_CLASSES[status])}
    >
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
