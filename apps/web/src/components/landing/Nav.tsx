import Link from 'next/link';

const NAV_LINKS = [
  { href: '#product',  label: 'Product' },
  { href: '#skills',   label: 'Skills' },
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
      className="fixed inset-x-0 top-0 z-50 h-14"
      style={{
        background: 'rgba(8,10,18,0.72)',
        backdropFilter: 'blur(16px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
        borderBottom: 'var(--color-line)',
      }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logotype */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg"
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#7C5FF1,#A78BFA)' }}
            aria-hidden
          >
            A
          </span>
          Apogee
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

        {/* CTA — Connect Wallet placeholder (wagmi wired in dashboard prompt) */}
        <a
          href="/dashboard"
          className="inline-flex h-8 items-center rounded-[var(--radius)] bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent/85"
        >
          Connect Wallet
        </a>
      </div>
    </header>
  );
}
