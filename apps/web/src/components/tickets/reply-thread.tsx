import type { TicketDetail } from '@helpdesk/shared';
import { TicketMessageItem } from '@/components/tickets/ticket-message-item';
import { TicketReplyForm } from '@/components/tickets/ticket-reply-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from 'cn';

interface ReplyThreadProps {
  /** The ticket with its messages, oldest first */
  ticket: TicketDetail;
  /** Placement on the page, e.g. the grid column */
  className?: string;
}

/** A ticket's conversation: every message in order, with the reply box underneath. */
export function ReplyThread({ ticket, className }: ReplyThreadProps) {
  return (
    // overflow-visible: the Card's default overflow-hidden would keep the reply box from sticking
    <Card className={cn('overflow-visible', className)}>
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
        {/* Sticks to the bottom of the screen while the conversation scrolls, so the reply box is
            always in view. The negative margins stretch its background to the card's edges. */}
        <section
          aria-label="Write a reply"
          className="sticky bottom-0 z-10 -mx-(--card-spacing) mt-6 -mb-(--card-spacing) rounded-b-xl border-t bg-card px-(--card-spacing) pt-4 pb-(--card-spacing)"
        >
          <TicketReplyForm ticket={ticket} />
        </section>
      </CardContent>
    </Card>
  );
}
