import { type DeliveryStatus, MessageDirection, type TicketMessage } from '@helpdesk/shared';
import { dateTimeFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One email: the customer's on the left, Agent replies on the right in the primary tint. */
export function TicketMessageItem({ message }: { message: TicketMessage }) {
  const outbound = message.direction === MessageDirection.OUTBOUND;
  const sender = message.fromName ?? message.fromEmail;
  return (
    <li className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <article
        aria-label={`${outbound ? 'Reply' : 'Customer message'} from ${sender}`}
        className={cn(
          'w-full max-w-[85%] rounded-lg border p-4',
          outbound ? 'border-primary/20 bg-primary/5' : 'bg-muted/50',
        )}
      >
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p>
            <span className="font-medium">{sender}</span>
            {/* Replies show only the Agent's name; customer messages also show their address */}
            {!outbound && message.fromName && (
              <span className="text-muted-foreground"> &lt;{message.fromEmail}&gt;</span>
            )}
            <span className="text-muted-foreground"> · {outbound ? 'Reply' : 'Customer'}</span>
            {outbound && <DeliveryLabel status={message.deliveryStatus} />}
          </p>
          <time dateTime={message.createdAt} className="text-muted-foreground">
            {dateTimeFormat.format(new Date(message.createdAt))}
          </time>
        </header>
        {/* Plain text from the API, rendered as text (never as HTML) */}
        <p className="text-sm break-words whitespace-pre-wrap">{message.bodyText}</p>
      </article>
    </li>
  );
}

// `null`: saved while email sending was off, so the customer never got it
const DELIVERY_LABELS: Record<DeliveryStatus | 'NONE', string> = {
  PENDING: 'Sending…',
  SENT: 'Emailed',
  FAILED: 'Not sent',
  NONE: 'Not emailed',
};

/** Whether a reply reached the customer's inbox (as far as the email provider says). */
function DeliveryLabel({ status }: { status: DeliveryStatus | null }) {
  return (
    <span
      className={cn(status === 'FAILED' ? 'text-destructive font-medium' : 'text-muted-foreground')}
    >
      {' · '}
      {DELIVERY_LABELS[status ?? 'NONE']}
    </span>
  );
}
