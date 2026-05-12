interface Stats {
  receipts: number;
  agents: number;
  totalFlowedWei: string;
}

async function loadStats(): Promise<Stats> {
  const baseUrl = process.env['NEXT_PUBLIC_API_URL']
    ? `${process.env['NEXT_PUBLIC_API_URL']}/v1/stats`
    : 'http://localhost:3000/api/stats';

  try {
    const res = await fetch(baseUrl, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error('stats fetch failed');
    return res.json() as Promise<Stats>;
  } catch {
    return { receipts: 0, agents: 0, totalFlowedWei: '0' };
  }
}

function fmtWei(wei: string): string {
  const n = Number(BigInt(wei)) / 1e18;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M 0G`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}K 0G`;
  return `${n.toFixed(4)} 0G`;
}

const TILES = [
  { label: 'On-chain receipts', key: 'receipts' },
  { label: 'Registered agents', key: 'agents' },
  { label: 'Total value flowed', key: 'totalFlowedWei' },
] as const;

export async function NumbersSection() {
  const stats = await loadStats();
  const values: Record<string, string> = {
    receipts:       stats.receipts.toLocaleString(),
    agents:         stats.agents.toLocaleString(),
    totalFlowedWei: fmtWei(stats.totalFlowedWei),
  };

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Network stats
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-fg" style={{ letterSpacing: '-0.02em' }}>
            Running live on Aristotle mainnet.
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {TILES.map(({ label, key }) => (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-7"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</p>
              <p className="font-mono text-3xl font-semibold tracking-tight text-fg">
                {values[key] ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
