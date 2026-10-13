import {
  type CreateReplyInput,
  type CreateReplyResponse,
  createReplySchema,
  type TicketListItem,
} from '@helpdesk/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { apiPost } from '@/lib/api';

/** Reply box under a ticket's conversation. Saves the reply to the thread (not emailed yet). */
interface TicketReplyFormProps {
  /** The ticket being replied to */
  ticket: TicketListItem;
}

export function TicketReplyForm({ ticket }: TicketReplyFormProps) {
  const bodyId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const form = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: { body: '' },
  });

  const saveReply = useMutation({
    mutationFn: (values: CreateReplyInput) =>
      apiPost<CreateReplyResponse>(`/tickets/${ticket.id}/replies`, values),
    // Awaited, so the form stays pending until the reply shows in the thread
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      form.reset();
      toast.success('Reply saved');
    },
    onError: (err) => {
      form.setError('root', { message: err.message || "Couldn't save the reply" });
    },
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form onSubmit={form.handleSubmit((values) => saveReply.mutate(values))} noValidate>
      <FieldGroup>
        <Controller
          name="body"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={bodyId}>Reply</FieldLabel>
              <Textarea
                {...field}
                id={bodyId}
                rows={5}
                placeholder="Write your reply…"
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? undefined : hintId}
              />
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription id={hintId}>
                  Saved to the conversation. Emailing replies to the customer isn't set up yet.
                </FieldDescription>
              )}
            </Field>
          )}
        />
        {rootError && (
          <p role="alert" className="text-sm text-destructive">
            {rootError}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={saveReply.isPending}>
            {saveReply.isPending ? 'Saving…' : 'Save reply'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
