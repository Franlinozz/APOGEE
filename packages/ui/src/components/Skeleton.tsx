import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/*
 * Pure-CSS shimmer skeleton — no JS, no framer.
 * The shimmer gradient is animated via the `shimmer` keyframe defined in the tailwind preset.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-[var(--radius)] bg-elevated',
        'bg-gradient-to-r from-elevated via-surface/80 to-elevated bg-[length:200%_100%]',
        'animate-shimmer',
        className,
      )}
      {...props}
    />
  );
}
