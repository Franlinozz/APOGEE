'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  label,
  disabled,
  className,
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-fg">{label}</span>}
      <RadixSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <RadixSelect.Trigger
          className={cn(
            'inline-flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius)]',
            'border border-DEFAULT bg-surface px-3 text-sm text-fg',
            'data-[placeholder]:text-fg-faint',
            'transition-colors duration-base focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            className,
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <ChevronDown className="h-4 w-4 text-fg-muted shrink-0" aria-hidden />
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            className={cn(
              'z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius-lg)]',
              'border border-bright bg-elevated shadow-card',
              'data-[state=open]:animate-fade-in',
            )}
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    'relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)]',
                    'py-2 pl-8 pr-3 text-sm text-fg outline-none',
                    'hover:bg-accent/10 focus:bg-accent/10',
                    'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
                  )}
                >
                  <RadixSelect.ItemIndicator className="absolute left-2">
                    <Check className="h-4 w-4 text-accent" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
