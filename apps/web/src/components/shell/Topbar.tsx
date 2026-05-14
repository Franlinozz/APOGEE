import { cookies } from 'next/headers';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';

const TopbarThemeToggle = dynamic(
  () => import('./ThemeToggle').then((m) => m.ThemeToggle),
  { ssr: false },
);

export function Topbar({ title }: { title?: string }) {
  const jwt = cookies().get('apogee-jwt')?.value ?? '';
  let address = '';
  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      address = payload.address ?? payload.sub ?? '';
    } catch {}
  }

  return (
    <header className="app-topbar flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-6">
      {title && (
        <h1 className="text-sm font-semibold text-fg">{title}</h1>
      )}
      {!title && <div />}

      <div className="flex items-center gap-2">
        <TopbarThemeToggle compact />
        <Link
          href="/agents/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-accent px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New agent
        </Link>
        {address && (
          <span className="rounded-full border border-[var(--color-line)] bg-elevated px-3 py-1 font-mono text-xs text-fg-muted">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}
      </div>
    </header>
  );
}
