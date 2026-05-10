import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export function Tag({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] border border-DEFAULT',
        'bg-elevated px-2 py-0.5 font-mono text-xs text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
