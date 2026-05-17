'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '/#product', label: 'Product',   external: false },
  { href: '/#skills',  label: 'Skills',    external: false },
  { href: '/proofs',   label: 'Receipts',  external: false },
  { href: '/docs',     label: 'Docs',      external: false },
  { href: 'https://github.com/Franlinozz/APOGEE', label: 'GitHub', external: true },
];

export function LandingMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="md:hidden flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-fg-muted transition-colors hover:text-fg"
      >
        {open ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 top-[72px] sm:top-20"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={[
          'md:hidden fixed left-0 right-0 top-[72px] sm:top-20 z-50',
          'border-b border-[var(--color-line)] bg-surface/95 shadow-lg backdrop-blur-md',
          'transition-all duration-200 origin-top',
          open ? 'opacity-100 scale-y-100 pointer-events-auto' : 'opacity-0 scale-y-95 pointer-events-none',
        ].join(' ')}
      >
        <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Mobile navigation">
          <ul>
            {NAV_LINKS.map(({ href, label, external }) => (
              <li key={label} className="border-b border-[var(--color-line)] last:border-0">
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex items-center justify-between py-3.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
                >
                  {label}
                  {external && (
                    <span className="text-xs text-fg-faint">↗</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
