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
  const emoji = slug === 'aurora' ? '🔴' : slug === 'vesper' ? '🟣' : '🔵';
  const descriptions: Record<string, string> = {
    aurora: 'News analysis · web.search · self-billing',
    vesper: 'Creative media · image.generate · pays aurora',
    helix:  'On-chain analytics · chain.query · daily report',
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">{emoji}</span>
        <div className="min-w-0">
          <p className="font-semibold text-white capitalize">{slug}</p>
          <p className="text-[11px] text-white/40 leading-relaxed mt-0.5">{descriptions[slug]}</p>
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-white/40 shrink-0">Address</span>
          {agentId ? (
            <a href={`https://chainscan.0g.ai/address/${agentId}`} target="_blank" rel="noreferrer"
              className="font-mono text-violet-300 hover:text-violet-200 truncate">
              {agentId.slice(0, 12)}…
            </a>
          ) : <span className="text-white/20">not seeded</span>}
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Receipts</span>
          <span className="text-white/70 font-semibold">{receiptCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Last heartbeat</span>
          <span className="text-white/60">
            {lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : '—'}
          </span>
        </div>
        {runningForHours !== null && (
          <div className="flex justify-between">
            <span className="text-white/40">Running for</span>
            <span className="text-green-400 font-semibold">{runningForHours}h</span>
          </div>
        )}
      </div>
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${lastHeartbeat ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.05] text-white/30'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${lastHeartbeat ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
        {lastHeartbeat ? 'Active' : 'Awaiting seed'}
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
        <p className="text-xs text-white/40 mt-1">
          Receipts with a real 0G Storage root hash (distinct from the payload hash) prove a full
          round-trip: payload → 0G Storage upload → rootHash anchored on-chain. Receipts that fall
          back show their keccak256 payload hash as the on-chain anchor instead.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white/60">payloadHash</span>
          <span className="text-white/30">—</span>
          <span className="text-white/40">keccak256 of the stable-JSON serialised action payload; always present.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white/60">storageRoot</span>
          <span className="text-white/30">—</span>
          <span className="text-white/40">0G Storage Merkle root returned after a successful upload. Falls back to payloadHash when upload fails.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white/60">mint tx</span>
          <span className="text-white/30">—</span>
          <span className="text-white/40">Aristotle mainnet transaction that anchored the receipt via ReceiptBook.emitReceipt(). This is NOT the storage upload tx.</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-8 text-center space-y-3">
        <p className="text-sm font-semibold text-white/50">Storage proofs unavailable</p>
        <p className="text-xs text-white/30 max-w-md mx-auto leading-relaxed">
          0G Storage SDK v0.3.3 is incompatible with the Aristotle mainnet Flow contract — the on-chain
          <code className="mx-1 font-mono text-white/40">submit()</code>
          ABI has changed since the SDK was released. Receipts are anchored on-chain via
          payload hash (keccak256) until a compatible SDK is available.
        </p>
        <p className="text-[10px] text-white/20">
          All receipts are still verifiable on-chain — see the Overview → Receipt feed.
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
            Every receipt is a cryptographic proof: agent identity NFT → action tag →
            payload hash anchored in 0G Storage → on-chain transaction. Auto-refreshes every 30 s.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-sm">
            <span className="text-white/40">
              <span className="text-white font-semibold">{proofs.totalReceipts.toLocaleString()}</span> total receipts
            </span>
            <span className="w-px h-4 bg-white/10" />
            <span className="text-white/40">
              Generated <span className="text-white/60">{new Date(proofs.generatedAt).toLocaleTimeString()}</span>
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
