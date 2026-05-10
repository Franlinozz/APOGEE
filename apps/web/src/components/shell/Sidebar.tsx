'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  ShoppingBag,
  BrainCircuit,
  FileText,
  Shield,
  Rocket,
  LogOut,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/receipts', label: 'Receipts', icon: FileText },
  { href: '/memory', label: 'Memory', icon: BrainCircuit },
  { href: '/policies', label: 'Policies', icon: Shield },
  { href: '/apogee-pilot', label: 'Apogee Pilot', icon: Rocket },
];

async function signOut() {
  await fetch('/api/auth/clear-cookie', { method: 'POST' });
  window.location.href = '/';
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-[var(--color-line)] bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-[var(--color-line)]">
        <Link href="/" className="text-sm font-semibold tracking-tight text-fg">
          Apogee<span className="text-accent">.</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={[
                    'flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-fg-muted hover:bg-elevated hover:text-fg',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="border-t border-[var(--color-line)] px-3 py-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
