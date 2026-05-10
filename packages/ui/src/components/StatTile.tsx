import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface StatTileProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  className?: string;
}

export function StatTile({ label, value, delta, deltaLabel, className }: StatTileProps) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-[var(--radius-xl)] border border-DEFAULT bg-surface p-5',
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {delta !== undefined && (
        <div className={cn('flex items-center gap-1 text-xs font-medium', isPositive ? 'text-success' : 'text-danger')}>
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>
            {isPositive ? '+' : ''}
            {delta}%{deltaLabel && ` ${deltaLabel}`}
          </span>
        </div>
      )}
    </div>
  );
}
