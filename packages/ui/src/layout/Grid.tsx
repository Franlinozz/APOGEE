import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  smCols?: 1 | 2 | 3 | 4;
  mdCols?: 1 | 2 | 3 | 4;
  lgCols?: 1 | 2 | 3 | 4 | 6;
  gap?: 2 | 4 | 6 | 8;
}

const COL_MAP: Record<number, string> = {
  1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
  4: 'grid-cols-4', 6: 'grid-cols-6', 12: 'grid-cols-12',
};
const SM_MAP: Record<number, string> = {
  1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4',
};
const MD_MAP: Record<number, string> = {
  1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4',
};
const LG_MAP: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4', 6: 'lg:grid-cols-6',
};
const GAP_MAP: Record<number, string> = { 2: 'gap-2', 4: 'gap-4', 6: 'gap-6', 8: 'gap-8' };

export function Grid({ className, cols = 1, smCols, mdCols, lgCols, gap = 6, ...props }: GridProps) {
  return (
    <div
      className={cn(
        'grid',
        COL_MAP[cols],
        smCols && SM_MAP[smCols],
        mdCols && MD_MAP[mdCols],
        lgCols && LG_MAP[lgCols],
        GAP_MAP[gap] ?? 'gap-6',
        className,
      )}
      {...props}
    />
  );
}
