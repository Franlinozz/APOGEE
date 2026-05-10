'use client';

import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '../lib/cn.js';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export function Switch({ checked, defaultChecked, onCheckedChange, disabled, label, id, className }: SwitchProps) {
  const switchId = id ?? (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RadixSwitch.Root
        id={switchId}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
          'border-2 border-transparent bg-elevated',
          'transition-colors duration-base',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          'data-[state=checked]:bg-accent',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm',
            'transition-transform duration-base',
            'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
          )}
        />
      </RadixSwitch.Root>
      {label && (
        <label htmlFor={switchId} className="text-sm text-fg cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  );
}
