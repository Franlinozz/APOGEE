'use client';

import { useState, useEffect, useCallback } from 'react';

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

type ProofsData = {
  receipts: ReceiptIndexRow[];
  generatedAt: string;
};

export function ReceiptsFeed({ edgeUrl }: { edgeUrl: string }) {
  const [data, setData] = useState<ProofsData | null>(null);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${edgeUrl}/v1/proofs`);
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

  const humanAction = (tag: string): string => {
    const map: Record<string, string> = {
      '0x00000000': 'genesis',
      '0x12345678': 'test.action',
    };
    return map[tag] ?? `${tag.slice(0, 10)}…`;
  };

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

      {data && data.receipts.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 text-sm text-white/40 text-center">
          No receipts yet — heartbeats will populate this within 10 min after agents are seeded.
        </div>
      )}

      {data && data.receipts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40 text-left">
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.receipts.map(r => (
                <tr key={r.receiptId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-violet-300">{humanAction(r.actionTag)}</td>
                  <td className="px-4 py-2.5 text-white/60 font-mono">{r.agentId.slice(0, 10)}…</td>
                  <td className="px-4 py-2.5 text-white/70">{(Number(BigInt(r.valueWei)) / 1e18).toFixed(6)} 0G</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === 'minted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/40">{new Date(r.createdAt).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5">
                    {r.txHash ? (
                      <a
                        href={`https://chainscan-galileo.0g.ai/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-violet-400 hover:text-violet-300"
                      >
                        {r.txHash.slice(0, 10)}…
                      </a>
                    ) : <span className="text-white/20">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
