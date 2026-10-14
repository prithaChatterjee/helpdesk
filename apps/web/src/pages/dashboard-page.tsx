import type { DashboardStatsResponse } from '@helpdesk/shared';
import { useQuery } from '@tanstack/react-query';
import { LoadError } from '@/components/common/load-error';
import { CategoryBarChart } from '@/components/dashboard/category-bar-chart';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { StatTiles } from '@/components/dashboard/stat-tiles';
import { StatusPieChart } from '@/components/dashboard/status-pie-chart';
import { Card, CardContent } from '@/components/ui/card';
import { apiGet } from '@/lib/api';

/** Ticket numbers at a glance, for Admins and Agents. Loaded lazily with the charting library. */
export function DashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiGet<DashboardStatsResponse>('/dashboard/stats'),
    // New tickets and auto-resolved ones arrive without anyone on this page doing anything
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {isPending ? (
        <DashboardSkeleton />
      ) : error ? (
        <Card>
          <CardContent>
            <LoadError>Couldn&apos;t load the dashboard: {error.message}</LoadError>
          </CardContent>
        </Card>
      ) : (
        <>
          <StatTiles stats={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryBarChart byCategory={data.byCategory} />
            <StatusPieChart byStatus={data.byStatus} total={data.total} />
          </div>
        </>
      )}
    </div>
  );
}
