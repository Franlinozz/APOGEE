'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Agent, MemoryEntry, Receipt, Run, SkillManifest } from '@/lib/types';
import { buildChainscanUrl } from '@/lib/chainscan';
import { Badge } from '@apogee/ui';

type InstalledSkill = { agentId: string; skillId: string; version?: string; installedAt: string };

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'policy', label: 'Policy' },
  { id: 'splits', label: 'Splits' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = typeof TABS[number]['id'];

interface Props {
  agent: Agent;
  receipts: Receipt[];
  runs: Run[];
  memoryEntries: MemoryEntry[];
  installedSkills: InstalledSkill[];
  skillCatalog: SkillManifest[];
}

function runtimeLabel(agent: Agent, receipts: Receipt[], runs: Run[]): string {
  const latestRun = runs.find((run) => run.status === 'success' || run.status === 'succeeded' || run.status === 'running');
  if (latestRun && agent.status === 'active') return `Active — last runtime run ${fmtDate(latestRun.createdAt)}`;
  if (agent.status === 'failed' || agent.status === 'error') return `Failed — ${agent.deployment?.error ?? 'bootstrap or runtime failed'}`;
  if (agent.status === 'activating') return 'Activating — bootstrap pending';
  if (agent.status === 'initialized' || agent.status === 'ready' || receipts.some((r) => r.skillId === 'agent.created')) return 'Initialized — awaiting first scheduled task';
  return 'Indexed — awaiting bootstrap';
}

function latestEvent(receipts: Receipt[], runs: Run[]): string {
  const rows = [
    ...receipts.map((receipt) => ({ label: receipt.skillId ?? 'receipt.minted', time: receipt.createdAt })),
    ...runs.map((run) => ({ label: `run.${run.status}`, time: run.createdAt })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  return rows[0] ? `${rows[0].label} · ${fmtDate(rows[0].time)}` : 'No lifecycle events indexed';
}

export function AgentDetailTabs({ agent, receipts, runs, memoryEntries, installedSkills, skillCatalog }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div>
      <div className="flex border-b border-[var(--color-line)] px-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'shrink-0 py-3 px-4 text-sm transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'overview' && <OverviewTab agent={agent} receipts={receipts} runs={runs} memoryEntries={memoryEntries} installedSkills={installedSkills} />}
        {activeTab === 'activity' && <ActivityTab receipts={receipts} runs={runs} />}
        {activeTab === 'memory' && <MemoryTab agentId={agent.id} entries={memoryEntries} />}
        {activeTab === 'skills' && <SkillsTab installedSkills={installedSkills} skillCatalog={skillCatalog} />}
        {activeTab === 'policy' && <PolicyTab agent={agent} installedSkills={installedSkills} />}
        {activeTab === 'splits' && <SplitsTab />}
        {activeTab === 'settings' && <SettingsTab agent={agent} />}
      </div>
    </div>
  );
}

function OverviewTab({ agent, receipts, runs, memoryEntries, installedSkills }: Pick<Props, 'agent' | 'receipts' | 'runs' | 'memoryEntries' | 'installedSkills'>) {
  const totalVolume = receipts.reduce((sum, receipt) => sum + BigInt(receipt.amountWei), 0n);
  const tokenId = agent.identityTokenId ?? agent.deployment?.tokenId ?? agent.id;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Token ID" value={tokenId} mono />
        <Info label="Owner" value={short(agent.ownerAddress)} mono />
        <Info label="Agent account" value={agent.accountAddress ? short(agent.accountAddress) : 'Not indexed yet'} mono />
        <Info label="Status" value={agent.status.replace('_', ' ')} />
        <Info label="Created" value={fmtDate(agent.deployment?.createdAt ?? agent.createdAt)} />
        <Info label="Runtime" value={runtimeLabel(agent, receipts, runs)} />
        <Info label="Selected skills" value={String(agent.deployment?.selectedSkillIds?.length ?? installedSkills.length)} />
        <Info label="Receipts" value={String(receipts.length)} />
        <Info label="Memory entries" value={String(memoryEntries.length)} />
        <Info label="Latest event" value={latestEvent(receipts, runs)} />
        <Info label="Total volume" value={fmtWei(totalVolume.toString())} />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="text-sm font-medium text-fg">Lifecycle honesty</p>
        <p className="mt-2 text-xs text-fg-muted">
          Deployment/bootstrap receipts are real lifecycle records. They do not mean this agent has an autonomous runtime loop yet.
          User-created agents become <span className="text-fg">active</span> only after a real scheduled task or heartbeat exists.
        </p>
      </div>
    </div>
  );
}

function ActivityTab({ receipts, runs }: { receipts: Receipt[]; runs: Run[] }) {
  const events = [
    ...receipts.map((receipt) => ({ id: receipt.id, type: 'receipt', label: receipt.skillId ?? 'receipt.minted', status: receipt.status, time: receipt.createdAt, txHash: receipt.txHash, storageRoot: receipt.storageRoot })),
    ...runs.map((run) => ({ id: run.id, type: 'run', label: run.steps[0]?.type ?? 'agent.run', status: run.status, time: run.createdAt, txHash: undefined, storageRoot: undefined })),
  ].sort((a, b) => b.time.localeCompare(a.time));

  if (events.length === 0) return <Empty title="No lifecycle events yet" body="No deployment, bootstrap, memory, heartbeat, or runtime receipts are indexed for this agent yet." />;

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={`${event.type}:${event.id}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3 text-sm transition-[background-color] duration-100 hover:bg-accent/[0.04]">
          <div>
            <p className="font-medium text-fg">{event.label}</p>
            <p className="font-mono text-xs text-fg-faint">
              {short(event.id)}
              {buildChainscanUrl({ txHash: event.txHash, chainId: 16661 }) && (
                <a className="ml-2 text-accent hover:underline" href={buildChainscanUrl({ txHash: event.txHash, chainId: 16661 })!} target="_blank" rel="noreferrer">tx ↗</a>
              )}
              {event.storageRoot && /^0x[a-fA-F0-9]{64}$/.test(event.storageRoot) && <span className="ml-2 text-fg-faint">storage {short(event.storageRoot)}</span>}
            </p>
          </div>
          <div className="text-right">
            <Badge variant={event.status === 'confirmed' || event.status === 'success' || event.status === 'succeeded' ? 'success' : event.status === 'failed' || event.status === 'error' ? 'danger' : 'warning'} className="capitalize">{event.status}</Badge>
            <p className="mt-1 text-xs text-fg-muted">{fmtDate(event.time)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryTab({ agentId, entries }: { agentId: string; entries: MemoryEntry[] }) {
  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <Empty title="No memory entries yet" body="Memory appears only after this agent executes memory.write or memory.search-backed tasks. A newly indexed on-chain agent can be valid while memory is still empty." />
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 8).map((entry) => (
            <div key={entry.id} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3">
              <div className="flex items-center justify-between gap-3"><p className="font-mono text-xs text-fg">{entry.key}</p>{(entry.visibility === 'system' || entry.visibility === 'bootstrap' || entry.tags?.includes('bootstrap')) && <Badge variant="neutral">System bootstrap memory</Badge>}</div>
              <p className="mt-1 text-xs text-fg-muted">Updated {fmtDate(entry.updatedAt)} · not labeled private/encrypted unless written by a private memory skill</p>
            </div>
          ))}
        </div>
      )}
      <Link href={`/memory/${agentId}`} className="text-sm text-accent hover:underline">Open full memory explorer →</Link>
    </div>
  );
}

function SkillsTab({ installedSkills, skillCatalog }: { installedSkills: InstalledSkill[]; skillCatalog: SkillManifest[] }) {
  if (installedSkills.length === 0) return <Empty title="No installed skills indexed" body="Skill selections are now stored during deployment. Existing older agents may show empty until reconfigured or indexed from a new deployment." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {installedSkills.map((install) => {
        const manifest = skillCatalog.find((skill) => skill.id === install.skillId);
        return (
          <div key={install.skillId} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-sm text-fg">{manifest?.name ?? install.skillId}</p>
              <Badge variant="success">installed</Badge>
            </div>
            <p className="mt-1 font-mono text-xs text-fg-faint">{install.skillId}</p>
            <p className="mt-2 text-xs text-fg-muted">{manifest?.description ?? 'Installed skill metadata is not in the current catalog.'}</p>
            <p className="mt-3 text-xs text-fg-faint">Installed {fmtDate(install.installedAt)}</p>
          </div>
        );
      })}
    </div>
  );
}

function PolicyTab({ agent, installedSkills }: { agent: Agent; installedSkills: InstalledSkill[] }) {
  const policy = agent.deployment?.policy;
  return (
    <div className="space-y-3">
      <Info label="Daily cap" value={policy?.dailyCapWei ?? 'Not indexed'} mono />
      <Info label="Max per tx" value={policy?.maxPerTxWei ?? 'Not indexed'} mono />
      <Info label="Allowed skills/actions" value={policy?.allowedSkills?.join(', ') || installedSkills.map((skill) => skill.skillId).join(', ') || 'Not available for pre-bootstrap deployment'} />
      <Info label="Owner/admin" value={short(agent.ownerAddress)} mono />
      <p className="text-xs text-fg-faint">Deployment policy record indexed locally; on-chain policy reader not connected yet.</p>
    </div>
  );
}

function SplitsTab() {
  return <Empty title="No revenue splits configured" body="This agent has no indexed split configuration yet. Owner, protocol, and provider shares will appear after split setup is added." />;
}

function SettingsTab({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const required = agent.identityTokenId ?? agent.id;
  const canConfirm = typed.trim() === required || typed.trim() === agent.name;

  async function hide() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/hide`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { title?: string; detail?: string };
        throw new Error(body.detail ?? body.title ?? 'Unable to hide agent');
      }
      router.push('/agents');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to hide agent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="font-medium text-fg">Operational status</p>
        <p className="mt-1 text-xs text-fg-muted">Current status: <span className="capitalize text-fg">{agent.status.replace('_', ' ')}</span></p>
        <p className="mt-1 text-xs text-fg-faint">Pause/resume is not wired to an on-chain control yet, so these actions are intentionally disabled.</p>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning/5 p-4">
        <p className="font-medium text-fg">Workspace visibility</p>
        <p className="mt-1 text-xs text-fg-muted">Hide rushed or test agents from your local workspace without touching chain state.</p>
        <p className="mt-1 text-xs text-fg-faint">This does not delete the on-chain agent or receipts. It only hides this agent from your Apogee workspace.</p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="mt-3 rounded-[var(--radius)] border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10">Hide from my workspace</button>
        ) : (
          <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated p-3">
            <p className="text-xs text-fg-muted">Type <span className="font-mono text-fg">{required}</span> or <span className="font-mono text-fg">{agent.name}</span> to confirm.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-xs text-fg" />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={hide} disabled={!canConfirm || saving} className="rounded-[var(--radius)] bg-warning px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">{saving ? 'Hiding…' : 'Confirm hide'}</button>
              <button onClick={() => { setConfirming(false); setTyped(''); setError(null); }} disabled={saving} className="rounded-[var(--radius)] border border-[var(--color-line)] px-3 py-1.5 text-xs text-fg-muted">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3 transition-[border-color] duration-[150ms] hover:border-[var(--color-line-accent)]">
      <p className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 text-sm text-fg ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-line)] bg-surface px-8 py-14 text-center">
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}

function short(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Pending index';
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtWei(wei: string): string {
  return `${(Number(BigInt(wei)) / 1e18).toFixed(6)} 0G`;
}
