import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTRACTS, EXPLORER_URLS, CHAIN_NAMES, CONTRACT_NAMES } from '@/lib/contracts';
import { ReceiptsFeed } from './_client';

export const metadata: Metadata = { title: 'On-chain Proofs — Apogee Protocol' };
export const revalidate = 30;

const EDGE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

// ── Types ─────────────────────────────────────────────────────────────────────

type DemoAgent = {
  slug: string;
  agentId: string | null;
  receiptCount: number;
  lastHeartbeat: string | null;
  runningForHours: number | null;
};

type ProofsApiResponse = {
  generatedAt: string;
  totalReceipts: number;
  demoAgents: DemoAgent[];
  heatmap: Record<string, Record<string, number>>;
  storageProofSample: unknown[];
};

// ── Data fetching (server, ISR 30 s) ─────────────────────────────────────────

async function fetchProofsData(): Promise<ProofsApiResponse | null> {
  try {
    const res = await fetch(`${EDGE_URL}/v1/proofs?chain=aristotle`, { next: { revalidate: 30 } });
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
    storageProofSample: [],
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

// ── Agent emblems (inline SVG, no files, no IDs) ──────────────────────────────

// Aurora — sunrise with rays, representing news analysis and real-time data broadcast.
// Semicircle arc sits on a horizon line; 5 rays radiate outward at cardinal/diagonal angles.
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

// Vesper — crescent moon, representing creative / generative work done in the evening cycle.
// Path uses two arcs: outer circle center (19,20) r=13, inner circle center (26,20) r=11.
// The crescent faces right. Two accent dots suggest a star field.
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

// Helix — two crossing bezier strands with rungs, representing chain analytics and data interplay.
// Strand 1: (8,8)→(32,32). Strand 2: (8,32)→(32,8). Rungs connect the strands at t≈0.2, 0.5, 0.8.
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
    accent: 'text-amber-400',
    iconBg: 'bg-amber-400/[0.08] border-amber-400/20',
    topBar: 'from-amber-400/40 to-transparent',
    badgeActive: 'bg-amber-400/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  vesper: {
    Icon: VesperIcon,
    role: 'Creative Agent',
    capability: 'Media · image.generate · nft.mint',
    accent: 'text-violet-400',
    iconBg: 'bg-violet-400/[0.08] border-violet-400/20',
    topBar: 'from-violet-400/40 to-transparent',
    badgeActive: 'bg-violet-400/10 text-violet-300',
    dot: 'bg-violet-400',
  },
  helix: {
    Icon: HelixIcon,
    role: 'Analytics Agent',
    capability: 'Chain · chain.query · daily report',
    accent: 'text-cyan-400',
    iconBg: 'bg-cyan-400/[0.08] border-cyan-400/20',
    topBar: 'from-cyan-400/40 to-transparent',
    badgeActive: 'bg-cyan-400/10 text-cyan-300',
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
    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`?tab=${t.id}`}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            current === t.id
              ? 'bg-violet-600 text-white shadow'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// ── Contracts tab ─────────────────────────────────────────────────────────────

const DEFAULT_CHAIN = 16661 as const;

function ContractsTab() {
  const chainId = DEFAULT_CHAIN;
  const contracts = CONTRACTS[chainId];
  const explorer = EXPLORER_URLS[chainId] ?? '';
  const chainName = CHAIN_NAMES[chainId] ?? '';
  const deployedCount = contracts ? Object.values(contracts).filter(Boolean).length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Deployed contracts</h2>
        <p className="text-xs text-white/40 mt-1">{chainName} · chainId {chainId} · {deployedCount}/{CONTRACT_NAMES.length} deployed</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-xs text-white/40">
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Address</th>
              <th className="px-5 py-3 font-medium">Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {CONTRACT_NAMES.map(name => {
              const addr = contracts?.[name] ?? '';
              return (
                <tr key={name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-semibold text-white/80">{name}</td>
                  <td className="px-5 py-3 font-mono text-violet-300 text-xs">
                    {addr || <span className="text-white/20 italic">pending</span>}
                  </td>
                  <td className="px-5 py-3">
                    {addr ? (
                      <a href={`${explorer}/address/${addr}`} target="_blank" rel="noreferrer"
                        className="text-xs text-violet-400 hover:text-violet-300 underline">
                        View ↗
                      </a>
                    ) : <span className="text-white/20">—</span>}
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

  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.025] overflow-hidden flex flex-col">
      {/* Top accent gradient bar */}
      <div className={`h-px w-full bg-gradient-to-r ${topBar}`} />

      <div className="p-5 flex flex-col gap-5 flex-1">
        {/* Header: emblem + name + role */}
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBg} ${accent}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold capitalize leading-tight ${accent}`}>{slug}</p>
            <p className="text-[11px] text-white/35 mt-0.5">{role}</p>
          </div>
          {/* Live indicator top-right */}
          <div className="ml-auto">
            {isActive ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dot}`} />
                <span className="text-[10px] font-semibold text-white/40">Live</span>
              </span>
            ) : (
              <span className="text-[10px] text-white/20">Idle</span>
            )}
          </div>
        </div>

        {/* Capability tags */}
        <p className="text-[10px] text-white/30 leading-relaxed -mt-2">{capability}</p>

        {/* Stats */}
        <div className="space-y-2.5 text-xs border-t border-white/[0.05] pt-4">
          <div className="flex justify-between items-center gap-2">
            <span className="text-white/35 shrink-0">Address</span>
            {agentId ? (
              <a href={`https://chainscan.0g.ai/address/${agentId}`} target="_blank" rel="noreferrer"
                className={`font-mono hover:opacity-80 truncate ${accent}`} title={agentId}>
                {agentId.slice(0, 6)}…{agentId.slice(-4)}
              </a>
            ) : <span className="text-white/20">not seeded</span>}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/35">Receipts minted</span>
            <span className="text-white/70 font-semibold tabular-nums">{receiptCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/35">Last heartbeat</span>
            <span className="text-white/55 tabular-nums">
              {lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : '—'}
            </span>
          </div>
          {runningForHours !== null && (
            <div className="flex justify-between items-center">
              <span className="text-white/35">Uptime</span>
              <span className="text-green-400 font-semibold tabular-nums">{runningForHours}h</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="mt-auto pt-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${isActive ? badgeActive : 'bg-white/[0.04] text-white/25'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? dot : 'bg-white/20'}`} />
            {isActive ? 'Active' : 'Awaiting first heartbeat'}
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
  const intensityBg = ['bg-white/[0.04]', 'bg-violet-900/40', 'bg-violet-700/50', 'bg-violet-500/60', 'bg-violet-400'];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="flex gap-0.5 mb-1.5 pl-16">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[26px] text-center text-[9px] text-white/20 shrink-0">
              {h % 6 === 0 ? String(h) : ''}
            </div>
          ))}
        </div>
        {days.map(day => (
          <div key={day} className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-white/30 w-14 shrink-0 text-right pr-2">{day.slice(5)}</span>
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
          <span className="text-[9px] text-white/30">Less</span>
          {intensityBg.map((bg, i) => <div key={i} className={`w-[26px] h-4 rounded-[2px] ${bg}`} />)}
          <span className="text-[9px] text-white/30">More</span>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ proofs }: { proofs: ProofsApiResponse }) {
  return (
    <div className="space-y-14">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Demo agents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {proofs.demoAgents.map(agent => <DemoAgentCard key={agent.slug} {...agent} />)}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Activity — last 14 days × 24 h</h2>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <ActivityHeatmap heatmap={proofs.heatmap} />
        </div>
      </div>

      <ReceiptsFeed edgeUrl={EDGE_URL} />
    </div>
  );
}

// ── Storage Proofs tab ────────────────────────────────────────────────────────

function StorageProofsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Storage proof sample</h2>
        <p className="text-xs text-white/40 mt-1 max-w-2xl leading-relaxed">
          A full storage proof proves the payload made a complete round-trip: serialised → uploaded to
          0G Storage → Merkle root returned → that root anchored on-chain. Without a successful upload,
          the keccak256 payload hash is anchored instead — still verifiable, not a full storage proof.
        </p>
      </div>

      {/* Glossary */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
        {([
          ['payloadHash',  'keccak256 of the stable-JSON serialised action payload. Always present. Content proof — not a transaction hash.'],
          ['storageRoot',  '0G Storage Merkle root returned after a successful upload. Falls back to payloadHash if upload fails. Content proof — not a transaction hash.'],
          ['mint tx',      'Aristotle mainnet transaction anchoring the receipt via ReceiptBook.emitReceipt(). This is the on-chain proof of agent activity. Not a storage upload tx.'],
          ['minted',       'Receipt anchored on-chain. The mint tx is confirmed on Aristotle mainnet.'],
          ['pending',      'Chain submission in flight or retrying. Resolves to minted within seconds under normal conditions.'],
        ] as [string, string][]).map(([term, def]) => (
          <div key={term} className="flex gap-4 px-5 py-3.5 text-xs">
            <code className="shrink-0 font-mono text-violet-300 w-28">{term}</code>
            <span className="text-white/40 leading-relaxed">{def}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-white/30 italic">
        Storage roots and payload hashes are content proofs, not transaction hashes.
      </p>

      {/* Unavailable banner */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          Unavailable
        </div>
        <p className="text-sm font-semibold text-white/50 mt-2">0G Storage proofs not yet active</p>
        <p className="text-xs text-white/30 max-w-md mx-auto leading-relaxed">
          SDK v0.3.3 is incompatible with the Aristotle mainnet Flow contract — the on-chain
          <code className="mx-1 font-mono text-white/40">submit()</code>
          ABI changed after the SDK was released. Receipts are anchored via payload hash (keccak256)
          until a compatible SDK ships.
        </p>
        <p className="text-[10px] text-white/20 pt-1">
          All receipts remain verifiable on-chain — see Overview → Receipt feed.
        </p>
      </div>
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
    <main className="min-h-screen px-6 py-16 bg-bg">
      <section className="mx-auto max-w-5xl space-y-10">

        {/* Hero */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400">Verification</p>
          <h1 className="text-4xl font-bold tracking-tight text-white leading-tight">
            On-chain proofs of<br />autonomous activity
          </h1>
          <p className="max-w-2xl text-white/55 leading-relaxed">
            Each agent action produces a receipt: the payload is hashed (keccak256), optionally
            uploaded to 0G Storage for a Merkle root, then anchored on Aristotle mainnet via
            <code className="mx-1 text-sm font-mono text-white/60">ReceiptBook.emitReceipt()</code>.
            On-chain transactions auto-refresh every 30 s.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
            <span className="text-white/40">
              <span className="text-white font-semibold">{proofs.totalReceipts.toLocaleString()}</span> receipts anchored
            </span>
            <span className="w-px h-4 bg-white/10" />
            <span className="text-white/40">
              Updated <span className="text-white/60">{new Date(proofs.generatedAt).toLocaleTimeString()}</span>
            </span>
          </div>
        </div>

        {/* Tab navigation */}
        <TabNav current={tab} />

        {/* Tab content */}
        {tab === 'overview'  && <OverviewTab proofs={proofs} />}
        {tab === 'storage'   && <StorageProofsTab />}
        {tab === 'contracts' && <ContractsTab />}

      </section>
    </main>
  );
}
