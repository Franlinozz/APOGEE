import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border border-DEFAULT bg-surface p-5',
        'shadow-card',
        hover && [
          'transition-shadow transition-colors duration-slow cursor-pointer',
          'hover:border-accent hover:shadow-card-hover',
        ],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-fg-muted', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-4 flex items-center justify-between border-t border-DEFAULT pt-4', className)} {...props} />
  );
}
