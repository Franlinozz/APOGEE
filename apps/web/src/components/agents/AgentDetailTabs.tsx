'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Agent, MemoryEntry, Receipt, Run, SkillManifest } from '@/lib/types';
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
  const latestReceipt = receipts[0];
  const latestRun = runs[0];
  const totalVolume = receipts.reduce((sum, receipt) => sum + BigInt(receipt.amountWei), 0n);
  const runtimeAttached = agent.status === 'active' || receipts.length > 0 || runs.some((run) => run.status === 'success' || run.status === 'succeeded');

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Agent ID" value={agent.id} mono />
        <Info label="Owner" value={short(agent.ownerAddress)} mono />
        <Info label="Agent account" value={agent.accountAddress ? short(agent.accountAddress) : 'Not indexed yet'} mono />
        <Info label="Status" value={agent.status.replace('_', ' ')} />
        <Info label="Created" value={fmtDate(agent.createdAt)} />
        <Info label="Runtime" value={runtimeAttached ? 'Attached / has activity' : 'Waiting for first runtime run'} />
        <Info label="Installed skills" value={String(installedSkills.length)} />
        <Info label="Receipts" value={String(receipts.length)} />
        <Info label="Total volume" value={fmtWei(totalVolume.toString())} />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="text-sm font-medium text-fg">Latest activity</p>
        {latestReceipt ? (
          <p className="mt-2 text-xs text-fg-muted">
            Latest receipt <code className="font-mono text-fg">{short(latestReceipt.id)}</code> for {latestReceipt.skillId ?? 'agent action'} at {fmtDate(latestReceipt.createdAt)}.
            {latestReceipt.txHash && <a className="ml-2 text-accent hover:underline" href={`https://chainscan.0g.ai/tx/${latestReceipt.txHash}`} target="_blank" rel="noreferrer">tx ↗</a>}
          </p>
        ) : latestRun ? (
          <p className="mt-2 text-xs text-fg-muted">Latest run: {latestRun.status} at {fmtDate(latestRun.createdAt)}.</p>
        ) : (
          <p className="mt-2 text-xs text-fg-muted">No scheduled task has executed for this agent yet. It is indexed on-chain, but runtime activity will appear after the first attached job runs.</p>
        )}
      </div>

      {memoryEntries.length === 0 && (
        <p className="text-xs text-fg-faint">Memory is created by real memory.write/search actions. Empty memory is expected until those skills run.</p>
      )}
    </div>
  );
}

function ActivityTab({ receipts, runs }: { receipts: Receipt[]; runs: Run[] }) {
  const events = [
    ...receipts.map((receipt) => ({ id: receipt.id, type: 'receipt', label: receipt.skillId ?? 'receipt.minted', status: receipt.status, time: receipt.createdAt, txHash: receipt.txHash })),
    ...runs.map((run) => ({ id: run.id, type: 'run', label: run.steps[0]?.type ?? 'agent.run', status: run.status, time: run.createdAt, txHash: undefined })),
  ].sort((a, b) => b.time.localeCompare(a.time));

  if (events.length === 0) return <Empty title="No runs yet" body="This agent has not executed a scheduled task. Once runtime attaches a job, run steps and receipts will show here." />;

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={`${event.type}:${event.id}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3 text-sm">
          <div>
            <p className="font-medium text-fg">{event.label}</p>
            <p className="font-mono text-xs text-fg-faint">{short(event.id)}</p>
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
              <p className="font-mono text-xs text-fg">{entry.key}</p>
              <p className="mt-1 text-xs text-fg-muted">Updated {fmtDate(entry.updatedAt)}</p>
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
  return (
    <div className="space-y-3">
      <Info label="Policy record" value={agent.policyId ?? 'Not connected yet'} mono />
      <Info label="Allowed skills/actions" value={installedSkills.map((skill) => skill.skillId).join(', ') || 'Not indexed'} />
      <Info label="Owner/admin" value={short(agent.ownerAddress)} mono />
      <p className="text-xs text-fg-faint">Daily cap, max per tx, and spend-today will show here once policy persistence is connected to the deployment record.</p>
    </div>
  );
}

function SplitsTab() {
  return <Empty title="No revenue splits configured" body="This agent has no indexed split configuration yet. Owner, protocol, and provider shares will appear after split setup is added." />;
}

function SettingsTab({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="font-medium text-fg">Operational status</p>
        <p className="mt-1 text-xs text-fg-muted">Current status: <span className="capitalize text-fg">{agent.status.replace('_', ' ')}</span></p>
        <p className="mt-1 text-xs text-fg-faint">Pause/resume is not wired to an on-chain control yet, so these actions are intentionally disabled.</p>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger/5 p-4">
        <p className="font-medium text-fg">Danger zone</p>
        <p className="mt-1 text-xs text-fg-muted">On-chain deletion is not available. Local index removal is disabled until a safe backend action exists.</p>
        <div className="mt-3 flex gap-2">
          <button disabled className="rounded-[var(--radius)] border border-warning/40 px-3 py-1.5 text-xs text-warning opacity-50">Pause agent</button>
          <button disabled className="rounded-[var(--radius)] border border-danger/40 px-3 py-1.5 text-xs text-danger opacity-50">Delete local index</button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 text-sm text-fg ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-fg-muted">{body}</p>
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
