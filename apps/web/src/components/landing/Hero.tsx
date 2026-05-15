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
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--hero-bg)' }}
      />

      {/* Reference-inspired holographic runtime object — CSS/SVG, not a raster wallpaper. */}
      <div
        aria-hidden
        className="hero-hologram pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="hero-hologram-glow" />
        <svg
          viewBox="0 0 720 520"
          className="hero-hologram-object"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="heroSphereFill" cx="50%" cy="44%" r="62%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.78)" />
              <stop offset="42%" stopColor="rgba(167,139,250,0.20)" />
              <stop offset="72%" stopColor="rgba(96,165,250,0.13)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <linearGradient id="heroLine" x1="80" y1="80" x2="560" y2="440" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(255,255,255,0.75)" />
              <stop offset="0.52" stopColor="rgba(167,139,250,0.50)" />
              <stop offset="1" stopColor="rgba(125,211,252,0.40)" />
            </linearGradient>
            <filter id="heroSoftBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
          </defs>

          <circle cx="322" cy="254" r="164" fill="url(#heroSphereFill)" />
          <circle cx="322" cy="254" r="164" stroke="url(#heroLine)" strokeWidth="1.1" />
          <ellipse cx="322" cy="254" rx="164" ry="52" stroke="url(#heroLine)" strokeWidth="0.8" opacity="0.62" />
          <ellipse cx="322" cy="254" rx="164" ry="92" stroke="url(#heroLine)" strokeWidth="0.7" opacity="0.45" />
          <ellipse cx="322" cy="254" rx="74" ry="164" stroke="url(#heroLine)" strokeWidth="0.7" opacity="0.42" />
          <ellipse cx="322" cy="254" rx="118" ry="164" stroke="url(#heroLine)" strokeWidth="0.7" opacity="0.35" />
          <path d="M161 229c88-34 211-34 322 0" stroke="url(#heroLine)" strokeWidth="0.65" opacity="0.36" />
          <path d="M161 279c88 34 211 34 322 0" stroke="url(#heroLine)" strokeWidth="0.65" opacity="0.36" />
          <path d="M483 162c36 20 71 44 106 72M492 193c45 13 82 30 111 52M498 229c42 7 79 18 112 33M499 268c42 2 80 7 115 18M494 305c37 1 70 5 98 13" stroke="url(#heroLine)" strokeLinecap="round" strokeWidth="1" opacity="0.42" />
          <path d="M160 254c104-80 222-80 326 0M160 254c104 80 222 80 326 0" stroke="url(#heroLine)" strokeWidth="0.7" opacity="0.28" />

          <circle cx="566" cy="126" r="18" fill="rgba(255,255,255,0.38)" filter="url(#heroSoftBlur)" />
          <circle cx="595" cy="345" r="10" fill="rgba(125,211,252,0.30)" />
          <circle cx="144" cy="385" r="8" fill="rgba(167,139,250,0.25)" />
          <circle cx="214" cy="118" r="5" fill="rgba(255,255,255,0.38)" />
        </svg>
        <div className="hero-hologram-wash" />
      </div>

      {/* Orbital field — anchored to bottom third so it sits below the headline */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center overflow-hidden"
        style={{ height: '38%' }}
        aria-hidden
      >
        <div className="relative flex items-center justify-center w-[min(80vw,520px)] h-[min(80vw,520px)]">
          <svg
            viewBox="-200 -120 400 240"
            className="absolute inset-0 w-full h-full opacity-[0.05]"
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
              className="orbit-node-inner h-2.5 w-2.5 rounded-full opacity-50"
              style={{ background: 'var(--orbital-node-gradient)' }}
            />
          </div>
        </div>
      </div>

      {/* Content — single column, centered */}
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-32 pt-10 text-center sm:px-6 sm:pt-12 lg:px-8">

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
