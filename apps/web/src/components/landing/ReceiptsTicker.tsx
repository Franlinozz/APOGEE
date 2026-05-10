'use client';

import { useEffect, useRef, useState } from 'react';

interface TickerReceipt {
  id: string;
  agentId: string;
  skillId: string;
  amountWei: string;
  txHash: string;
  timestamp: number;
}

interface ReceiptsTickerProps {
  snapshot: TickerReceipt[];
}

function fmtWei(wei: string): string {
  const n = Number(BigInt(wei)) / 1e18;
  return `${n.toFixed(4)} 0G`;
}

function truncate(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function ReceiptsTicker({ snapshot }: ReceiptsTickerProps) {
  const [receipts, setReceipts] = useState<TickerReceipt[]>(snapshot);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/v1/stream';

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (ev: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(ev.data) as { event: string; payload: unknown };
          if (parsed.event !== 'receipt') return;
          const receipt = parsed.payload as TickerReceipt;
          setReceipts((prev) => [receipt, ...prev].slice(0, 6));
        } catch {
          /* malformed frame — ignore */
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        /* Back-off reconnect — 5s */
        setTimeout(connect, 5000);
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  if (receipts.length === 0) return null;

  return (
    <section aria-label="Live receipt feed" className="border-y border-[var(--color-line)] bg-surface/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 overflow-hidden py-3">
          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-light">
            Live
          </span>
          <div className="flex gap-6 overflow-x-auto scrollbar-none">
            {receipts.map((r) => (
              <div
                key={r.id}
                className="flex shrink-0 items-center gap-2 text-xs text-fg-muted"
              >
                <span className="font-mono text-fg-faint">{truncate(r.txHash)}</span>
                <span className="text-fg">{r.skillId}</span>
                <span className="font-mono text-accent-light">{fmtWei(r.amountWei)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
