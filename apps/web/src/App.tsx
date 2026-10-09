import { TICKET_CATEGORIES, TICKET_CATEGORY_LABELS } from '@helpdesk/shared';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ApiStatus = 'checking' | 'ok' | 'down';

function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((res) => setStatus(res.ok ? 'ok' : 'down'))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error(err);
          setStatus('down');
        }
      });
    return () => controller.abort();
  }, []);

  return status;
}

const STATUS_BADGE: Record<
  ApiStatus,
  { label: string; variant: 'secondary' | 'default' | 'destructive' }
> = {
  checking: { label: 'Checking…', variant: 'secondary' },
  ok: { label: 'Online', variant: 'default' },
  down: { label: 'Unreachable', variant: 'destructive' },
};

export default function App() {
  const status = useApiStatus();
  const badge = STATUS_BADGE[status];

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Helpdesk</CardTitle>
          <CardDescription>Project scaffold is running.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span>API</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <div className="space-y-2">
            <span className="text-muted-foreground">Ticket categories (from @helpdesk/shared)</span>
            <div className="flex flex-wrap gap-2">
              {TICKET_CATEGORIES.map((c) => (
                <Badge key={c} variant="outline">
                  {TICKET_CATEGORY_LABELS[c]}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
