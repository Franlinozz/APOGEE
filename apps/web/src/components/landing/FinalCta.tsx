import Link from 'next/link';
import { InViewReveal } from '@/components/motion/InViewReveal';

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <InViewReveal>
        <div
          className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-line-accent)] p-12 text-center"
          style={{
            background:
              'radial-gradient(ellipse 80% 120% at 50% -20%, rgba(124,95,241,0.18) 0%, transparent 70%)',
          }}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Get started
          </p>
          <h2
            className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-fg"
            style={{ letterSpacing: '-0.02em' }}
          >
            Build agents that operate, earn, and prove their work on-chain.
          </h2>
          <p className="prose-width mx-auto mt-4 text-[1.0625rem] text-fg-muted">
            The TypeScript SDK is open source. Connect your wallet, deploy an agent,
            and trigger your first skill in under five minutes.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-[var(--radius-lg)] bg-accent px-7 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
            >
              Open dashboard
            </Link>
            <a
              href="https://github.com/Franlinozz/APOGEE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-[var(--radius-lg)] border border-[var(--color-line-bright)] px-7 text-sm font-medium text-fg/85 transition-colors hover:bg-white/[0.05]"
            >
              View on GitHub
            </a>
          </div>
        </div>
        </InViewReveal>
      </div>
    </section>
  );
}
