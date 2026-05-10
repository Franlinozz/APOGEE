import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-[var(--radius-xl)]',
        'border border-dashed border-DEFAULT py-16 px-8 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] border border-DEFAULT bg-elevated">
          <Icon className="h-6 w-6 text-fg-muted" strokeWidth={1.5} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="max-w-xs text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
