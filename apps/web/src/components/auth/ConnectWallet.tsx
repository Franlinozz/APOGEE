'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useSignMessage, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useRouter, useSearchParams } from 'next/navigation';
import { siweNonce, siweVerify, ApiError } from '@/lib/api';
import {
  Globe,
  Loader2,
  AlertCircle,
  ChevronRight,
  X,
  ExternalLink,
} from 'lucide-react';

type FlowState = 'pick' | 'connecting' | 'signing' | 'error';

// ── Wallet definitions ────────────────────────────────────────────────────

const WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    subtitle: 'Browser extension wallet',
    recommended: true,
    connector: () => injected({ target: 'metaMask' }),
  },
  {
    id: 'browser',
    name: 'Browser Wallet',
    subtitle: 'Any injected provider',
    recommended: false,
    connector: () => injected(),
  },
] as const;

type WalletId = (typeof WALLETS)[number]['id'];

// ── Icons ─────────────────────────────────────────────────────────────────

function MetaMaskIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f6851b]">
      <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
        <path
          d="M1 14V9L10 14L19 9V14"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M1 7L10 2L19 7"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function BrowserWalletIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
      <Globe className="h-5 w-5 text-white" aria-hidden="true" />
    </span>
  );
}

const WALLET_ICONS: Record<WalletId, () => React.ReactElement> = {
  metamask: MetaMaskIcon,
  browser: BrowserWalletIcon,
};

// ── Component ─────────────────────────────────────────────────────────────

export function ConnectWallet() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [state, setState] = useState<FlowState>('pick');
  const [activeWallet, setActiveWallet] = useState<WalletId | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [detected, setDetected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum;
    if (!eth) return;
    const found = new Set<string>();
    if (eth.isMetaMask) found.add('metamask');
    found.add('browser');
    setDetected(found);
  }, []);

  // ── Auth logic (unchanged from original) ─────────────────────────────────
  async function handleConnect(walletId?: WalletId) {
    const wallet = walletId ? WALLETS.find((w) => w.id === walletId) : undefined;
    if (walletId && !wallet) return;

    if (walletId) setActiveWallet(walletId);
    setErrorMsg('');

    try {
      let addr = address;
      if (!isConnected) {
        setState('connecting');
        const result = await connectAsync({ connector: wallet!.connector() });
        addr = result.accounts[0];
      }
      if (!addr) throw new Error('No account connected');

      setState('signing');
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
      // EIP-1193 user rejection — silently return to idle
      if ((err as { code?: number })?.code === 4001) {
        setState('pick');
        setActiveWallet(null);
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

  const isBusy = state === 'connecting' || state === 'signing';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface shadow-[var(--shadow-card)]">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4">
        <h1 className="text-base font-semibold tracking-tight text-fg">
          Connect a Wallet
        </h1>
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-elevated hover:text-fg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col sm:flex-row">

        {/* Left — wallet list */}
        <div className="flex-1 p-6">

          {/* Already connected: show address + sign-in CTA */}
          {isConnected && address ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-[var(--radius)] border border-[var(--color-line-accent)] bg-elevated/50 px-4 py-3">
                <p className="text-xs text-fg-muted">Connected as</p>
                <p className="mt-0.5 font-mono text-sm text-fg">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </p>
              </div>

              {state === 'error' && (
                <ErrorBanner message={errorMsg} onDismiss={() => setState('pick')} />
              )}

              <button
                onClick={() => handleConnect()}
                disabled={isBusy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-accent px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {state === 'signing' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sign the message…</>
                ) : (
                  'Sign in'
                )}
              </button>

              <button
                onClick={() => disconnect()}
                className="text-center text-xs text-fg-faint hover:text-fg-muted"
              >
                Use a different wallet
              </button>
            </div>
          ) : (
            <>
              {/* Busy status banner */}
              {isBusy && (
                <div className="mb-4 flex items-center gap-2.5 rounded-[var(--radius)] bg-elevated px-3.5 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-light" />
                  <p className="text-xs text-fg-muted">
                    {state === 'connecting'
                      ? 'Opening wallet…'
                      : 'Sign the message in your wallet…'}
                  </p>
                </div>
              )}

              {/* Error banner */}
              {state === 'error' && (
                <div className="mb-4">
                  <ErrorBanner
                    message={errorMsg}
                    onDismiss={() => { setState('pick'); setActiveWallet(null); }}
                  />
                </div>
              )}

              {/* Section label */}
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-fg-faint">
                {detected.size > 0 ? 'Installed' : 'Available'}
              </p>

              {/* Wallet rows */}
              <ul className="flex flex-col gap-2" role="list">
                {WALLETS.filter((w) => {
                  if (w.id === 'browser') return detected.size > 0;
                  return true;
                }).map((wallet) => {
                  const Icon = WALLET_ICONS[wallet.id];
                  const isActive = activeWallet === wallet.id && isBusy;
                  const isInstalled = detected.has(wallet.id);

                  return (
                    <li key={wallet.id}>
                      <button
                        onClick={() => handleConnect(wallet.id)}
                        disabled={isBusy}
                        className="group flex w-full items-center gap-3.5 rounded-[var(--radius)] border border-[var(--color-line)] px-4 py-3 text-left transition-all duration-[var(--duration-base)] hover:border-[var(--color-line-accent)] hover:bg-elevated hover:shadow-[var(--shadow-card-hover)] disabled:cursor-wait disabled:opacity-60"
                      >
                        <Icon />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-fg">
                              {wallet.name}
                            </span>
                            {isInstalled && (
                              <span className="rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success">
                                Installed
                              </span>
                            )}
                            {wallet.recommended && !isInstalled && (
                              <span className="rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-semibold text-accent-light">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-fg-faint">{wallet.subtitle}</p>
                        </div>

                        {isActive ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-light" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* No wallet detected hint */}
              {detected.size === 0 && (
                <p className="mt-4 text-xs text-fg-faint">
                  No wallet detected.{' '}
                  <a
                    href="https://metamask.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-light hover:underline"
                  >
                    Install MetaMask
                  </a>{' '}
                  to get started.
                </p>
              )}
            </>
          )}
        </div>

        {/* Right — "What is a wallet?" explainer */}
        <div className="hidden w-56 shrink-0 flex-col gap-5 border-l border-[var(--color-line)] bg-elevated/30 p-6 sm:flex">
          <div>
            <h2 className="text-sm font-semibold text-fg">What is a wallet?</h2>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              A wallet stores your private keys and lets you sign transactions on
              Ethereum-compatible chains — no passwords required.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-fg">New to wallets?</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-faint">
              Apogee uses Sign-In with Ethereum (SIWE). Your wallet signature
              proves ownership of your address — nothing else is stored.
            </p>
          </div>

          <a
            href="https://ethereum.org/en/wallets/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 text-xs text-accent-light hover:underline"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--color-line)] px-6 py-3">
        <p className="text-[11px] text-fg-faint">
          By connecting, you agree to Apogee&apos;s{' '}
          <a href="/terms" className="hover:text-fg-muted hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="hover:text-fg-muted hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius)] border border-danger/30 bg-danger/10 px-3.5 py-2.5">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-danger">{message}</p>
        <button
          onClick={onDismiss}
          className="mt-1 text-xs text-danger/70 underline hover:text-danger"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
