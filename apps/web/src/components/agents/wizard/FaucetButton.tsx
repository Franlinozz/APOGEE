'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { Droplets, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { APOGEE_CHAIN_ID } from '@apogee/core';
import { aristotle } from '@/lib/wagmi';

type FaucetState =
  | { phase: 'checking' }
  | { phase: 'disabled' }
  | { phase: 'not_connected' }
  | { phase: 'wrong_network' }
  | { phase: 'eligible' }
  | { phase: 'sending' }
  | { phase: 'success'; txHash: string }
  | { phase: 'cooldown'; cooldownUntil: string }
  | { phase: 'empty' }
  | { phase: 'error'; message: string };

function formatCooldown(until: string): string {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function FaucetButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [state, setState] = useState<FaucetState>({ phase: 'checking' });

  const checkStatus = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/faucet/status?address=${encodeURIComponent(addr)}`);
      const data = await res.json() as { enabled?: boolean; eligible?: boolean; cooldownUntil?: string; txHash?: string };
      if (!data.enabled) { setState({ phase: 'disabled' }); return; }
      if (!data.eligible && data.cooldownUntil) {
        setState({ phase: 'cooldown', cooldownUntil: data.cooldownUntil });
      } else {
        setState({ phase: 'eligible' });
      }
    } catch {
      setState({ phase: 'eligible' }); // optimistic if status check fails
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) { setState({ phase: 'not_connected' }); return; }
    if (chainId !== APOGEE_CHAIN_ID) { setState({ phase: 'wrong_network' }); return; }
    setState({ phase: 'checking' });
    void checkStatus(address);
  }, [isConnected, address, chainId, checkStatus]);

  async function requestFaucet() {
    if (!isConnected || !address) return;
    if (chainId !== APOGEE_CHAIN_ID) {
      try { await switchChainAsync({ chainId: aristotle.id }); return; } catch { return; }
    }
    setState({ phase: 'sending' });
    try {
      const res = await fetch('/api/faucet/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json() as { txHash?: string; cooldownUntil?: string; detail?: string; title?: string };
      if (!res.ok) {
        if (res.status === 429 && data.cooldownUntil) {
          setState({ phase: 'cooldown', cooldownUntil: data.cooldownUntil });
        } else if (res.status === 503) {
          const msg = (data.title ?? '').toLowerCase();
          setState({ phase: msg.includes('empty') ? 'empty' : 'disabled' });
        } else {
          setState({ phase: 'error', message: data.detail ?? data.title ?? 'Request failed' });
        }
        return;
      }
      setState({ phase: 'success', txHash: data.txHash ?? '' });
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Request failed' });
    }
  }

  if (state.phase === 'disabled') return null;

  const baseClass = 'inline-flex h-9 items-center gap-2 rounded-[var(--radius)] px-4 text-xs font-semibold transition-all';
  const gradientClass = `${baseClass} text-white shadow-sm`;

  if (state.phase === 'checking') {
    return (
      <button disabled className={`${baseClass} border border-[var(--color-line)] text-fg-faint cursor-wait`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking faucet…
      </button>
    );
  }

  if (state.phase === 'not_connected') {
    return (
      <button disabled className={`${baseClass} border border-[var(--color-line)] text-fg-faint cursor-not-allowed`}>
        <Droplets className="h-3.5 w-3.5" />
        Connect wallet to request $0G
      </button>
    );
  }

  if (state.phase === 'wrong_network') {
    return (
      <button
        type="button"
        onClick={() => void switchChainAsync({ chainId: aristotle.id })}
        className={`${gradientClass}`}
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' }}
      >
        <Droplets className="h-3.5 w-3.5" />
        Switch to Aristotle Mainnet
      </button>
    );
  }

  if (state.phase === 'eligible') {
    return (
      <button
        type="button"
        onClick={() => void requestFaucet()}
        className={gradientClass}
        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' }}
      >
        <Droplets className="h-3.5 w-3.5" />
        Request 0.1 $0G
      </button>
    );
  }

  if (state.phase === 'sending') {
    return (
      <button disabled className={`${gradientClass} opacity-80 cursor-wait`} style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Sending 0.1 $0G…
      </button>
    );
  }

  if (state.phase === 'success') {
    return (
      <div className="flex flex-col gap-1">
        <div className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-success/15 px-4 text-xs font-semibold text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          0.1 $0G sent!
        </div>
        {state.txHash && (
          <a
            href={`https://chainscan.0g.ai/tx/${state.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-fg-faint hover:text-accent-light font-mono px-1"
          >
            {state.txHash.slice(0, 18)}… ↗
          </a>
        )}
      </div>
    );
  }

  if (state.phase === 'cooldown') {
    return (
      <button disabled className={`${baseClass} border border-[var(--color-line)] text-fg-muted cursor-not-allowed`}>
        <Clock className="h-3.5 w-3.5" />
        Available again in {formatCooldown(state.cooldownUntil)}
      </button>
    );
  }

  if (state.phase === 'empty') {
    return (
      <button disabled className={`${baseClass} border border-warning/30 text-warning/70 cursor-not-allowed`}>
        <AlertCircle className="h-3.5 w-3.5" />
        Faucet temporarily empty
      </button>
    );
  }

  if (state.phase === 'error') {
    return (
      <button
        type="button"
        onClick={() => void requestFaucet()}
        className={`${baseClass} border border-danger/30 text-danger hover:bg-danger/10`}
        title={state.message}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Retry faucet request
      </button>
    );
  }

  return null;
}
