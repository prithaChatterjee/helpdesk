import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Loading placeholder shaped like the ticket page: subject, conversation and details. */
export function TicketDetailSkeleton() {
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
