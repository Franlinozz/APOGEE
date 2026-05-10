'use client';

import { useState } from 'react';
import { useAccount, useConnect, useSignMessage, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useRouter, useSearchParams } from 'next/navigation';
import { siweNonce, siweVerify } from '@/lib/api';

export function ConnectWallet() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [status, setStatus] = useState<'idle' | 'connecting' | 'signing' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConnect() {
    setStatus('connecting');
    setErrorMsg('');
    try {
      let addr = address;
      if (!isConnected) {
        const result = await connectAsync({ connector: injected() });
        addr = result.accounts[0];
      }
      if (!addr) throw new Error('No account connected');

      setStatus('signing');
      const domain = window.location.hostname;
      const uri = window.location.origin;
      const chainId = 16602;
      const { message } = await siweNonce(addr, domain, uri, chainId);
      const signature = await signMessageAsync({ message });
      const { token } = await siweVerify(message, signature);

      await fetch('/api/auth/set-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      router.push(redirect);
      router.refresh();
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-fg" style={{ letterSpacing: '-0.02em' }}>
          Connect your wallet
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Sign in with Ethereum to access your agent dashboard.
        </p>
      </div>

      {status === 'error' && (
        <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-danger">
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleConnect}
        disabled={status === 'connecting' || status === 'signing'}
        className="inline-flex h-10 w-full max-w-xs items-center justify-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {status === 'connecting' && 'Opening wallet…'}
        {status === 'signing' && 'Sign the message…'}
        {(status === 'idle' || status === 'error') && (isConnected ? 'Sign in' : 'Connect wallet')}
      </button>

      {isConnected && address && (
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-xs text-fg-muted">
            {address.slice(0, 6)}…{address.slice(-4)}
          </p>
          <button
            onClick={() => disconnect()}
            className="text-xs text-fg-faint hover:text-fg-muted"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
