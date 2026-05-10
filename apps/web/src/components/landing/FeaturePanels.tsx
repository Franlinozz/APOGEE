import { ArrowRight, BrainCircuit, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

const PANELS = [
  {
    id: 'wallet',
    icon: Shield,
    title: 'Smart Wallet',
    description:
      'Every agent gets an ERC-4337 account with programmable spending policies. Set per-transaction limits, daily caps, and pause/resume in one API call.',
    href: '/docs/wallet',
    linkLabel: 'Learn more about Smart Wallet',
  },
  {
    id: 'memory',
    icon: BrainCircuit,
    title: 'Encrypted Memory',
    description:
      'AES-256-GCM encrypted blobs on 0G Storage, indexed by embedding vector. Agents remember across sessions; owners keep the keys.',
    href: '/docs/memory',
    linkLabel: 'Learn more about Encrypted Memory',
  },
  {
    id: 'rails',
    icon: Zap,
    title: 'Payment Rails',
    description:
      'Agent-to-agent 402 quote/settle protocol over 0G Chain. Every billable action emits an on-chain receipt with storage root and attestation digest.',
    href: '/docs/payments',
    linkLabel: 'Learn more about Payment Rails',
  },
];

export function FeaturePanels() {
  return (
    <section id="product" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-16 max-w-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Platform
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-fg" style={{ letterSpacing: '-0.02em' }}>
            Everything an agent needs to operate independently.
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PANELS.map(({ id, icon: Icon, title, description, href, linkLabel }) => (
            <div
              key={id}
              className={[
                'group relative flex flex-col rounded-[var(--radius-xl)]',
                'border border-[var(--color-line)] bg-surface p-7',
                'transition-[border-color,box-shadow] duration-[350ms]',
                'hover:border-[var(--color-line-accent)] hover:shadow-[var(--shadow-card-hover)]',
              ].join(' ')}
            >
              {/* Icon */}
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated">
                <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
              </div>

              {/* Copy */}
              <h3 className="mb-2 text-base font-semibold text-fg">{title}</h3>
              <p className="flex-1 text-sm leading-relaxed text-fg-muted">{description}</p>

              {/* Learn more */}
              <Link
                href={href}
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-accent"
              >
                Learn more<span className="sr-only"> about {title}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>

              {/* Accent underline on hover */}
              <div
                aria-hidden
                className="absolute inset-x-7 bottom-0 h-px bg-accent/0 transition-colors duration-[350ms] group-hover:bg-accent/30"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
