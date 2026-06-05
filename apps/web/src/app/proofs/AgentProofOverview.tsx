'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CONTRACTS } from '@/lib/contracts';
import { buildChainscanUrl } from '@/lib/chainscan';

type DemoAgent = {
  slug: string;
  agentId: string | null;
  receiptCount: number;
  lastHeartbeat: string | null;
};

type ReceiptRow = {
  receiptId: string;
  agentId: string;
  agentName?: string;
  actionTag: string;
  payloadHash: string;
  storageRoot: string;
  storageTxHash?: string | undefined;
  txHash?: string | undefined;
  valueWei: string;
  status: 'pending' | 'minted' | 'failed' | string;
  createdAt: string;
};

type AgentSlug = 'aurora' | 'vesper' | 'helix';

type AgentDetail = {
  name: string;
  role: string;
  tokenId: string;
  owner: string;
  accountAddress: string;
  policyId: string;
  heartbeatCadence: string;
  actionTag: string;
  skills: string[];
  accent: string;
  iconBg: string;
  topBar: string;
  badgeActive: string;
  dot: string;
  Icon: ({ className }: { className?: string }) => JSX.Element;
};

const CHAIN_ID = 16661 as const;
const CONTRACTS_ARISTOTLE = CONTRACTS[CHAIN_ID]!;

const POLICY = {
  active: true,
  maxPerTx: '0.001 OG',
  dailyCap: '0.05 OG',
  allowedSelector: '0x00000000',
} as const;

function AuroraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="4" y1="27" x2="36" y2="27" strokeOpacity="0.5" />
      <path d="M 7 27 A 13 13 0 0 1 33 27" />
      <line x1="20" y1="4"  x2="20" y2="9" />
      <line x1="30.2" y1="9.8"  x2="26.7" y2="13.3" />
      <line x1="36"   y1="20"   x2="31"   y2="20"   />
      <line x1="9.8"  y1="9.8"  x2="13.3" y2="13.3" />
      <line x1="4"    y1="20"   x2="9"    y2="20"   />
    </svg>
  );
}

function VesperIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M 26 9 A 13 13 0 1 0 26 31 A 11 11 0 0 1 26 9 Z"
        fill="currentColor" fillOpacity="0.12" />
      <circle cx="33" cy="10" r="1"    fill="currentColor" stroke="none" />
      <circle cx="36" cy="18" r="0.7"  fill="currentColor" stroke="none" />
      <circle cx="30" cy="5"  r="0.7"  fill="currentColor" stroke="none" />
    </svg>
  );
}

function HelixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M 8 8  C 16 8  24 32 32 32" />
      <path d="M 8 32 C 16 32 24 8  32 8"  strokeOpacity="0.45" />
      <line x1="12" y1="10.5" x2="12" y2="27"  strokeOpacity="0.35" />
      <line x1="20" y1="17"   x2="20" y2="23"  strokeOpacity="0.6"  />
      <line x1="28" y1="13"   x2="28" y2="29.5" strokeOpacity="0.35" />
    </svg>
  );
}

const AGENT_DETAILS: Record<AgentSlug, AgentDetail> = {
  aurora: {
    name: 'Aurora',
    role: 'Analysis Agent',
    tokenId: '1',
    owner: '0xA642EDB7F6bBc632132240Daa50503B4F1271cFF',
    accountAddress: '0x8AD1Ef8a59554E5537631BfBa9a655A88A803a34',
    policyId: '4',
    heartbeatCadence: 'Every 10 min',
    actionTag: 'agent.heartbeat.analyze',
    skills: ['web.search', 'news.aggregate', 'summarize.long', 'chat.embed', 'memory.write', 'chain.send'],
    accent: 'text-amber-500',
    iconBg: 'bg-amber-400/[0.08] border-amber-400/20',
    topBar: 'from-amber-400/40 to-transparent',
    badgeActive: 'bg-amber-400/10 text-amber-600',
    dot: 'bg-amber-400',
    Icon: AuroraIcon,
  },
  vesper: {
    name: 'Vesper',
    role: 'Creative Agent',
    tokenId: '2',
    owner: '0xA642EDB7F6bBc632132240Daa50503B4F1271cFF',
    accountAddress: '0x4d1d3E14913C050dF9fD68aFaB90D04079C37f90',
    policyId: '5',
    heartbeatCadence: 'Every 15 min',
    actionTag: 'agent.heartbeat.media',
    skills: ['memory.search', 'image.generate', 'storage.upload', 'nft.mint', 'chain.send'],
    accent: 'text-accent-light',
    iconBg: 'bg-accent/[0.08] border-accent/20',
    topBar: 'from-accent/40 to-transparent',
    badgeActive: 'bg-accent/10 text-accent-light',
    dot: 'bg-accent',
    Icon: VesperIcon,
  },
  helix: {
    name: 'Helix',
    role: 'Analytics Agent',
    tokenId: '3',
    owner: '0xA642EDB7F6bBc632132240Daa50503B4F1271cFF',
    accountAddress: '0x62283f2064bA32c9797C5c1D7d5F6942229FAf00',
    policyId: '6',
    heartbeatCadence: 'Every 30 min',
    actionTag: 'agent.heartbeat.report',
    skills: ['chain.query', 'chat.completion', 'memory.write', 'chain.send'],
    accent: 'text-cyan-500',
    iconBg: 'bg-cyan-400/[0.08] border-cyan-400/20',
    topBar: 'from-cyan-400/40 to-transparent',
    badgeActive: 'bg-cyan-400/10 text-cyan-600',
    dot: 'bg-cyan-400',
    Icon: HelixIcon,
  },
};

const isAgentSlug = (slug: string): slug is AgentSlug => slug === 'aurora' || slug === 'vesper' || slug === 'helix';

function short(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatValueWei(valueWei: string): string {
  try {
    const wei = BigInt(valueWei || '0');
    const whole = wei / 1_000_000_000_000_000_000n;
    const frac = wei % 1_000_000_000_000_000_000n;
    const fracText = frac.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${whole.toString()}${fracText ? `.${fracText}` : ''} OG`;
  } catch {
    return '—';
  }
}

function statusFor(agent: DemoAgent): { label: string; isActive: boolean; hasActivity: boolean } {
  const isActive = Boolean(agent.lastHeartbeat);
  const hasActivity = agent.receiptCount > 0;
  return { label: isActive ? 'Live' : hasActivity ? 'Running' : 'Awaiting first heartbeat', isActive, hasActivity };
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1100);
        }).catch(() => undefined);
      }}
      className="rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-fg-faint transition-colors hover:border-[var(--color-line-accent)] hover:text-fg"
      aria-label={`${label} ${value}`}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function AddressLink({ value, label }: { value: string; label?: string }) {
  const href = buildChainscanUrl({ address: value, kind: 'address', chainId: CHAIN_ID });
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value} className="truncate font-mono text-accent-light hover:text-accent">
          {label ?? short(value, 10, 8)}
        </a>
      ) : (
        <span title={value} className="truncate font-mono text-fg-muted">{label ?? short(value, 10, 8)}</span>
      )}
      <CopyButton value={value} />
    </span>
  );
}

function HashValue({ value, tx = false }: { value?: string | undefined; tx?: boolean }) {
  if (!value) return <span className="text-fg-faint">—</span>;
  const href = tx ? buildChainscanUrl({ txHash: value, kind: 'tx', chainId: CHAIN_ID }) : null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value} className="truncate font-mono text-accent-light hover:text-accent">
          {short(value, 10, 8)}
        </a>
      ) : (
        <span title={value} className="truncate font-mono text-fg-muted">{short(value, 10, 8)}</span>
      )}
      <CopyButton value={value} />
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      <span className="shrink-0 text-xs text-fg-faint">{label}</span>
      <div className="min-w-0 text-right text-xs text-fg-muted">{children}</div>
    </div>
  );
}

function Section({ title, children, prominent = false }: { title: string; children: ReactNode; prominent?: boolean }) {
  return (
    <section className={`rounded-2xl border ${prominent ? 'border-[var(--color-line-accent)] bg-elevated/80' : 'border-[var(--color-line)] bg-surface'} p-4`}>
      <h3 className="mb-3 text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function DemoAgentCard({ agent, onOpen }: { agent: DemoAgent; onOpen: () => void }) {
  if (!isAgentSlug(agent.slug)) return null;
  const detail = AGENT_DETAILS[agent.slug];
  const { Icon } = detail;
  const status = statusFor(agent);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-surface text-left transition-[border-color,box-shadow,transform] duration-[220ms] hover:-translate-y-0.5 hover:border-[var(--color-line-accent)] hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      aria-label={`Open ${detail.name} proof details`}
    >
      <div className={`h-px w-full bg-gradient-to-r ${detail.topBar}`} />
      <div className="p-5 flex flex-col gap-5 flex-1">
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${detail.iconBg} ${detail.accent}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold leading-tight ${detail.accent}`}>{detail.name}</p>
            <p className="text-[11px] text-fg-muted mt-0.5">{detail.role}</p>
          </div>
          <div className="ml-auto">
            {status.isActive ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${detail.dot}`} />
                <span className="text-[10px] font-semibold text-fg-muted">Live</span>
              </span>
            ) : status.hasActivity ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${detail.dot}`} />
                <span className="text-[10px] font-semibold text-fg-muted">Running</span>
              </span>
            ) : (
              <span className="text-[10px] text-fg-faint">Idle</span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-fg-faint leading-relaxed -mt-2">Demo heartbeat agent · Aristotle mainnet</p>

        <div className="space-y-2.5 text-xs border-t border-[var(--color-line)] pt-4">
          <div className="flex justify-between items-center gap-2">
            <span className="text-fg-faint shrink-0">Controller</span>
            <span className={`font-mono truncate ${detail.accent}`} title={detail.accountAddress}>{short(detail.accountAddress, 6, 4)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-fg-faint">Receipts minted</span>
            <span className="text-fg font-semibold tabular-nums">{agent.receiptCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-fg-faint shrink-0">Last heartbeat</span>
            <span className="truncate text-fg-muted tabular-nums">{formatTimestamp(agent.lastHeartbeat)}</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between pt-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${status.isActive || status.hasActivity ? detail.badgeActive : 'bg-elevated text-fg-faint'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.isActive || status.hasActivity ? detail.dot : 'bg-fg-faint'}`} />
            {status.label}
          </span>
          <span className="text-[10px] font-medium text-fg-faint transition-colors group-hover:text-fg-muted">View proof →</span>
        </div>
      </div>
    </button>
  );
}

function AgentModal({ agent, receipts, onClose }: { agent: DemoAgent; receipts: ReceiptRow[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [onClose]);

  if (!isAgentSlug(agent.slug)) return null;
  const detail = AGENT_DETAILS[agent.slug];
  const { Icon } = detail;
  const status = statusFor(agent);
  const agentReceipts = receipts.filter((receipt) => receipt.agentId === agent.slug).slice(0, 5);

  if (!portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center px-4 py-6"
      role="presentation"
      data-agent-proof-overlay="true"
    >
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/65 backdrop-blur-xl"
        aria-label="Close agent proof modal backdrop"
        data-agent-proof-backdrop="true"
        onMouseDown={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-proof-modal-title"
        className="relative z-10 max-h-[85vh] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-3xl border border-[var(--color-line-bright)] bg-bg shadow-2xl outline-none"
      >
        <div className={`h-px w-full bg-gradient-to-r ${detail.topBar}`} />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--color-line)] bg-bg/95 p-5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${detail.iconBg} ${detail.accent}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="agent-proof-modal-title" className={`text-xl font-semibold ${detail.accent}`}>{detail.name}</h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${status.isActive || status.hasActivity ? detail.badgeActive : 'bg-elevated text-fg-faint'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.isActive || status.hasActivity ? detail.dot : 'bg-fg-faint'}`} />
                  {status.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">Demo heartbeat agent · Aristotle mainnet</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-[var(--color-line-accent)] hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="Close agent proof modal"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
          <Section title="Identity">
            <DetailRow label="iNFT token ID"><span className="font-mono text-fg">#{detail.tokenId}</span></DetailRow>
            <DetailRow label="AgentIdentity"><AddressLink value={CONTRACTS_ARISTOTLE.AgentIdentity} /></DetailRow>
            <DetailRow label="Controller"><AddressLink value={detail.accountAddress} /></DetailRow>
            <DetailRow label="Owner"><AddressLink value={detail.owner} /></DetailRow>
            <DetailRow label="Chain"><span>Aristotle mainnet · {CHAIN_ID}</span></DetailRow>
          </Section>

          <Section title="Runtime proof">
            <DetailRow label="Heartbeat cadence"><span>{detail.heartbeatCadence}</span></DetailRow>
            <DetailRow label="Last heartbeat"><span>{formatTimestamp(agent.lastHeartbeat)}</span></DetailRow>
            <DetailRow label="Receipts minted"><span className="font-semibold text-fg">{agent.receiptCount.toLocaleString()}</span></DetailRow>
            <DetailRow label="Current action tag"><span className="font-mono text-accent-light">{detail.actionTag}</span></DetailRow>
          </Section>

          <Section title="Policy">
            <DetailRow label="Policy ID"><span className="font-mono text-fg">#{detail.policyId}</span></DetailRow>
            <DetailRow label="Active"><span className="font-semibold text-success">{POLICY.active ? 'true' : 'false'}</span></DetailRow>
            <DetailRow label="Max per tx"><span>{POLICY.maxPerTx}</span></DetailRow>
            <DetailRow label="Daily cap"><span>{POLICY.dailyCap}</span></DetailRow>
            <DetailRow label="Allowed selector"><HashValue value={POLICY.allowedSelector} /></DetailRow>
          </Section>

          <Section title="Installed skills">
            <div className="flex flex-wrap gap-2">
              {detail.skills.map((skill) => (
                <span key={skill} className="rounded-full border border-[var(--color-line)] bg-elevated px-2.5 py-1 text-xs font-mono text-fg-muted">
                  {skill}
                </span>
              ))}
            </div>
          </Section>

          <div className="lg:col-span-2">
            <Section title="Recent on-chain actions" prominent>
              {agentReceipts.length === 0 ? (
                <p className="text-sm text-fg-muted">No recent receipts for this agent in the current proofs payload.</p>
              ) : (
                <div className="space-y-3">
                  {agentReceipts.map((receipt) => (
                    <article key={receipt.receiptId} className="rounded-xl border border-[var(--color-line)] bg-bg/70 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm text-accent-light" title={receipt.actionTag}>{receipt.actionTag}</p>
                          <p className="mt-0.5 text-[11px] text-fg-faint">{formatTimestamp(receipt.createdAt)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${receipt.status === 'minted' ? 'bg-success/15 text-success' : receipt.status === 'failed' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'}`}>
                          {receipt.status}
                        </span>
                      </div>

                      <div className="grid gap-x-5 gap-y-2 text-xs md:grid-cols-2">
                        <div className="flex min-w-0 justify-between gap-3">
                          <span className="text-fg-faint">Value</span>
                          <span className="font-mono text-fg-muted">{formatValueWei(receipt.valueWei)}</span>
                        </div>
                        <div className="flex min-w-0 justify-between gap-3">
                          <span className="text-fg-faint">Mint tx</span>
                          <HashValue value={receipt.txHash} tx />
                        </div>
                        <div className="flex min-w-0 justify-between gap-3">
                          <span className="text-fg-faint">Storage tx</span>
                          <HashValue value={receipt.storageTxHash} tx />
                        </div>
                        <div className="flex min-w-0 justify-between gap-3">
                          <span className="text-fg-faint">Receipt ID</span>
                          <HashValue value={receipt.receiptId} />
                        </div>
                        <div className="flex min-w-0 justify-between gap-3 md:col-span-2">
                          <span className="text-fg-faint">Payload hash</span>
                          <HashValue value={receipt.payloadHash} />
                        </div>
                        <div className="flex min-w-0 justify-between gap-3 md:col-span-2">
                          <span className="text-fg-faint">Storage root</span>
                          <HashValue value={receipt.storageRoot} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
}

function ActivityHeatmap({ heatmap }: { heatmap: Record<string, Record<string, number>> }) {
  const days = Object.keys(heatmap).sort().reverse();
  const allVals = days.flatMap(d => Object.values(heatmap[d] ?? {}).map(Number));
  const maxVal = Math.max(1, ...allVals);
  const intensityBg = ['bg-elevated', 'bg-accent/20', 'bg-accent/40', 'bg-accent/65', 'bg-accent/90'];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="flex gap-0.5 mb-1.5 pl-16">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-[26px] text-center text-[9px] text-fg-faint shrink-0">
              {h % 6 === 0 ? String(h) : ''}
            </div>
          ))}
        </div>
        {days.map(day => (
          <div key={day} className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-fg-faint w-14 shrink-0 text-right pr-2">{day.slice(5)}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 24 }, (_, h) => {
                const count = Number(heatmap[day]?.[String(h)] ?? 0);
                const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxVal) * 4));
                return (
                  <div
                    key={h}
                    title={`${day} ${h}:00 — ${count} receipt${count !== 1 ? 's' : ''}`}
                    className={`w-[26px] h-4 rounded-[2px] ${intensityBg[intensity]}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 pl-16">
          <span className="text-[9px] text-fg-faint">Less</span>
          {intensityBg.map((bg, i) => <div key={i} className={`w-[26px] h-4 rounded-[2px] ${bg}`} />)}
          <span className="text-[9px] text-fg-faint">More</span>
        </div>
      </div>
    </div>
  );
}

export function AgentProofOverview({ agents, receipts, heatmap, receiptFeed }: { agents: DemoAgent[]; receipts: ReceiptRow[]; heatmap: Record<string, Record<string, number>>; receiptFeed: ReactNode }) {
  const [selectedSlug, setSelectedSlug] = useState<AgentSlug | null>(null);
  const selectedAgent = useMemo(() => agents.find((agent) => selectedSlug && agent.slug === selectedSlug) ?? null, [agents, selectedSlug]);

  return (
    <div className="space-y-14">
      <div className="animate-fade-up space-y-4">
        <h2 className="text-lg font-semibold text-fg">Demo agents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {agents.map((agent) => {
            if (!isAgentSlug(agent.slug)) return null;
            const slug = agent.slug;
            return <DemoAgentCard key={slug} agent={agent} onOpen={() => setSelectedSlug(slug)} />;
          })}
        </div>
      </div>

      <div className="animate-fade-up delay-150 space-y-4">
        <h2 className="text-lg font-semibold text-fg">Activity — last 14 days × 24 h</h2>
        <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-5">
          <ActivityHeatmap heatmap={heatmap} />
        </div>
      </div>

      {receiptFeed}

      {selectedAgent && <AgentModal agent={selectedAgent} receipts={receipts} onClose={() => setSelectedSlug(null)} />}
    </div>
  );
}
