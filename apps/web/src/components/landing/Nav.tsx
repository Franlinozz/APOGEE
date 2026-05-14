import Image from 'next/image';
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
    <header
      className="landing-nav fixed inset-x-0 top-0 z-50 h-14"
      style={{
        background: 'rgba(8,10,18,0.72)',
        backdropFilter: 'blur(16px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logotype */}
        <Link href="/" className="flex items-center" aria-label="Apogee home">
          {/* Dark logo (default) */}
          <Image
            src="/brand/apogee-logo-dark.webp"
            alt="Apogee"
            width={1023}
            height={489}
            className="theme-logo-dark h-7 w-auto object-contain"
            priority
          />
          {/* Light logo */}
          <Image
            src="/brand/apogee-logo-light.webp"
            alt="Apogee"
            width={1023}
            height={489}
            className="theme-logo-light h-7 w-auto object-contain"
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
              className="text-sm text-fg-muted transition-colors hover:text-fg"
            >
              {label}
            </Link>
          ))}
        </nav>

        <NavConnectButton />
      </div>
    </header>
  );
}
