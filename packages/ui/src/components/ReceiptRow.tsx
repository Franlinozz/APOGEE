'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn.js';

export interface ReceiptRowData {
  id: string;
  agentId: string;
  txHash: string;
  amount: bigint;
  skillId: string;
  timestamp: number;
  storageRoot?: string | undefined;
}

export interface ReceiptRowProps {
  receipt: ReceiptRowData;
  className?: string;
}

function fmtWei(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} 0G`;
}

function fmtTime(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', dateStyle: 'short' }).format(
    new Date(ts * 1000),
  );
}

function truncate(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function ReceiptRow({ receipt, className }: ReceiptRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('rounded-[var(--radius)] border border-DEFAULT bg-surface', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <span className="text-fg-faint">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="flex-1 font-mono text-xs text-fg-muted">{truncate(receipt.txHash)}</span>
        <span className="text-xs text-fg-muted">{receipt.skillId}</span>
        <span className="font-mono text-xs text-fg">{fmtWei(receipt.amount)}</span>
        <span className="text-xs text-fg-faint">{fmtTime(receipt.timestamp)}</span>
      </button>

      {open && (
        <div className="border-t border-DEFAULT px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <span className="text-fg-muted">Agent</span>
          <span className="font-mono text-fg truncate">{receipt.agentId}</span>
          <span className="text-fg-muted">Tx hash</span>
          <span className="font-mono text-fg truncate">{receipt.txHash}</span>
          {receipt.storageRoot && (
            <>
              <span className="text-fg-muted">Storage root</span>
              <span className="font-mono text-fg truncate">{receipt.storageRoot}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
