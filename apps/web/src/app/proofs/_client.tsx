// CLIENT: pagination state for receipt feed and storage proof table
'use client';

import { useState, useEffect, useCallback } from 'react';
import { buildChainscanUrl } from '@/lib/chainscan';

const PAGE_SIZE = 9;
const STORAGE_PAGE_SIZE = 10;

type ReceiptIndexRow = {
  receiptId: string;
  agentId: string;
  actionTag: string;
  valueWei: string;
  storageRoot: string;
  txHash?: string;
  status: 'pending' | 'minted';
  createdAt: string;
};

type ProofsData = {
  receipts: ReceiptIndexRow[];
  generatedAt: string;
};

// ── Pagination controls ───────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between pt-2 text-xs text-white/40">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          Previous
        </button>
        <span className="px-3 py-1 text-white/30">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Network toggle ────────────────────────────────────────────────────────────

export function NetworkToggle({
  selected,
  onChange,
}: {
  selected: 16602 | 16661;
  onChange: (c: 16602 | 16661) => void;
}) {
  const btn = (chainId: 16602 | 16661, label: string) => (
    <button
      key={chainId}
      onClick={() => onChange(chainId)}
      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        selected === chainId
          ? 'bg-accent text-white'
          : 'border border-white/10 text-white/50 hover:text-white hover:border-white/20'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {btn(16661, 'Aristotle (mainnet)')}
      {btn(16602, 'Galileo (testnet)')}
    </div>
  );
}

// ── Auto-refreshing receipts feed ─────────────────────────────────────────────

export function ReceiptsFeed({ edgeUrl }: { edgeUrl: string }) {
  const [data, setData] = useState<ProofsData | null>(null);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${edgeUrl}/v1/proofs?chain=aristotle`);
      if (res.ok) {
        const json = await res.json() as ProofsData;
        setData(json);
        setLastVerified(new Date().toISOString());
      }
    } catch { /* no-op */ } finally {
      setLoading(false);
    }
  }, [edgeUrl]);

  useEffect(() => {
    void fetch_();
    const id = setInterval(() => { void fetch_(); }, 10_000);
    return () => clearInterval(id);
  }, [fetch_]);

  // Reset to page 1 when fresh data arrives
  useEffect(() => { setPage(1); }, [data?.generatedAt]);

  const formatTag = (tag: string): string => {
    if (!tag) return '—';
    if (tag.startsWith('0x')) return tag.slice(0, 10) + '…';
    const parts = tag.split('.');
    return parts[parts.length - 1] ?? tag;
  };

  const formatValue = (wei: string): string => {
    try { return (Number(BigInt(wei || '0')) / 1e18).toFixed(6) + ' 0G'; }
    catch { return '— 0G'; }
  };

  const receipts = data?.receipts ?? [];
  const totalPages = Math.max(1, Math.ceil(receipts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = receipts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Receipt feed</h2>
        <div className="flex items-center gap-3">
          {lastVerified && (
            <span className="text-xs text-white/40">
              Last verified {new Date(lastVerified).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetch_()}
            disabled={loading}
            className="px-3 py-1 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
          >
            {loading ? 'Verifying…' : 'Verify now'}
          </button>
        </div>
      </div>

      {!data && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 text-sm text-white/40 text-center">
          Connecting to edge…
        </div>
      )}

      {data && receipts.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 text-sm text-white/40 text-center">
          No receipts yet — heartbeats will populate this within 10 min after agents are seeded.
        </div>
      )}

      {data && receipts.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-white/40 text-left">
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Mint tx (Aristotle)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {pageRows.map(r => (
                  <tr key={r.receiptId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-violet-300" title={r.actionTag}>{formatTag(r.actionTag)}</td>
                    <td className="px-4 py-2.5 text-white/60 capitalize">{r.agentId}</td>
                    <td className="px-4 py-2.5 text-white/70">{formatValue(r.valueWei)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === 'minted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white/40">{new Date(r.createdAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5">
                      {buildChainscanUrl({ txHash: r.txHash, chainId: 16661 }) ? (
                        <a
                          href={buildChainscanUrl({ txHash: r.txHash, chainId: 16661 })!}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-violet-400 hover:text-violet-300"
                          title={r.txHash}
                        >
                          {r.txHash?.slice(0, 10)}…
                        </a>
                      ) : <span className="text-white/20">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={receipts.length}
            onChange={setPage}
          />

          <p className="text-[10px] text-white/25 pt-1">
            Storage roots and payload hashes are content proofs, not transaction hashes.
            The <span className="font-mono">Mint tx</span> column links to the on-chain anchor.
          </p>
        </>
      )}
    </div>
  );
}

// ── Storage proof paginated table ─────────────────────────────────────────────

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

function fmtStorageTag(tag: string): string {
  if (!tag) return '—';
  if (tag.startsWith('0x')) return tag.slice(0, 10) + '…';
  const parts = tag.split('.');
  return parts[parts.length - 1] ?? tag;
}

export function StorageProofsClient({ proofSample }: { proofSample: StorageProofRow[] }) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [proofSample.length]);

  const total = proofSample.length;
  const totalPages = Math.max(1, Math.ceil(total / STORAGE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = proofSample.slice((safePage - 1) * STORAGE_PAGE_SIZE, safePage * STORAGE_PAGE_SIZE);

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center space-y-2">
        <p className="text-sm font-semibold text-white/50">No storage proofs yet</p>
        <p className="text-xs text-white/30 max-w-md mx-auto leading-relaxed">
          Heartbeats are running. Storage proofs appear once a heartbeat successfully
          uploads its payload to 0G Storage and the receipt is anchored on-chain.
        </p>
        <p className="text-[10px] text-white/20 pt-1">
          All receipts remain verifiable on-chain — see Overview → Receipt feed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-white/40 text-left">
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Storage root (0G)</th>
              <th className="px-4 py-3 font-medium">Payload hash</th>
              <th className="px-4 py-3 font-medium">Storage tx (0G)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Mint tx (Aristotle)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {pageRows.map(r => (
              <tr key={r.receiptId} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 text-white/60 capitalize">{r.agentId}</td>
                <td className="px-4 py-2.5 font-mono text-violet-300" title={r.actionTag}>{fmtStorageTag(r.actionTag)}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-400 text-[10px]" title={r.storageRoot}>
                  {r.storageRoot ? r.storageRoot.slice(0, 14) + '…' : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-white/35 text-[10px]" title={r.payloadHash}>
                  {r.payloadHash ? r.payloadHash.slice(0, 14) + '…' : '—'}
                </td>
                <td className="px-4 py-2.5">
                  {buildChainscanUrl({ txHash: r.storageTxHash, chainId: 16661 }) ? (
                    <a href={buildChainscanUrl({ txHash: r.storageTxHash, chainId: 16661 })!} target="_blank" rel="noreferrer"
                      className="font-mono text-emerald-400 hover:text-emerald-300 text-[10px]" title={r.storageTxHash}>
                      {r.storageTxHash?.slice(0, 10)}…
                    </a>
                  ) : <span className="text-white/20">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === 'minted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-white/40">{new Date(r.createdAt).toLocaleTimeString()}</td>
                <td className="px-4 py-2.5">
                  {buildChainscanUrl({ txHash: r.txHash, chainId: 16661 }) ? (
                    <a href={buildChainscanUrl({ txHash: r.txHash, chainId: 16661 })!} target="_blank" rel="noreferrer"
                      className="font-mono text-violet-400 hover:text-violet-300" title={r.txHash}>
                      {r.txHash?.slice(0, 10)}…
                    </a>
                  ) : <span className="text-white/20">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={safePage} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}
