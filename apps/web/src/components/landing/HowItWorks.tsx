/* Static SVG diagram — zero JS, zero animations, server component */

const STEPS = [
  { n: '01', title: 'Register Agent',   body: 'Deploy an ERC-4337 account via AccountFactory. Mint an ERC-7857 identity NFT anchored to your agent.' },
  { n: '02', title: 'Set Policy',       body: 'Define spend limits, allowed skill IDs, and daily caps via the PolicyEngine contract.' },
  { n: '03', title: 'Invoke a Skill',   body: 'Send a run request. The runtime dequeues it, checks policy, and executes the skill in an isolated VM.' },
  { n: '04', title: 'Receipt Emitted',  body: 'A receipt hash is minted to 0G Chain. Payload root is anchored to 0G Storage. Both are verifiable forever.' },
];

export function HowItWorks() {
  return (
    <section id="skills" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 max-w-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-fg" style={{ letterSpacing: '-0.02em' }}>
            From agent registration to verifiable receipt in four steps.
          </h2>
        </div>

        {/* Desktop: horizontal connector SVG */}
        <div className="relative hidden lg:block" aria-hidden>
          <svg
            viewBox="0 0 900 4"
            className="absolute left-[calc(12.5%-2px)] top-5 w-[75%] text-[var(--color-line)]"
            fill="none"
          >
            <line x1="0" y1="2" x2="900" y2="2" stroke="currentColor" strokeWidth="1" strokeDasharray="6 4" />
          </svg>
        </div>

        <ol className="grid gap-8 lg:grid-cols-4">
          {STEPS.map(({ n, title, body }) => (
            <li key={n} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-accent)] bg-elevated font-mono text-xs font-bold text-accent"
                >
                  {n}
                </span>
                <h3 className="text-sm font-semibold text-fg">{title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-fg-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
