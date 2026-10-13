import {
  DEFAULT_TICKET_SORT,
  type Sort,
  sortSearchParams,
  type TicketListResponse,
  type TicketSortField,
} from '@helpdesk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable, TicketsTableSkeleton } from '@/components/tickets-table';
import { apiGet } from '@/lib/api';

export function TicketsPage() {
  const [sort, setSort] = useState<Sort<TicketSortField>>(DEFAULT_TICKET_SORT);
  const { data, isPending, isPlaceholderData, error } = useQuery({
    // Mutations invalidate ['tickets'], which also matches every sort
    queryKey: ['tickets', sort],
    // Sorted by the API, never in the browser
    queryFn: () => apiGet<TicketListResponse>(`/tickets?${sortSearchParams(sort)}`),
    // Keep showing the current rows while a new sort loads, instead of the skeleton
    placeholderData: keepPreviousData,
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
          <TicketsTable
            tickets={data.tickets}
            sort={sort}
            onSortChange={setSort}
            busy={isPlaceholderData}
          />
        )}
      </CardContent>
    </Card>
  );
}
