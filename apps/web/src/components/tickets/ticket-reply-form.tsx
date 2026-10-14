import {
  type CreateReplyInput,
  type CreateReplyResponse,
  createReplySchema,
  type PolishReplyResponse,
  type TicketListItem,
} from '@helpdesk/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { apiPost } from '@/lib/api';

/**
 * Reply box under a ticket's conversation. "Polish" rewrites the draft with AI for the Agent to
 * review; "Save reply" saves it to the thread (not emailed yet).
 */
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

  const polishReply = useMutation({
    mutationFn: (values: CreateReplyInput) =>
      apiPost<PolishReplyResponse>(`/tickets/${ticket.id}/replies/polish`, values),
    onSuccess: ({ body }, { body: draft }) => {
      form.setValue('body', body, { shouldDirty: true, shouldValidate: true });
      toast.success('Reply polished', {
        description: 'Review it before saving.',
        action: {
          label: 'Undo',
          onClick: () => form.setValue('body', draft, { shouldDirty: true, shouldValidate: true }),
        },
      });
    },
    onError: (err) => {
      form.setError('root', { message: err.message || "Couldn't polish the reply" });
    },
  });

  // Nothing to save or polish until the Agent has written something besides whitespace
  const isEmpty = !useWatch({ control: form.control, name: 'body' }).trim();
  const busy = saveReply.isPending || polishReply.isPending;
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
                // The polished draft replaces the text, so edits made meanwhile would be lost
                readOnly={polishReply.isPending}
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
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || isEmpty}
            onClick={form.handleSubmit((values) => polishReply.mutate(values))}
          >
            <Sparkles />
            {polishReply.isPending ? 'Polishing…' : 'Polish'}
          </Button>
          <Button type="submit" disabled={busy || isEmpty}>
            {saveReply.isPending ? 'Saving…' : 'Save reply'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
