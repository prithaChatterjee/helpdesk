import type { TicketDetail, TicketDetailResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { BackLink } from '@/components/common/back-link';
import { ReplyThread } from '@/components/tickets/reply-thread';
import { TicketDetailSkeleton } from '@/components/tickets/ticket-detail-skeleton';
import { TicketDetailsCard } from '@/components/tickets/ticket-details-card';
import { Card, CardContent } from '@/components/ui/card';
import { LoadError } from '@/components/common/load-error';
import { ApiError, apiGet } from '@/lib/api';

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { data, isPending, error } = useQuery({
    // Under ['tickets'], so invalidating the list refreshes an open ticket too
    queryKey: ['tickets', id],
    queryFn: () => apiGet<TicketDetailResponse>(`/tickets/${encodeURIComponent(id)}`),
  });

  return (
    <div className="space-y-4">
      <BackLink to="/tickets">All tickets</BackLink>
      {isPending ? (
        <TicketDetailSkeleton />
      ) : error ? (
        <Card>
          <CardContent>
            <LoadError>
              {error instanceof ApiError && error.status === 404
                ? 'This ticket does not exist.'
                : `Couldn't load the ticket: ${error.message}`}
            </LoadError>
          </CardContent>
        </Card>
      ) : (
        <TicketDetailContent ticket={data.ticket} />
      )}
    </div>
  );
}

function TicketDetailContent({ ticket }: { ticket: TicketDetail }) {
  return (
    <>
      <h1 className="text-xl font-semibold">{ticket.subject}</h1>
      {/* Conversation on the left, details on the right; stacked (details first) on small screens */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <TicketDetailsCard
          ticket={ticket}
          className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1"
        />
        <ReplyThread ticket={ticket} className="lg:col-start-1 lg:row-start-1" />
      </div>
    </>
  );
}
