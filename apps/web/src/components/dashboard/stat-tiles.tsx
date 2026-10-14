import { type DashboardStatsResponse, percentOf } from '@helpdesk/shared';
import { useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StatTileProps {
  label: string;
  value: number;
  /** What the number is out of, e.g. "69% of all tickets" */
  note: string;
}

function StatTile({ label, value, note }: StatTileProps) {
  const labelId = useId();
  return (
    <Card role="group" aria-labelledby={labelId}>
      <CardHeader>
        <CardDescription id={labelId}>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{note}</CardContent>
    </Card>
  );
}

/** The headline numbers: total, open and resolved tickets, and how many the AI resolved. */
export function StatTiles({ stats }: { stats: DashboardStatsResponse }) {
  const { total, open, resolved, resolvedByAi } = stats;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile label="Total tickets" value={total} note="All time" />
      <StatTile label="Open" value={open} note={`${percentOf(open, total)}% of all tickets`} />
      <StatTile
        label="Resolved"
        value={resolved}
        note={`${percentOf(resolved, total)}% of all tickets`}
      />
      <StatTile
        label="Resolved by AI"
        value={resolvedByAi}
        note={`${percentOf(resolvedByAi, resolved)}% of resolved tickets`}
      />
    </div>
  );
}
