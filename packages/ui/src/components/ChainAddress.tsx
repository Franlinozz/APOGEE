'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn.js';

export interface ChainAddressProps {
  address: string;
  chainId?: number;
  explorerUrl?: string;
  className?: string;
  short?: boolean;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerHref(address: string, chainId: number, explorerUrl?: string): string {
  const base = explorerUrl ?? (chainId === 16602
    ? 'https://chainscan-galileo.0g.ai'
    : 'https://chainscan.0g.ai');
  return `${base}/address/${address}`;
}

export function ChainAddress({ address, chainId = 16602, explorerUrl, className, short = true }: ChainAddressProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-DEFAULT',
        'bg-elevated px-2 py-1 font-mono text-xs text-fg-muted',
        className,
      )}
    >
      <span title={address}>{short ? truncate(address) : address}</span>

      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy address"
        className="text-fg-faint transition-colors hover:text-fg focus-visible:outline-none"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>

      <a
        href={explorerHref(address, chainId, explorerUrl)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View on chain explorer"
        className="text-fg-faint transition-colors hover:text-accent focus-visible:outline-none"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}
