import type { TicketSummaryResponse } from '@helpdesk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiPost } from '@/lib/api';

interface TicketSummaryCardProps {
  ticket: { id: string; summary: string | null };
  /** Placement on the page, e.g. the grid column */
  className?: string;
}

/** The ticket's AI summary, with a button that (re)summarizes the conversation and saves it. */
export function TicketSummaryCard({ ticket, className }: TicketSummaryCardProps) {
  const queryClient = useQueryClient();
  const summarize = useMutation({
    mutationFn: () => apiPost<TicketSummaryResponse>(`/tickets/${ticket.id}/summary`, {}),
    // Awaited, so the button stays pending until the new summary shows
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Summary updated');
    },
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Summary</h2>
        </CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={summarize.isPending}
            onClick={() => summarize.mutate()}
          >
            <Sparkles />
            {summarize.isPending ? 'Summarizing…' : ticket.summary ? 'Resummarize' : 'Summarize'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {ticket.summary ? (
          <p className="whitespace-pre-line">{ticket.summary}</p>
        ) : (
          <p className="text-muted-foreground">
            No summary yet. Summarize the conversation with AI.
          </p>
        )}
        {summarize.isError && (
          <p role="alert" className="text-destructive">
            {summarize.error.message || "Couldn't summarize the ticket"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
