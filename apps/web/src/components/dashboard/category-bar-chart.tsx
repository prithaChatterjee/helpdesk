import { type DashboardStatsResponse, TICKET_CATEGORY_LABELS } from '@helpdesk/shared';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

// One series, so one color (slot 1) for every bar; the card title names it, so no legend
const chartConfig = {
  tickets: { label: 'Tickets', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const UNCLASSIFIED = 'Not classified';

/** Short axis tick per category label ("Technical question" → "Technical"); the tooltip and table
 * use the full label, so narrow screens still fit four ticks. */
const AXIS_TICKS: Record<string, string> = {
  [TICKET_CATEGORY_LABELS.GENERAL]: 'General',
  [TICKET_CATEGORY_LABELS.TECHNICAL]: 'Technical',
  [TICKET_CATEGORY_LABELS.REFUND]: 'Refund',
};

/** Tickets per category as bars, with each count labelled on its bar and a table for screen readers. */
export function CategoryBarChart({
  byCategory,
}: {
  byCategory: DashboardStatsResponse['byCategory'];
}) {
  const data = byCategory.map(({ category, count }) => ({
    name: category ? TICKET_CATEGORY_LABELS[category] : UNCLASSIFIED,
    tickets: count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Tickets by category</h2>
        </CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Decorative for screen readers: the table below carries the same numbers */}
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={data} margin={{ top: 24, left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(name: string) => AXIS_TICKS[name] ?? name}
            />
            {/* The axis value (the full category label) heads the tooltip */}
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey="tickets"
              fill="var(--color-tickets)"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
            >
              <LabelList
                dataKey="tickets"
                position="top"
                offset={8}
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
        <table className="sr-only">
          <caption>Tickets by category</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td>{row.tickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
