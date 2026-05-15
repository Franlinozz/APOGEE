'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useRouter, useSearchParams } from 'next/navigation';
import { siweNonce, siweVerify, ApiError } from '@/lib/api';
import { ApogeeLogo } from '@/components/brand/apogee-logo';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, Globe, Key } from 'lucide-react';

const WALLETS = [
  {
    name: 'MetaMask',
    bg: '#F6851B',
    icon: (
      <svg viewBox="0 0 35 33" fill="none" className="h-5 w-5">
        <path d="M32.96 1L19.37 10.9l2.53-5.94L32.96 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2.04 1l13.47 9.97-2.4-5.99L2.04 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M28.23 23.53l-3.61 5.53 7.73 2.13 2.22-7.54-6.34-.12zM.46 23.65l2.2 7.54 7.72-2.13-3.6-5.53-6.32.12z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9.96 14.36L7.8 17.58l7.65.35-.26-8.22-5.23 4.65zM25.04 14.36l-5.29-4.74-.17 8.3 7.63-.35-2.17-3.21zM10.38 29.06l4.6-2.24-3.97-3.1-.63 5.34zM20.02 26.82l4.58 2.24-.61-5.34-3.97 3.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M24.6 29.06l-4.58-2.24.37 2.97-.04 1.25 4.25-1.98zM10.38 29.06l4.27 1.98-.03-1.25.35-2.97-4.59 2.24z" fill="#D5BFB2" stroke="#D5BFB2" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14.72 21.98l-3.83-1.12 2.7-1.24 1.13 2.36zM20.28 21.98l1.13-2.36 2.71 1.24-3.84 1.12z" fill="#233447" stroke="#233447" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10.38 29.06l.65-5.53-4.25.12 3.6 5.41zM23.97 23.53l.66 5.53 3.59-5.41-4.25-.12zM27.21 17.58l-7.63.35.71 3.95 1.13-2.36 2.71 1.24 3.08-3.18zM10.89 20.86l2.7-1.24 1.12 2.36.72-3.95-7.65-.35 3.11 3.18z" fill="#CC6228" stroke="#CC6228" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.8 17.58l3.2 6.25-.11-3.07-3.09-3.18zM24.12 20.76l-.13 3.07 3.22-6.25-3.09 3.18zM15.45 17.93l-.71 3.95.89 4.61.2-6.08-.38-2.48zM19.55 17.93l-.36 2.47.18 6.09.9-4.61-.72-3.95z" fill="#E27525" stroke="#E27525" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20.28 21.98l-.9 4.61.65.45 3.97-3.1.13-3.07-3.85 1.11zM10.89 20.86l.11 3.07 3.97 3.1.65-.45-.89-4.61-3.84-1.11z" fill="#F5841F" stroke="#F5841F" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20.32 31.04l.04-1.25-.34-.3h-5.04l-.32.3.03 1.25-4.27-1.98 1.49 1.22 3.02 2.09h5.17l3.03-2.09 1.49-1.22-4.3 1.98z" fill="#C0AC9D" stroke="#C0AC9D" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20.02 26.82l-.65-.45h-3.74l-.65.45-.35 2.97.32-.3h5.04l.34.3-.31-2.97z" fill="#161616" stroke="#161616" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M33.52 11.34L34.99 4.5l-2.03-3.5-12.94 9.6 4.98 4.2 7.03 2.05 1.55-1.81-.67-.49 1.07-.98-.82-.64 1.07-.82-.69-.53zM0 4.5l1.48 6.84-.95.53 1.08.82-.82.64 1.07.98-.67.49 1.55 1.81 7.03-2.05 4.98-4.2L2.03 1 0 4.5z" fill="#763E1A" stroke="#763E1A" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M32.06 16.85l-7.03-2.05 2.17 3.21-3.22 6.25 4.25-.12h6.34l-2.51-7.29zM9.96 14.8l-7.02 2.05-2.5 7.29h6.32l4.24.12-3.2-6.25 2.16-3.21zM19.55 17.93l.44-7.63 2.02-5.47h-8.97l2 5.47.47 7.63.17 2.49.01 6.07h3.74l.02-6.07.1-2.49z" fill="#F5841F" stroke="#F5841F" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    name: 'Coinbase Wallet',
    bg: '#0052FF',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle cx="12" cy="12" r="12" fill="#0052FF"/>
        <circle cx="12" cy="12" r="8.571" fill="white"/>
        <circle cx="12" cy="12" r="5.143" fill="#0052FF"/>
      </svg>
    ),
  },
  {
    name: 'Browser Wallet',
    bg: '#6366F1',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="#818CF8" strokeWidth="1.5"/>
        <path d="M2 9h20" stroke="#818CF8" strokeWidth="1.5"/>
        <rect x="15" y="12" width="4" height="3" rx="1" fill="#818CF8"/>
      </svg>
    ),
  },
];

const EXPLAINER = [
  {
    icon: <Key className="h-4 w-4 text-violet-400" />,
    title: 'Your keys, your assets',
    desc: 'A wallet stores your cryptographic keys. No bank or platform can freeze or seize your funds.',
  },
  {
    icon: <Globe className="h-4 w-4 text-violet-400" />,
    title: 'One identity everywhere',
    desc: 'Your wallet address is your universal login — no account creation, no passwords.',
  },
  {
    icon: <ShieldCheck className="h-4 w-4 text-violet-400" />,
    title: 'Sign-in with Ethereum',
    desc: 'Apogee uses cryptographic signatures to authenticate you. Nothing is stored on our servers.',
  },
];

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

  useEffect(() => {
    setState('idle');
    setErrorMsg('');
  }, [address]);

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
      const chainId = 16661;
      const { message } = await siweNonce(address, domain, uri, chainId);
      const signature = await signMessageAsync({ message });
      const { token } = await siweVerify(message, signature);

      const cookieRes = await fetch('/api/auth/set-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!cookieRes.ok) throw new Error('Session cookie could not be saved. Please try again.');

      router.push(redirect);
      router.refresh();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message.toLowerCase() : '';
      if ((err as { code?: number })?.code === 4001 || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected request')) {
        setState('error');
        setErrorMsg('Signature cancelled. Nothing changed — you can try again when ready.');
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

  if (isConnected && address) {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414] shadow-2xl">
        <div className="border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2">
            <ApogeeLogo mode="auth" markOnly variant="light" priority />
            <span className="text-sm font-semibold text-white">Apogee Protocol</span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-base font-semibold text-white">Sign in to continue</p>
            <p className="mt-1 text-sm text-white/40">Verify ownership of your wallet</p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-violet-600/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-violet-400" />
            </div>
            <div>
              <p className="text-xs text-white/40">Connected as</p>
              <p className="font-mono text-sm text-white">{address.slice(0, 6)}…{address.slice(-4)}</p>
            </div>
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
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isSigning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Signing message…</>
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
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414] shadow-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">

        {/* Left: wallet list */}
        <div className="p-7">
          <div className="mb-5 flex items-center gap-2">
            <ApogeeLogo mode="auth" markOnly variant="light" priority />
            <span className="text-sm font-semibold text-white">Apogee Protocol</span>
          </div>

          <h2 className="text-lg font-semibold text-white">Connect a Wallet</h2>
          <p className="mt-1 mb-5 text-sm text-white/40">Choose from the options below</p>

          <div className="space-y-1.5">
            {WALLETS.map((w) => (
              <button
                key={w.name}
                onClick={() => openConnectModal?.()}
                className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-left transition-all hover:border-violet-500/40 hover:bg-white/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                  {w.icon}
                </div>
                <span className="flex-1 text-sm font-medium text-white/80 group-hover:text-white">
                  {w.name}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-white/20 transition-colors group-hover:text-violet-400" />
              </button>
            ))}
          </div>

          <p className="mt-5 text-[11px] text-white/25 leading-relaxed">
            By connecting you agree to Apogee&apos;s{' '}
            <a href="/terms" className="hover:text-white/40 hover:underline">Terms</a>
            {' '}and{' '}
            <a href="/privacy" className="hover:text-white/40 hover:underline">Privacy Policy</a>.
          </p>
        </div>

        {/* Right: what is a wallet? */}
        <div className="p-7 bg-white/[0.02]">
          <h3 className="text-sm font-semibold text-white mb-5">What is a wallet?</h3>

          <div className="space-y-5">
            {EXPLAINER.map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-xs text-white/40 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <p className="text-xs text-violet-300/80 leading-relaxed">
              New to Web3?{' '}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:underline"
              >
                Install MetaMask
              </a>
              {' '}— a free browser extension that takes two minutes to set up.
            </p>
          </div>

          <button
            onClick={() => openConnectModal?.()}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Get Started
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
