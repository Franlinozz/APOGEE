'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn.js';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-medium',
    'transition-[colors,transform] duration-base',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      variant: {
        primary:   'bg-accent text-white hover:bg-accent/85 active:bg-accent/75 active:scale-[0.97]',
        secondary: 'border border-DEFAULT bg-surface text-fg hover:bg-elevated active:scale-[0.97]',
        ghost:     'border border-DEFAULT text-fg/85 hover:bg-elevated hover:border-bright',
        danger:    'bg-danger text-white hover:bg-danger/85 active:bg-danger/75',
        link:      'text-accent underline-offset-4 hover:underline p-0 h-auto min-h-0',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
