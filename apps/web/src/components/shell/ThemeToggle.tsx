'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { setTheme } from '@/app/actions/theme';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setLocal] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme');
    setLocal(t === 'light' ? 'light' : 'dark');
  }, []);

  async function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    setLocal(next);
    await setTheme(next);
  }

  const icon =
    theme === 'light' ? (
      <Moon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
    ) : (
      <Sun className="h-4 w-4 shrink-0" strokeWidth={1.5} />
    );

  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
      >
        {theme === null ? null : icon}
      </button>
    );
  }

  // Full sidebar variant — hold layout space while hydrating
  if (theme === null) {
    return <div className="h-9 w-full" aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={label}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
    >
      {icon}
      <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}
