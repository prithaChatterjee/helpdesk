import type { UserListItem } from '@helpdesk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { apiDelete } from '@/lib/api';

/**
 * Trash button on a Users table row and the confirmation before deleting that user.
 * Only for Agents: the API refuses to delete Admins, so their rows don't render this.
 */
export function DeleteUserDialog({ user }: { user: UserListItem }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteUser = useMutation({
    mutationFn: () => apiDelete(`/users/${user.id}`),
    // Awaited, so the dialog stays pending until the user is gone from the table
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Deleted ${user.name} (${user.email})`);
      setOpen(false);
    },
  });

  function onOpenChange(next: boolean) {
    // Don't close mid-request; clear the last attempt's error when reopening
    if (deleteUser.isPending) return;
    if (next) deleteUser.reset();
    setOpen(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${user.name}`}
          className="text-destructive hover:text-destructive"
        >
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {user.email} will be signed out and won't be able to sign in again. They'll no longer
            appear in the users list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteUser.error && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't delete the user: {deleteUser.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteUser.isPending}
            onClick={(event) => {
              // Keep the dialog open until the request finishes (Action closes it by default)
              event.preventDefault();
              deleteUser.mutate();
            }}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
