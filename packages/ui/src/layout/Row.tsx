import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
}

const GAP_MAP: Record<number, string> = {
  0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3',
  4: 'gap-4', 5: 'gap-5', 6: 'gap-6', 8: 'gap-8',
};
const ALIGN_MAP = {
  start: 'items-start', center: 'items-center', end: 'items-end',
  baseline: 'items-baseline', stretch: 'items-stretch',
};
const JUSTIFY_MAP = {
  start: 'justify-start', center: 'justify-center', end: 'justify-end',
  between: 'justify-between', around: 'justify-around',
};

export function Row({ className, gap = 4, align = 'center', justify = 'start', wrap = false, ...props }: RowProps) {
  return (
    <div
      className={cn(
        'flex',
        GAP_MAP[gap] ?? 'gap-4',
        ALIGN_MAP[align],
        JUSTIFY_MAP[justify],
        wrap && 'flex-wrap',
        className,
      )}
      {...props}
    />
  );
}
