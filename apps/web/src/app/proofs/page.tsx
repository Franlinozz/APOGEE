import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';
import { CONTRACTS, CHAIN_NAMES, CONTRACT_NAMES } from '@/lib/contracts';
import { buildChainscanUrl, chainscanBase } from '@/lib/chainscan';
import { ReceiptsFeed, StorageProofsClient } from './_client';

export const metadata: Metadata = { title: 'On-chain Proofs — Apogee Protocol' };
export const revalidate = 0;

const EDGE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

// ── Types ─────────────────────────────────────────────────────────────────────

type DemoAgent = {
  slug: string;
  agentId: string | null;
  receiptCount: number;
  lastHeartbeat: string | null;
  runningForHours: number | null;
};

type StorageProofRow = {
  receiptId: string;
  agentId: string;
  actionTag: string;
  payloadHash: string;
  storageRoot: string;
  storageTxHash?: string | undefined;
  txHash?: string | undefined;
  status: string;
  createdAt: string;
};

type ProofsApiResponse = {
  generatedAt: string;
  totalReceipts: number;
  demoAgents: DemoAgent[];
  heatmap: Record<string, Record<string, number>>;
  storageProofSample: StorageProofRow[];
};

// ── Data fetching (server, ISR 30 s) ─────────────────────────────────────────

async function fetchProofsData(): Promise<ProofsApiResponse | null> {
  try {
    const res = await fetch(`${EDGE_URL}/v1/proofs?chain=aristotle`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as ProofsApiResponse;
  } catch {
    return null;
  }
}

const SEEDED_AGENTS: Record<string, string> = {
  aurora: '0x8AD1Ef8a59554E5537631BfBa9a655A88A803a34',
  vesper: '0x4d1d3E14913C050dF9fD68aFaB90D04079C37f90',
  helix:  '0x62283f2064bA32c9797C5c1D7d5F6942229FAf00',
};

function emptyProofs(): ProofsApiResponse {
  return {
    generatedAt: new Date().toISOString(),
    totalReceipts: 0,
    demoAgents: [
      { slug: 'aurora', agentId: SEEDED_AGENTS['aurora'] ?? null, receiptCount: 0, lastHeartbeat: null, runningForHours: null },
      { slug: 'vesper', agentId: SEEDED_AGENTS['vesper'] ?? null, receiptCount: 0, lastHeartbeat: null, runningForHours: null },
      { slug: 'helix',  agentId: SEEDED_AGENTS['helix']  ?? null, receiptCount: 0, lastHeartbeat: null, runningForHours: null },
    ],
    heatmap: Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        return [d, Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), 0]))];
      })
    ),
    storageProofSample: [] as StorageProofRow[],
  };
}

function mergeSeededAddresses(proofs: ProofsApiResponse): ProofsApiResponse {
  return {
    ...proofs,
    demoAgents: proofs.demoAgents.map(a => ({
      ...a,
      agentId: a.agentId ?? SEEDED_AGENTS[a.slug] ?? null,
    })),
  };
}

// ── Agent emblems (inline SVG) ────────────────────────────────────────────────

function AuroraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="4" y1="27" x2="36" y2="27" strokeOpacity="0.5" />
      <path d="M 7 27 A 13 13 0 0 1 33 27" />
      <line x1="20" y1="4"  x2="20" y2="9" />
      <line x1="30.2" y1="9.8"  x2="26.7" y2="13.3" />
      <line x1="36"   y1="20"   x2="31"   y2="20"   />
      <line x1="9.8"  y1="9.8"  x2="13.3" y2="13.3" />
      <line x1="4"    y1="20"   x2="9"    y2="20"   />
    </svg>
  );
}

function VesperIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M 26 9 A 13 13 0 1 0 26 31 A 11 11 0 0 1 26 9 Z"
        fill="currentColor" fillOpacity="0.12" />
      <circle cx="33" cy="10" r="1"    fill="currentColor" stroke="none" />
      <circle cx="36" cy="18" r="0.7"  fill="currentColor" stroke="none" />
      <circle cx="30" cy="5"  r="0.7"  fill="currentColor" stroke="none" />
    </svg>
  );
}

function HelixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M 8 8  C 16 8  24 32 32 32" />
      <path d="M 8 32 C 16 32 24 8  32 8"  strokeOpacity="0.45" />
      <line x1="12" y1="10.5" x2="12" y2="27"  strokeOpacity="0.35" />
      <line x1="20" y1="17"   x2="20" y2="23"  strokeOpacity="0.6"  />
      <line x1="28" y1="13"   x2="28" y2="29.5" strokeOpacity="0.35" />
    </svg>
  );
}

// ── Agent card metadata ───────────────────────────────────────────────────────

const AGENT_META = {
  aurora: {
    Icon: AuroraIcon,
    role: 'Analysis Agent',
    capability: 'News · web.search · self-billing',
    accent: 'text-amber-500',
    iconBg: 'bg-amber-400/[0.08] border-amber-400/20',
    topBar: 'from-amber-400/40 to-transparent',
    badgeActive: 'bg-amber-400/10 text-amber-600',
    dot: 'bg-amber-400',
  },
  vesper: {
    Icon: VesperIcon,
    role: 'Creative Agent',
    capability: 'Media · image.generate · nft.mint',
    accent: 'text-accent-light',
    iconBg: 'bg-accent/[0.08] border-accent/20',
    topBar: 'from-accent/40 to-transparent',
    badgeActive: 'bg-accent/10 text-accent-light',
    dot: 'bg-accent',
  },
  helix: {
    Icon: HelixIcon,
    role: 'Analytics Agent',
    capability: 'Chain · chain.query · daily report',
    accent: 'text-cyan-500',
    iconBg: 'bg-cyan-400/[0.08] border-cyan-400/20',
    topBar: 'from-cyan-400/40 to-transparent',
    badgeActive: 'bg-cyan-400/10 text-cyan-600',
    dot: 'bg-cyan-400',
  },
} as const;

// ── Tab navigation ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'storage',   label: 'Storage Proofs' },
  { id: 'contracts', label: 'Contracts' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function TabNav({ current }: { current: TabId }) {
  return (
    <div className="mx-auto flex w-full max-w-full justify-center overflow-x-auto">
      <div className="flex w-max gap-1 rounded-xl border border-[var(--color-line)] bg-elevated p-1 shadow-sm">
        {TABS.map(t => (
        <Link
          key={t.id}
          href={`?tab=${t.id}`}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            current === t.id
              ? 'bg-accent text-white shadow'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          {t.label}
        </Link>
        ))}
      </div>
    </div>
  );
}

// ── Contracts tab ─────────────────────────────────────────────────────────────

const DEFAULT_CHAIN = 16661 as const;

function ContractsTab() {
  const chainId = DEFAULT_CHAIN;
  const contracts = CONTRACTS[chainId];
  const explorer = chainscanBase({ chainId });
  const chainName = CHAIN_NAMES[chainId] ?? '';
  const deployedCount = contracts ? Object.values(contracts).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-fg">Deployed contracts</h2>
        <p className="text-xs text-fg-muted mt-1">{chainName} · chainId {chainId} · {deployedCount}/{CONTRACT_NAMES.length} deployed</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-xs text-fg-faint">
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Address</th>
              <th className="px-5 py-3 font-medium">Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {CONTRACT_NAMES.map(name => {
              const addr = contracts?.[name] ?? '';
              return (
                <tr key={name} className="hover-row">
                  <td className="px-5 py-3 font-semibold text-fg">{name}</td>
                  <td className="px-5 py-3 font-mono text-accent text-xs">
                    {addr || <span className="text-fg-faint italic">pending</span>}
                  </td>
                  <td className="px-5 py-3">
                    {buildChainscanUrl({ address: addr, kind: 'address', chainId }) ? (
                      <a href={buildChainscanUrl({ address: addr, kind: 'address', chainId })!} target="_blank" rel="noreferrer"
                        className="text-xs text-accent-light hover:text-accent underline">
                        View ↗
                      </a>
                    ) : <span className="text-fg-faint">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function DemoAgentCard({ slug, agentId, receiptCount, lastHeartbeat, runningForHours }: DemoAgent) {
  const meta = AGENT_META[slug as keyof typeof AGENT_META];
  if (!meta) return null;
  const { Icon, role, capability, accent, iconBg, topBar, badgeActive, dot } = meta;
  const isActive = Boolean(lastHeartbeat);
  const hasActivity = receiptCount > 0;
  // Status label: only claim "Awaiting" if there is genuinely zero evidence of activity.
  const statusLabel = isActive ? 'Active' : hasActivity ? 'Running' : 'Awaiting first heartbeat';

  return (
    <div className="relative rounded-2xl border border-[var(--color-line)] bg-surface overflow-hidden flex flex-col transition-[border-color,box-shadow,transform] duration-[220ms] hover:border-[var(--color-line-accent)] hover:shadow-card hover:-translate-y-0.5">
      <div className={`h-px w-full bg-gradient-to-r ${topBar}`} />

      <div className="p-5 flex flex-col gap-5 flex-1">
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBg} ${accent}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold capitalize leading-tight ${accent}`}>{slug}</p>
            <p className="text-[11px] text-fg-muted mt-0.5">{role}</p>
          </div>
          <div className="ml-auto">
            {isActive ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dot}`} />
                <span className="text-[10px] font-semibold text-fg-muted">Live</span>
              </span>
            ) : hasActivity ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <span className="text-[10px] font-semibold text-fg-muted">Active</span>
              </span>
            ) : (
              <span className="text-[10px] text-fg-faint">Idle</span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-fg-faint leading-relaxed -mt-2">{capability}</p>

        <div className="space-y-2.5 text-xs border-t border-[var(--color-line)] pt-4">
          <div className="flex justify-between items-center gap-2">
            <span className="text-fg-faint shrink-0">Address</span>
            {buildChainscanUrl({ address: agentId, kind: 'address', chainId: 16661 }) ? (
              <a href={buildChainscanUrl({ address: agentId, kind: 'address', chainId: 16661 })!} target="_blank" rel="noreferrer"
                className={`font-mono hover:opacity-80 truncate ${accent}`} title={agentId ?? undefined}>
                {agentId?.slice(0, 6)}…{agentId?.slice(-4)}
              </a>
            ) : agentId ? <span className="font-mono text-fg-faint">{agentId}</span> : <span className="text-fg-faint">not seeded</span>}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-fg-faint">Receipts minted</span>
            <span className="text-fg font-semibold tabular-nums">{receiptCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-fg-faint">Last heartbeat</span>
            <span className="text-fg-muted tabular-nums">
              {lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : '—'}
            </span>
          </div>
          {runningForHours !== null && (
            <div className="flex justify-between items-center">
              <span className="text-fg-faint">Uptime</span>
              <span className="text-success font-semibold tabular-nums">{runningForHours}h</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${isActive || hasActivity ? badgeActive : 'bg-elevated text-fg-faint'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? dot : hasActivity ? dot : 'bg-fg-faint'}`} />
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityHeatmap({ heatmap }: { heatmap: Record<string, Record<string, number>> }) {
  const days = Object.keys(heatmap).sort().reverse();
  const allVals = days.flatMap(d => Object.values(heatmap[d] ?? {}).map(Number));
  const maxVal = Math.max(1, ...allVals);
  const intensityBg = ['bg-elevated', 'bg-accent/20', 'bg-accent/40', 'bg-accent/65', 'bg-accent/90'];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="flex gap-0.5 mb-1.5 pl-16">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[26px] text-center text-[9px] text-fg-faint shrink-0">
              {h % 6 === 0 ? String(h) : ''}
            </div>
          ))}
        </div>
        {days.map(day => (
          <div key={day} className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-fg-faint w-14 shrink-0 text-right pr-2">{day.slice(5)}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 24 }, (_, h) => {
                const count = Number(heatmap[day]?.[String(h)] ?? 0);
                const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxVal) * 4));
                return (
                  <div
                    key={h}
                    title={`${day} ${h}:00 — ${count} receipt${count !== 1 ? 's' : ''}`}
                    className={`w-[26px] h-4 rounded-[2px] ${intensityBg[intensity]}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 pl-16">
          <span className="text-[9px] text-fg-faint">Less</span>
          {intensityBg.map((bg, i) => <div key={i} className={`w-[26px] h-4 rounded-[2px] ${bg}`} />)}
          <span className="text-[9px] text-fg-faint">More</span>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ proofs }: { proofs: ProofsApiResponse }) {
  return (
    <div className="space-y-14">
      <div className="animate-fade-up space-y-4">
        <h2 className="text-lg font-semibold text-fg">Demo agents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {proofs.demoAgents.map(agent => <DemoAgentCard key={agent.slug} {...agent} />)}
        </div>
      </div>

      <div className="animate-fade-up delay-150 space-y-4">
        <h2 className="text-lg font-semibold text-fg">Activity — last 14 days × 24 h</h2>
        <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-5">
          <ActivityHeatmap heatmap={proofs.heatmap} />
        </div>
      </div>

      <ReceiptsFeed edgeUrl={EDGE_URL} />
    </div>
  );
}

// ── Storage Proofs tab ────────────────────────────────────────────────────────

function StorageProofsTab({ proofSample }: { proofSample: StorageProofRow[] }) {
  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-fg">Storage proof sample</h2>
        <p className="text-xs text-fg-muted mt-1 max-w-2xl leading-relaxed">
          A full storage proof proves the payload made a complete round-trip: serialised → uploaded to
          0G Storage → Merkle root returned → that root anchored on-chain via
          <code className="mx-1 font-mono text-accent">ReceiptBook.emitReceipt()</code>.
        </p>
      </div>

      {/* Glossary */}
      <div className="rounded-xl border border-[var(--color-line)] bg-surface divide-y divide-[var(--color-line)]">
        {([
          ['payloadHash', 'keccak256 of the stable-JSON serialised action payload. Always present. Content proof — not a transaction hash, not linkable to a block explorer.'],
          ['storageRoot', '0G Storage Merkle root returned after a successful upload to Aristotle mainnet (chainId 16661). Content proof — not a transaction hash.'],
          ['mint tx',     'Aristotle mainnet transaction anchoring the receipt via ReceiptBook.emitReceipt(). The actual on-chain anchor — this links to chainscan.'],
          ['minted',      'Receipt anchored on-chain. The mint tx is confirmed on Aristotle mainnet.'],
          ['pending',     'Chain submission in flight or retrying. Resolves to minted within seconds.'],
        ] as [string, string][]).map(([term, def]) => (
          <div key={term} className="flex gap-4 px-5 py-3.5 text-xs">
            <code className="shrink-0 font-mono text-accent w-28">{term}</code>
            <span className="text-fg-muted leading-relaxed">{def}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-fg-faint italic">
        storageRoot and payloadHash are content-addressed proofs, not transaction hashes — only the mint tx links to a block explorer.
      </p>

      <StorageProofsClient proofSample={proofSample} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProofsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const raw = (await fetchProofsData()) ?? emptyProofs();
  const proofs = mergeSeededAddresses(raw);

  const rawTab = searchParams.tab ?? 'overview';
  const tab: TabId = (TABS.map(t => t.id) as string[]).includes(rawTab)
    ? (rawTab as TabId)
    : 'overview';

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-28 pb-16 px-6 bg-bg">
      <section className="mx-auto max-w-5xl space-y-10">

        {/* Hero */}
        <section className="animate-fade-up text-center pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-light mb-4">
            Verification
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight text-fg mx-auto max-w-2xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            On-chain proofs of autonomous activity
          </h1>
          <p className="mt-4 text-fg-muted text-base max-w-xl mx-auto leading-relaxed">
            Each agent action produces a receipt: the payload is hashed (keccak256), optionally
            uploaded to 0G Storage for a Merkle root, then anchored on Aristotle mainnet via{' '}
            <code className="text-sm font-mono text-accent">ReceiptBook.emitReceipt()</code>.
            On-chain transactions auto-refresh every 30 s.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="text-fg-muted">
              <span className="text-fg font-semibold">{proofs.totalReceipts.toLocaleString()}</span> receipts anchored
            </span>
            <span className="w-px h-4 bg-[var(--color-line-bright)]" />
            <span className="text-fg-muted">
              Last checked <span className="text-fg-muted">{new Date(proofs.generatedAt).toLocaleTimeString()}</span>
            </span>
          </div>
        </section>

        {/* Tab navigation */}
        <div className="animate-fade-up delay-150">
          <TabNav current={tab} />
        </div>

        {/* Tab content */}
        {tab === 'overview'  && <div className="animate-fade-up"><OverviewTab proofs={proofs} /></div>}
        {tab === 'storage'   && <div className="animate-fade-up"><StorageProofsTab proofSample={proofs.storageProofSample} /></div>}
        {tab === 'contracts' && <div className="animate-fade-up"><ContractsTab /></div>}

      </section>
      </main>
    </>
  );
}
