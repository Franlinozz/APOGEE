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
        <Link href="/" className="flex items-center gap-2" aria-label="Apogee home">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-fg"
            aria-hidden
          >
            <ellipse
              cx="16" cy="16" rx="14" ry="8"
              stroke="currentColor" strokeWidth="1"
              opacity="0.28"
              transform="rotate(-15 16 16)"
            />
            <path
              d="M 16 5 L 26.5 27 H 5.5 Z"
              stroke="currentColor" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round"
            />
            <line
              x1="10.5" y1="20" x2="21.5" y2="20"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="5" r="3.5" fill="#7C5FF1" />
            <circle cx="16" cy="5" r="1.8" fill="#EDE0FF" opacity="0.9" />
          </svg>
          <span className="text-sm font-semibold text-fg">Apogee</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_LINKS.map(({ href, label, external }) => (
            <Link
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-sm text-fg-muted transition-colors hover:text-fg"
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
