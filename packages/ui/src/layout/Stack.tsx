import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;
}

const GAP_MAP: Record<number, string> = {
  0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4',
  5: 'gap-5', 6: 'gap-6', 8: 'gap-8', 10: 'gap-10', 12: 'gap-12', 16: 'gap-16',
};

export function Stack({ className, gap = 4, ...props }: StackProps) {
  return (
    <div className={cn('flex flex-col', GAP_MAP[gap] ?? 'gap-4', className)} {...props} />
  );
}
