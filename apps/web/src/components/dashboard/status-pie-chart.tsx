import {
  type DashboardStatsResponse,
  percentOf,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from '@helpdesk/shared';
import { Pie, PieChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

// Categorical slots 1–3 in their fixed order; validated for color-vision deficiency on both card
// surfaces. Slot 3 (aqua) is under 3:1 on white, so the legend below states every value.
const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'var(--chart-1)',
  RESOLVED: 'var(--chart-2)',
  CLOSED: 'var(--chart-3)',
};

const chartConfig = {
  tickets: { label: 'Tickets' },
  ...Object.fromEntries(
    Object.entries(STATUS_COLORS).map(([status, color]) => [
      status,
      { label: TICKET_STATUS_LABELS[status as TicketStatus], color },
    ]),
  ),
} satisfies ChartConfig;

/**
 * Tickets per status as a pie (part of the whole, 3 slices), with a legend that names each slice
 * and states its count and share, so color is never the only cue.
 */
export function StatusPieChart({
  byStatus,
  total,
}: {
  byStatus: DashboardStatsResponse['byStatus'];
  total: number;
}) {
  const data = byStatus.map(({ status, count }) => ({
    status,
    tickets: count,
    fill: `var(--color-${status})`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Tickets by status</h2>
        </CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        {total === 0 ? (
          <p className="py-16 text-sm text-muted-foreground">No tickets yet.</p>
        ) : (
          <>
            {/* Decorative for screen readers: the legend carries the same numbers */}
            <ChartContainer config={chartConfig} className="aspect-square h-56" aria-hidden>
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel nameKey="status" />}
                />
                {/* A 2px gap in the card's own color separates the slices */}
                <Pie
                  data={data}
                  dataKey="tickets"
                  nameKey="status"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </PieChart>
            </ChartContainer>
            <ul aria-label="Tickets by status" className="min-w-40 space-y-2 text-sm">
              {data.map(({ status, tickets }) => (
                <li key={status} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span className="flex-1">{TICKET_STATUS_LABELS[status]}</span>
                  <span className="tabular-nums">{tickets.toLocaleString()}</span>
                  <span className="w-10 text-right text-muted-foreground tabular-nums">
                    {percentOf(tickets, total)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
