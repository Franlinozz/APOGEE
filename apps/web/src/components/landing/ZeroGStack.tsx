import Link from 'next/link';
import { InViewReveal } from '@/components/motion/InViewReveal';

const STACK_ITEMS = [
  { label: '0G Storage',  href: 'https://docs.0g.ai/0g-storage',          desc: 'Decentralised data layer' },
  { label: '0G Compute',  href: 'https://docs.0g.ai/0g-compute',           desc: 'Verifiable inference' },
  { label: '0G Chain',    href: 'https://docs.0g.ai/0g-chain',             desc: 'EVM-compatible L1' },
  { label: 'Agent ID',    href: 'https://eips.ethereum.org/EIPS/eip-7857', desc: 'ERC-7857 identity NFT' },
  { label: 'TEE',         href: 'https://docs.0g.ai/0g-compute#tee',       desc: 'Trusted execution' },
] as const;

export function ZeroGStack() {
  return (
    <section id="stack" className="border-y border-[var(--color-line)] py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <InViewReveal>
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.25em] text-fg-faint">
            Powered by the 0G stack
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {STACK_ITEMS.map(({ label, href, desc }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={desc}
                className={[
                  'group inline-flex items-center gap-2 rounded-full',
                  'border border-[var(--color-line)] bg-surface px-4 py-2',
                  'text-sm text-fg-muted',
                  'transition-[border-color,color,transform] duration-[200ms]',
                  'hover:border-[var(--color-line-accent)] hover:text-accent-light hover:-translate-y-0.5',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-fg-faint transition-colors duration-[200ms] group-hover:bg-accent"
                />
                {label}
              </Link>
            ))}
          </div>
        </InViewReveal>
      </div>
    </section>
  );
}
