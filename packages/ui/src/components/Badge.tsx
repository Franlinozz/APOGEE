import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-success/10 text-success border border-success/20',
        warning: 'bg-warning/10 text-warning border border-warning/20',
        danger:  'bg-danger/10 text-danger border border-danger/20',
        neutral: 'bg-neutral/10 text-fg-muted border border-DEFAULT',
        accent:  'bg-accent/10 text-accent-light border border-accent/20',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
