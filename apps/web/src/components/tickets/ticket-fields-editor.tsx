import {
  type AssigneeListResponse,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketListItem,
  type TicketStatus,
  type UpdateTicketInput,
  type UpdateTicketResponse,
} from '@helpdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiGet, apiPatch } from '@/lib/api';

// Radix Select items can't have an empty value, so "nobody" gets its own
const UNASSIGNED = 'UNASSIGNED';

interface TicketFieldsEditorProps {
  ticket: Pick<TicketListItem, 'id' | 'status' | 'category' | 'assignee'>;
}

/** Status, category and assignee dropdowns that save each change right away. */
export function TicketFieldsEditor({ ticket }: TicketFieldsEditorProps) {
  const statusLabelId = useId();
  const categoryLabelId = useId();
  const assigneeLabelId = useId();
  const queryClient = useQueryClient();
  const assigneesQuery = useQuery({
    queryKey: ['assignees'],
    queryFn: () => apiGet<AssigneeListResponse>('/assignees'),
  });
  const updateTicket = useMutation({
    mutationFn: (changes: UpdateTicketInput) =>
      apiPatch<UpdateTicketResponse>(`/tickets/${ticket.id}`, changes),
    // Awaited, so the dropdowns stay pending until this ticket and the list show the change
    onSuccess: async ({ ticket: updated }, { status, category, assigneeId }) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      if (status) toast.success(`Status changed to ${TICKET_STATUS_LABELS[status]}`);
      if (category) toast.success(`Category changed to ${TICKET_CATEGORY_LABELS[category]}`);
      if (assigneeId !== undefined) {
        toast.success(updated.assignee ? `Assigned to ${updated.assignee.name}` : 'Unassigned');
      }
    },
    onError: (error) => {
      toast.error(`Couldn't update the ticket: ${error.message}`);
    },
  });

  // While saving, show the new value (it snaps back if the request fails)
  const pending = updateTicket.isPending ? updateTicket.variables : undefined;
  const status = pending?.status ?? ticket.status;
  const category = pending?.category ?? ticket.category;
  const assigneeId =
    pending?.assigneeId !== undefined ? pending.assigneeId : (ticket.assignee?.id ?? null);

  // The current assignee stays listed even if they can't be picked any more (e.g. deactivated)
  const assignees = assigneesQuery.data?.assignees ?? [];
  const assigneeOptions =
    ticket.assignee && !assignees.some(({ id }) => id === ticket.assignee?.id)
      ? [ticket.assignee, ...assignees]
      : assignees;

  return (
    <>
      <div>
        <dt id={statusLabelId} className="text-muted-foreground">
          Status
        </dt>
        <dd className="mt-1">
          <Select
            value={status}
            onValueChange={(value) => updateTicket.mutate({ status: value as TicketStatus })}
            disabled={updateTicket.isPending}
          >
            <SelectTrigger size="sm" aria-labelledby={statusLabelId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TICKET_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </dd>
      </div>
      <div>
        <dt id={categoryLabelId} className="text-muted-foreground">
          Category
        </dt>
        <dd className="mt-1">
          <Select
            // No value shows the placeholder for a ticket that was never classified
            value={category ?? ''}
            onValueChange={(value) => updateTicket.mutate({ category: value as TicketCategory })}
            disabled={updateTicket.isPending}
          >
            <SelectTrigger size="sm" aria-labelledby={categoryLabelId} className="w-full">
              <SelectValue placeholder="Not classified" />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TICKET_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </dd>
      </div>
      <div>
        <dt id={assigneeLabelId} className="text-muted-foreground">
          Assignee
        </dt>
        <dd className="mt-1">
          <Select
            value={assigneeId ?? UNASSIGNED}
            onValueChange={(value) =>
              updateTicket.mutate({ assigneeId: value === UNASSIGNED ? null : value })
            }
            // Picking someone needs the list; it shows the current assignee meanwhile
            disabled={updateTicket.isPending || !assigneesQuery.data}
          >
            <SelectTrigger size="sm" aria-labelledby={assigneeLabelId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {assigneeOptions.map(({ id, name }) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assigneesQuery.error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              Couldn't load assignees: {assigneesQuery.error.message}
            </p>
          )}
        </dd>
      </div>
    </>
  );
}
