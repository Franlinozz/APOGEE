'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={4}
          className={cn(
            'w-full rounded-[var(--radius)] border border-DEFAULT bg-surface px-3 py-2.5 text-sm text-fg',
            'placeholder:text-fg-faint resize-y min-h-[80px]',
            'transition-colors duration-base',
            'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            error && 'border-danger/60 focus:border-danger/60 focus:ring-danger/20',
            className,
          )}
          {...props}
        />
        {(hint ?? error) && (
          <p className={cn('text-xs', error ? 'text-danger' : 'text-fg-muted')}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
