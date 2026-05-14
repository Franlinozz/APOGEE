import Link from 'next/link';
import dynamic from 'next/dynamic';

const NavConnectButton = dynamic(
  () => import('./NavConnectButton').then((m) => m.NavConnectButton),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 w-32 animate-pulse rounded-[var(--radius)] bg-accent/30" />
    ),
  },
);

const NavThemeToggle = dynamic(
  () => import('@/components/shell/ThemeToggle').then((m) => m.ThemeToggle),
  { ssr: false },
);

const NAV_LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/#skills',  label: 'Skills' },
  { href: '/proofs',   label: 'Receipts' },
  { href: '/docs',     label: 'Docs' },
  {
    href: 'https://github.com/Franlinozz/APOGEE',
    label: 'GitHub',
    external: true,
  },
];

export function Nav() {
  return (
    <header className="landing-nav fixed inset-x-0 top-0 z-50 h-14">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logotype — SVG mark + wordmark text, inherits currentColor */}
        <Link href="/" className="flex items-center gap-2.5" aria-label="Apogee home">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 shrink-0 text-fg"
            aria-hidden
          >
            <path d="M16 4 L28 29 H4 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="miter" />
            <path d="M9 20 L23 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M4.5 27 Q10 2 28 8" stroke="#7C5FF1" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M28 5.5 L28.78 7.22 L30.5 8 L28.78 8.78 L28 10.5 L27.22 8.78 L25.5 8 L27.22 7.22 Z" fill="#7C5FF1" />
          </svg>
          <span className="text-xs font-bold tracking-[0.14em] uppercase text-fg">Apogee</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_LINKS.map(({ href, label, external }) => (
            <Link
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="nav-link-underline text-sm text-fg-muted transition-colors duration-[180ms] hover:text-fg"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <NavThemeToggle compact />
          <NavConnectButton />
        </div>
      </div>
    </header>
  );
}
