import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const SIZE_MAP = {
  sm:   'max-w-2xl',
  md:   'max-w-4xl',
  lg:   'max-w-5xl',
  xl:   'max-w-7xl',
  full: 'max-w-none',
};

export function Container({ className, size = 'xl', ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE_MAP[size], className)}
      {...props}
    />
  );
}
