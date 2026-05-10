'use client';

import { Toaster as Sonner } from 'sonner';

export type ToastProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToastProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster"
      toastOptions={{
        classNames: {
          toast:
            'group toast border border-DEFAULT bg-surface text-fg shadow-card rounded-[var(--radius-lg)]',
          description: 'text-fg-muted',
          actionButton: 'bg-accent text-white',
          cancelButton: 'bg-elevated text-fg-muted',
          closeButton: 'border-DEFAULT',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
