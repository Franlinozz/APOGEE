import Link from 'next/link';
import { ApogeeLogo } from '@/components/brand/apogee-logo';

const CONTRACTS = [
  { label: 'PaymentRouter',   address: '0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c' },
  { label: 'ReceiptBook',     address: '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53' },
  { label: 'AgentIdentity',   address: '0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3' },
  { label: 'PolicyEngine',    address: '0xa8933d96A27BDfFac07C0d7467f3213cb340f550' },
  { label: 'AccountFactory',  address: '0xABc44aF98e6d873C0700c9B687fbf3Be560cba90' },
] as const;

const NAV_COLS = [
  {
    title: 'Protocol',
    links: [
      { label: 'Docs',      href: '/docs' },
      { label: 'Receipts',  href: '/proofs' },
      { label: 'Skills',    href: '/docs' },
      { label: 'SDK',       href: '/docs' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub',   href: 'https://github.com/Franlinozz/APOGEE', external: true },
      { label: '0G Docs',  href: 'https://docs.0g.ai', external: true },
      { label: 'Explorer', href: 'https://chainscan.0g.ai', external: true },
    ],
  },
] as const;

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <Link href="/" aria-label="Apogee home" className="inline-flex max-w-full items-center overflow-visible">
                <ApogeeLogo mode="footer" />
              </Link>
            </div>
            <p className="prose-width text-sm leading-relaxed text-fg-muted">
              The runtime layer for autonomous AI agents on 0G — self-custodial wallets,
              encrypted memory, verifiable on-chain receipts.
            </p>

            {/* Deployed contracts */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-fg-faint">
                Aristotle contracts
              </p>
              <ul className="space-y-2">
                {CONTRACTS.map(({ label, address }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="w-28 text-xs text-fg-muted">{label}</span>
                    <a
                      href={`https://chainscan.0g.ai/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-fg-faint transition-colors hover:text-accent-light"
                    >
                      {truncate(address)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Nav cols */}
          {NAV_COLS.map(({ title, links }) => (
            <div key={title}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-fg-faint">
                {title}
              </p>
              <ul className="space-y-3">
                {links.map(({ label, href, ...rest }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      {...('external' in rest && rest.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className="text-sm text-fg-muted transition-colors hover:text-fg"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-[var(--color-line)] pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-fg-faint">
            © {year} Apogee Protocol. MIT License.
          </p>
          <p className="text-xs text-fg-faint">
            Aristotle Mainnet · Chain ID 16661
          </p>
        </div>
      </div>
    </footer>
  );
}
