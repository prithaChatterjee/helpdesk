import type { TicketDetail } from '@helpdesk/shared';
import { TicketMessageItem } from '@/components/tickets/ticket-message-item';
import { TicketReplyForm } from '@/components/tickets/ticket-reply-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ReplyThreadProps {
  /** The ticket with its messages, oldest first */
  ticket: TicketDetail;
  /** Placement on the page, e.g. the grid column */
  className?: string;
}

/** A ticket's conversation: every message in order, with the reply box underneath. */
export function ReplyThread({ ticket, className }: ReplyThreadProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Conversation</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ticket.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ol aria-label="Messages" className="space-y-4">
            {ticket.messages.map((message) => (
              <TicketMessageItem key={message.id} message={message} />
            ))}
          </ol>
        )}
        <div className="mt-6 border-t pt-6">
          <TicketReplyForm ticket={ticket} />
        </div>
      </CardContent>
    </Card>
  );
}
