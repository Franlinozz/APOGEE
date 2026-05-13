'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useRouter, useSearchParams } from 'next/navigation';
import { siweNonce, siweVerify, ApiError } from '@/lib/api';
import { Loader2, AlertCircle, X } from 'lucide-react';

type SignState = 'idle' | 'signing' | 'error';

export function ConnectWallet() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const [state, setState] = useState<SignState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // If the user lands on /connect without a wallet, open RainbowKit modal immediately
  useEffect(() => {
    if (!isConnected && openConnectModal) {
      openConnectModal();
    }
  }, [isConnected, openConnectModal]);

  async function handleSign() {
    if (!address) return;
    setErrorMsg('');
    setState('signing');
    try {
      const domain = window.location.hostname;
      const uri = window.location.origin;
      const chainId = 16661; // Aristotle mainnet
      const { message } = await siweNonce(address, domain, uri, chainId);
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
      if ((err as { code?: number })?.code === 4001) {
        setState('idle');
        return;
      }
      setState('error');
      if (err instanceof ApiError) {
        setErrorMsg(err.detail ?? err.title);
      } else if (err instanceof TypeError) {
        setErrorMsg('Cannot reach the auth service. Check your connection and try again.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed — please try again.');
      }
    }
  }

  const isSigning = state === 'signing';

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <h1 className="text-sm font-semibold text-white">
          {isConnected ? 'Sign In' : 'Connect Wallet'}
        </h1>
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4">
        {!isConnected ? (
          /* Not connected — modal was auto-opened; show prompt as fallback */
          <div className="space-y-4">
            <p className="text-sm text-white/50 text-center leading-relaxed">
              Choose your wallet in the modal to connect.
            </p>
            <button
              onClick={() => openConnectModal?.()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Open wallet selector
            </button>
          </div>
        ) : (
          /* Connected — show SIWE sign step */
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/40">Connected as</p>
              <p className="mt-0.5 font-mono text-sm text-white">
                {address!.slice(0, 6)}…{address!.slice(-4)}
              </p>
            </div>

            {state === 'error' && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-red-400">{errorMsg}</p>
                  <button
                    onClick={() => setState('idle')}
                    className="mt-1 text-xs text-red-400/70 underline hover:text-red-400"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleSign}
              disabled={isSigning}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {isSigning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</>
              ) : (
                'Sign in with Ethereum'
              )}
            </button>

            <button
              onClick={() => disconnect()}
              className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Use a different wallet
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-6 py-3">
        <p className="text-[11px] text-white/25">
          By connecting, you agree to Apogee&apos;s{' '}
          <a href="/terms" className="hover:text-white/40 hover:underline">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="hover:text-white/40 hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
