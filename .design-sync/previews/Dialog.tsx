import * as React from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
} from 'crew-dashboard';

/**
 * The base dialog primitive composed as the Resume-run flow: header with
 * title + description, a form body, and right-aligned footer actions.
 */
export const ResumeRunDialog = () => (
  <Dialog open onOpenChange={() => {}}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Resume run CREW-295</DialogTitle>
        <DialogDescription>
          The agent is idle at a checkpoint. Send a follow-up message to continue the run in the
          same worktree.
        </DialogDescription>
      </DialogHeader>
      <FormField label="Message" placeholder="Address the review comments on PR #452" />
      <DialogFooter>
        <DialogClose asChild>
          <Button color="running" intensity="ghost" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button color="white" intensity="loud" size="sm">
          Resume run
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
