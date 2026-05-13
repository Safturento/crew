import { figma } from '@figma/code-connect';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

figma.connect(
  Dialog,
  'https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System?node-id=594-105',
  {
    example: () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button color="running" intensity="mid">
            Open Dialog
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove
              your data from our servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button color="running" intensity="mid">
              Cancel
            </Button>
            <Button color="error" intensity="loud">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  },
);
