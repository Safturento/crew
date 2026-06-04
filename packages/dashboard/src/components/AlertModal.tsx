import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

type AlertModalProps = {
  title: string;
  description: string;
  cancelLabel?: string;
  actionLabel?: string;
  actionColor?: PillColor;
  actionIntensity?: PillIntensity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
  onAction?: () => void;
};

function AlertModal({
  title,
  description,
  cancelLabel = 'Cancel',
  actionLabel = 'Continue',
  actionColor = 'error',
  actionIntensity = 'loud',
  open,
  onOpenChange,
  onCancel,
  onAction,
}: AlertModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[440px] gap-2.5 rounded-[14px] border-border bg-slate-950 p-5.5 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)] sm:max-w-[440px]">
        <AlertDialogTitle className="text-base font-semibold text-foreground">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-muted-foreground">
          {description}
        </AlertDialogDescription>
        <AlertDialogFooter className="mt-2 flex flex-row justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button color="running" intensity="mid" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button color={actionColor} intensity={actionIntensity} size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { AlertModal };
