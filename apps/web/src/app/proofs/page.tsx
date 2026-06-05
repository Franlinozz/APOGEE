import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';
import { CONTRACTS, CHAIN_NAMES, CONTRACT_NAMES } from '@/lib/contracts';
import { buildChainscanUrl, chainscanBase } from '@/lib/chainscan';
import { AgentProofOverview } from './AgentProofOverview';
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
};

type StorageProofRow = {
  receiptId: string;
  agentId: string;
  agentName?: string;
  actionTag: string;
  payloadHash: string;
  storageRoot: string;
  storageTxHash?: string | undefined;
  txHash?: string | undefined;
  status: string;
  createdAt: string;
};

type ReceiptRow = StorageProofRow & { valueWei: string };

type ProofsApiResponse = {
  generatedAt: string;
  totalReceipts: number;
  demoAgents: DemoAgent[];
  receipts: ReceiptRow[];
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
      { slug: 'aurora', agentId: SEEDED_AGENTS['aurora'] ?? null, receiptCount: 0, lastHeartbeat: null },
      { slug: 'vesper', agentId: SEEDED_AGENTS['vesper'] ?? null, receiptCount: 0, lastHeartbeat: null },
      { slug: 'helix',  agentId: SEEDED_AGENTS['helix']  ?? null, receiptCount: 0, lastHeartbeat: null },
    ],
    receipts: [] as ReceiptRow[],
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

function OverviewTab({ proofs }: { proofs: ProofsApiResponse }) {
  return (
    <AgentProofOverview
      agents={proofs.demoAgents}
      receipts={proofs.receipts ?? []}
      heatmap={proofs.heatmap}
      receiptFeed={<ReceiptsFeed edgeUrl={EDGE_URL} />}
    />
  );
}

// ── Storage Proofs tab ────────────────────────────────────────────────────────

function StorageProofsTab({ proofSample, totalReceipts }: { proofSample: StorageProofRow[]; totalReceipts?: number }) {
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

      <StorageProofsClient proofSample={proofSample} totalReceipts={totalReceipts} />
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
        {tab === 'storage'   && <div className="animate-fade-up"><StorageProofsTab proofSample={proofs.storageProofSample} totalReceipts={proofs.totalReceipts} /></div>}
        {tab === 'contracts' && <div className="animate-fade-up"><ContractsTab /></div>}

      </section>
      </main>
    </>
  );
}
