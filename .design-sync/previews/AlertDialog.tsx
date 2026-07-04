import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from 'crew-dashboard';

/**
 * The raw alert-dialog primitive: destructive confirmation with unstyled
 * Action/Cancel wrappers taking their look from `Button` via `asChild` —
 * exactly how the Crew composites consume it.
 */
export const DeleteWorktreeAlert = () => (
  <AlertDialog open onOpenChange={() => {}}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete worktree?</AlertDialogTitle>
        <AlertDialogDescription>
          This removes ~/Repos/crew-CREW-279 and its branch crew/CREW-279-new-run-picker. Any
          uncommitted changes in the worktree will be lost.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button color="running" intensity="mid" size="sm">
            Keep worktree
          </Button>
        </AlertDialogCancel>
        <AlertDialogAction asChild>
          <Button color="error" intensity="loud" size="sm">
            Delete worktree
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
