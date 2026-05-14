import Link from 'next/link';

/* ─────────────────────────────────────────────────────────
   Pure server component. Zero client JS.
   Orbital animation: CSS only, ~400 B, gated on prefers-reduced-motion.
   Orbital colors: driven by CSS vars so light/dark themes apply
   without any JS or conditional class logic.
───────────────────────────────────────────────────────── */
export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden pt-14"
    >
      {/* Radial gradient backdrop — dims to transparent; vars change per theme */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--orbital-glow-bg)' }}
      />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8">
        {/* ── Left: copy ── */}
        <div className="flex flex-col justify-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex w-fit rounded-full border border-[var(--color-line-accent)] bg-accent/[0.07] px-4 py-1.5 text-xs font-medium text-accent-light">
            Live on Aristotle Mainnet
          </div>

          {/* H1 */}
          <h1
            className="max-w-xl text-[clamp(2.25rem,5vw,3.25rem)] font-semibold leading-[1.12] tracking-tight text-fg"
            style={{ letterSpacing: '-0.02em' }}
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

        {/* ── Right: orbital SVG — zero JS, CSS-var driven ── */}
        <div className="flex items-center justify-center lg:justify-end" aria-hidden>
          <div className="relative flex h-80 w-80 items-center justify-center sm:h-96 sm:w-96">
            {/* Outer glow — CSS var controlled */}
            <div
              className="absolute inset-8 rounded-full"
              style={{ background: 'var(--orbital-glow-bg)' }}
            />

            {/* Ring SVG — all colors via CSS vars */}
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
                style={{ stroke: 'var(--orbital-ring-stroke)' }}
                strokeWidth="1"
              />
              {/* Inner ring */}
              <ellipse
                cx="0" cy="0"
                rx="100" ry="60"
                style={{ stroke: 'var(--orbital-ring-stroke-2)' }}
                strokeWidth="1"
              />
              {/* Central body */}
              <circle
                cx="0" cy="0" r="18"
                style={{ fill: 'var(--orbital-planet-fill)', stroke: 'var(--orbital-planet-stroke)' }}
                strokeWidth="1"
              />
              <circle
                cx="0" cy="0" r="10"
                style={{ fill: 'var(--orbital-core-fill)' }}
              />
              <circle
                cx="0" cy="0" r="4"
                style={{ fill: 'var(--orbital-dot-fill)' }}
              />
            </svg>

            {/* Traveling node — pure CSS animation */}
            <div className="orbit-node absolute">
              <div
                className="orbit-node-inner h-3 w-3 rounded-full"
                style={{ background: 'var(--orbital-node-gradient)' }}
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
