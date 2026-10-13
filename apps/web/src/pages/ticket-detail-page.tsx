import {
  MessageDirection,
  type TicketDetail,
  type TicketDetailResponse,
  type TicketMessage,
} from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { TicketFieldsEditor } from '@/components/ticket-fields-editor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, apiGet } from '@/lib/api';
import { dateTimeFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { data, isPending, error } = useQuery({
    // Under ['tickets'], so invalidating the list refreshes an open ticket too
    queryKey: ['tickets', id],
    queryFn: () => apiGet<TicketDetailResponse>(`/tickets/${encodeURIComponent(id)}`),
  });

  return (
    <div className="space-y-4">
      <Link
        to="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All tickets
      </Link>
      {isPending ? (
        <TicketDetailSkeleton />
      ) : error ? (
        <Card>
          <CardContent>
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {error instanceof ApiError && error.status === 404
                ? 'This ticket does not exist.'
                : `Couldn't load the ticket: ${error.message}`}
            </p>
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
        <Card className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
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
        <Card className="lg:col-start-1 lg:row-start-1">
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
                  <MessageItem key={message.id} message={message} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** One email: the customer's on the left, Agent replies on the right in the primary tint. */
function MessageItem({ message }: { message: TicketMessage }) {
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
            {message.fromName && (
              <span className="text-muted-foreground"> &lt;{message.fromEmail}&gt;</span>
            )}
            <span className="text-muted-foreground"> · {outbound ? 'Reply' : 'Customer'}</span>
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

function TicketDetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading ticket…</span>
      <Skeleton className="h-7 w-80" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="lg:col-start-2 lg:row-start-1">
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-start-1 lg:row-start-1">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-[85%]" />
            <Skeleton className="ml-auto h-24 w-[85%]" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
