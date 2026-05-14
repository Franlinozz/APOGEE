import Link from 'next/link';
import Image from 'next/image';
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
        {/* Logotype — PNG brand assets, theme-aware via CSS */}
        <Link href="/" className="flex items-center" aria-label="Apogee home">
          <Image
            src="/brand/apogee-logo-dark.png"
            alt="Apogee"
            width={140}
            height={32}
            className="theme-logo-dark h-7 w-auto"
            priority
          />
          <Image
            src="/brand/apogee-logo-light.png"
            alt="Apogee"
            width={140}
            height={32}
            className="theme-logo-light h-7 w-auto"
            priority
          />
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
