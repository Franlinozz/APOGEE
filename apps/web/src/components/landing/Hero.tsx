import Link from 'next/link';

/* ─────────────────────────────────────────────────────────
   Pure server component. Zero client JS.
   Orbital animation: CSS only, ~400 B, gated on prefers-reduced-motion.
───────────────────────────────────────────────────────── */
export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden pt-14"
    >
      {/* Radial gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 60% 0%, rgba(124,95,241,0.18) 0%, transparent 70%),' +
            'radial-gradient(ellipse 50% 40% at 5% 80%, rgba(124,95,241,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8">
        {/* ── Left: copy ── */}
        <div className="flex flex-col justify-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex w-fit rounded-full border border-[var(--color-line-accent)] bg-accent/[0.07] px-4 py-1.5 text-xs font-medium text-accent-light">
            Live on 0G Galileo Testnet
          </div>

          {/* H1 */}
          <h1
            className="max-w-xl text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-[1.12] tracking-tight text-fg"
            style={{ letterSpacing: '-0.02em' }}
          >
            The runtime where{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #A78BFA 0%, #7C5FF1 50%, #60A5FA 100%)',
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
          <p className="prose-width mt-6 text-[1.0625rem] leading-[1.7] text-fg-muted">
            Self-custodial wallets, encrypted memory, agent-to-agent payment
            rails&nbsp;&mdash; native to 0G.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-[var(--radius-lg)] bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
            >
              Start building
            </Link>
            <Link
              href="/proofs"
              className="inline-flex h-11 items-center rounded-[var(--radius-lg)] border border-[var(--color-line-bright)] px-6 text-sm font-medium text-fg/85 transition-colors hover:border-[var(--color-line-accent)] hover:bg-white/[0.04]"
            >
              View live receipts
            </Link>
          </div>
        </div>

        {/* ── Right: orbital SVG — zero JS ── */}
        <div className="flex items-center justify-center lg:justify-end" aria-hidden>
          <div className="relative flex h-80 w-80 items-center justify-center sm:h-96 sm:w-96">
            {/* Outer glow */}
            <div
              className="absolute inset-8 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(124,95,241,0.10) 0%, transparent 70%)' }}
            />

            {/* Ring SVG */}
            <svg
              viewBox="-160 -100 320 200"
              className="absolute inset-0 h-full w-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Primary orbital ring */}
              <ellipse
                cx="0" cy="0"
                rx="148" ry="88"
                stroke="rgba(124,95,241,0.22)"
                strokeWidth="1"
              />
              {/* Inner ring — atmosphere effect */}
              <ellipse
                cx="0" cy="0"
                rx="100" ry="60"
                stroke="rgba(167,139,250,0.10)"
                strokeWidth="1"
              />
              {/* Central body — the planet/agent */}
              <circle cx="0" cy="0" r="18" fill="rgba(20,21,38,1)" stroke="rgba(124,95,241,0.35)" strokeWidth="1" />
              <circle cx="0" cy="0" r="10" fill="rgba(124,95,241,0.25)" />
              <circle cx="0" cy="0" r="4"  fill="rgba(167,139,250,0.8)" />
            </svg>

            {/* Traveling node — pure CSS animation */}
            <div className="orbit-node absolute">
              <div
                className="orbit-node-inner h-3 w-3 rounded-full"
                style={{ background: 'radial-gradient(circle, #F0E6FF 0%, #A78BFA 60%, #7C5FF1 100%)' }}
              />
            </div>

            {/* Apogee label */}
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono tracking-widest text-fg-faint"
              style={{ letterSpacing: '0.2em' }}
            >
              APOGEE
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
