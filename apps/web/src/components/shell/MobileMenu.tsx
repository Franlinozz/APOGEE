'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApogeeLogo } from '@/components/brand/apogee-logo';
import {
  Menu,
  X,
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
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/agents',       label: 'Agents',       icon: Bot },
  { href: '/marketplace',  label: 'Marketplace',  icon: ShoppingBag },
  { href: '/receipts',     label: 'Receipts',     icon: FileText },
  { href: '/memory',       label: 'Memory',       icon: BrainCircuit },
  { href: '/policies',     label: 'Policies',     icon: Shield },
  { href: '/apogee-pilot', label: 'Apogee Pilot', icon: Rocket },
];

async function signOut() {
  await fetch('/api/auth/clear-cookie', { method: 'POST' });
  window.location.href = '/';
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      {/* Hamburger trigger — mobile only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="md:hidden fixed top-0 left-0 z-40 flex h-14 w-14 items-center justify-center text-fg-muted hover:text-fg"
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={[
          'md:hidden fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface border-r border-[var(--color-line)] transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-line)] px-4">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center overflow-visible">
            <ApogeeLogo mode="sidebar" priority />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="text-fg-muted hover:text-fg"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
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
                    data-active={active ? 'true' : undefined}
                    className={[
                      'flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-sm transition-colors',
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

        {/* Footer */}
        <div className="border-t border-[var(--color-line)] px-3 py-3 space-y-0.5">
          <ThemeToggle />
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
