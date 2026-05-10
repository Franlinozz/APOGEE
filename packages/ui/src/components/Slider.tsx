'use client';

import * as RadixSlider from '@radix-ui/react-slider';
import { cn } from '../lib/cn.js';

export interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  disabled,
  label,
  className,
}: SliderProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <span className="text-sm font-medium text-fg">{label}</span>}
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={value}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <RadixSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-elevated">
          <RadixSlider.Range className="absolute h-full bg-accent" />
        </RadixSlider.Track>
        {(value ?? defaultValue ?? [50]).map((_, i) => (
          <RadixSlider.Thumb
            key={i}
            className={cn(
              'block h-4 w-4 rounded-full border-2 border-accent bg-bg shadow-glow-sm',
              'transition-colors duration-base',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          />
        ))}
      </RadixSlider.Root>
    </div>
  );
}
