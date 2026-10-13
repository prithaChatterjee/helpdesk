import type { TicketListResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable, TicketsTableSkeleton } from '@/components/tickets-table';
import { apiGet } from '@/lib/api';

export function TicketsPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => apiGet<TicketListResponse>('/tickets'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets</CardTitle>
        <CardDescription>Support emails, most recent activity first.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <TicketsTableSkeleton />
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            Couldn't load tickets: {error.message}
          </p>
        ) : (
          <TicketsTable tickets={data.tickets} />
        )}
      </CardContent>
    </Card>
  );
}
