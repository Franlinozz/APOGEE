'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function NavConnectButton() {
  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const router = useRouter();

  // Track whether *this button* initiated the connection so we only redirect
  // when the user clicked here — not when a pre-existing session is detected.
  const initiatedHere = useRef(false);

  useEffect(() => {
    if (isConnected && initiatedHere.current) {
      initiatedHere.current = false;
      router.push('/connect?redirect=/dashboard');
    }
  }, [isConnected, router]);

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  if (isConnected && shortAddr) {
    return (
      <button
        onClick={() => router.push('/connect?redirect=/dashboard')}
        className="inline-flex h-8 items-center rounded-[var(--radius)] border border-accent/40 px-4 text-xs font-mono text-fg-muted transition-colors hover:border-accent hover:text-fg"
      >
        {shortAddr}
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        initiatedHere.current = true;
        openConnectModal?.();
      }}
      className="inline-flex h-8 items-center rounded-[var(--radius)] bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent/85"
    >
      Connect Wallet
    </button>
  );
}
