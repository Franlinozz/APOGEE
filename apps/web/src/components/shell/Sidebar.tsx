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
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/agents',        label: 'Agents',        icon: Bot },
  { href: '/marketplace',   label: 'Marketplace',   icon: ShoppingBag },
  { href: '/receipts',      label: 'Receipts',      icon: FileText },
  { href: '/memory',        label: 'Memory',        icon: BrainCircuit },
  { href: '/policies',      label: 'Policies',      icon: Shield },
  { href: '/apogee-pilot',  label: 'Apogee Pilot',  icon: Rocket },
];

async function signOut() {
  await fetch('/api/auth/clear-cookie', { method: 'POST' });
  window.location.href = '/';
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar flex h-full w-56 flex-col border-r border-[var(--color-line)] bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b border-[var(--color-line)]">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Apogee home">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 shrink-0 text-fg"
            aria-hidden
          >
            <path d="M16 4 L28 29 H4 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="miter" />
            <path d="M9 20 L23 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M4.5 27 Q10 2 28 8" stroke="#7C5FF1" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M28 5.5 L28.78 7.22 L30.5 8 L28.78 8.78 L28 10.5 L27.22 8.78 L25.5 8 L27.22 7.22 Z" fill="#7C5FF1" />
          </svg>
          <span className="text-xs font-bold tracking-[0.14em] uppercase text-fg">Apogee</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="App navigation">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  data-active={active ? 'true' : undefined}
                  className={[
                    'nav-item flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors',
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

      {/* Footer: theme toggle + sign out */}
      <div className="border-t border-[var(--color-line)] px-3 py-3 space-y-0.5">
        <ThemeToggle />
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
