import Image from 'next/image';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────
   Pure server component — zero client JS.
   Single-column centered layout; orbital is a background motif.
   CSS animation gated on prefers-reduced-motion.
   All colors via CSS vars — light/dark handled without JS.
───────────────────────────────────────────────────────── */
export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-[104px] sm:pt-32 lg:pt-36"
    >
      {/* Radial gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'var(--hero-bg)' }}
      />

      {/* Paid sphere asset — full-bleed decorative hero atmosphere. */}
      <div
        aria-hidden
        className="hero-sphere-bg pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <Image
          src="/brand/apogee-hero-sphere.png"
          alt=""
          fill
          sizes="100vw"
          className="hero-sphere-image"
          priority
          aria-hidden
        />
        <div className="hero-sphere-scrim" />
      </div>

      {/* Orbital field — anchored to bottom third so it sits below the headline */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex items-end justify-center overflow-hidden"
        style={{ height: '38%' }}
        aria-hidden
      >
        <div className="relative flex items-center justify-center w-[min(80vw,520px)] h-[min(80vw,520px)]">
          <svg
            viewBox="-200 -120 400 240"
            className="absolute inset-0 w-full h-full opacity-[0.035]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse cx="0" cy="0" rx="190" ry="110" stroke="currentColor" strokeWidth="1" className="text-accent" />
            <ellipse cx="0" cy="0" rx="130" ry="76" stroke="currentColor" strokeWidth="0.8" className="text-accent" />
            <ellipse cx="0" cy="0" rx="72" ry="42" stroke="currentColor" strokeWidth="0.6" className="text-accent" />
            <circle cx="0" cy="0" r="16" stroke="currentColor" strokeWidth="0.8" className="text-accent" />
          </svg>

          {/* Traveling node — contained inside orbital-field so it orbits below the text */}
          <div className="orbit-node pointer-events-none absolute" aria-hidden>
            <div
              className="orbit-node-inner h-2.5 w-2.5 rounded-full opacity-35"
              style={{ background: 'var(--orbital-node-gradient)' }}
            />
          </div>
        </div>
      </div>

      {/* Content — single column, centered */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-32 pt-10 text-center sm:px-6 sm:pt-12 lg:px-8">

        {/* Live status pill */}
        <div
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-line-accent)] bg-accent/[0.07] px-4 py-1.5 animate-fade-up"
          style={{ animationDelay: '0ms' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-medium text-accent-light tracking-wide">Live on Aristotle Mainnet</span>
        </div>

        {/* H1 */}
        <h1
          className="text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[1.08] tracking-tight text-fg animate-fade-up"
          style={{ letterSpacing: '-0.025em', animationDelay: '90ms' }}
        >
          The runtime where{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, var(--grad-start, #A78BFA) 0%, var(--grad-mid, #7C5FF1) 50%, var(--grad-end, #60A5FA) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            autonomous agents
          </span>{' '}
          earn their keep.
        </h1>

        {/* Subheadline */}
        <p
          className="mx-auto mt-6 max-w-xl text-[1.0625rem] leading-[1.7] text-fg-muted animate-fade-up"
          style={{ animationDelay: '170ms' }}
        >
          Self-custodial wallets, encrypted memory, agent-to-agent payment
          rails&nbsp;&mdash; native to 0G.
        </p>

        {/* CTAs */}
        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fade-up"
          style={{ animationDelay: '250ms' }}
        >
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-[var(--radius-lg)] bg-accent px-7 text-sm font-semibold text-white transition-[background-color,transform] duration-[200ms] hover:bg-accent/85 active:scale-[0.97]"
          >
            Start building
          </Link>
          <Link
            href="/proofs"
            className="inline-flex h-11 items-center rounded-[var(--radius-lg)] border border-[var(--color-line-bright)] px-7 text-sm font-medium text-fg/85 transition-[border-color,background-color,transform] duration-[200ms] hover:border-[var(--color-line-accent)] hover:bg-white/[0.04] active:scale-[0.97]"
          >
            View live receipts
          </Link>
        </div>

        {/* Trust indicators */}
        <div
          className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 animate-fade-up"
          style={{ animationDelay: '330ms' }}
        >
          {[
            { label: '0G Storage', value: 'Decentralised' },
            { label: 'Smart wallets', value: 'ERC-4337' },
            { label: 'Receipts', value: 'On-chain' },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-semibold text-fg">{value}</span>
              <span className="text-[10px] text-fg-faint uppercase tracking-widest">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
