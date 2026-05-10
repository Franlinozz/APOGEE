'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Run, SkillManifest } from '@/lib/types';

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

export function AgentDetailTabs({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div>
      {/* Tab bar */}
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

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'overview' && <OverviewTab agentId={agentId} />}
        {activeTab === 'activity' && <ActivityTab agentId={agentId} />}
        {activeTab === 'memory' && <MemoryTab agentId={agentId} />}
        {activeTab === 'skills' && <SkillsTab agentId={agentId} />}
        {activeTab === 'policy' && <PolicyTab agentId={agentId} />}
        {activeTab === 'splits' && <SplitsTab agentId={agentId} />}
        {activeTab === 'settings' && <SettingsTab agentId={agentId} />}
      </div>
    </div>
  );
}

function OverviewTab({ agentId }: { agentId: string }) {
  return (
    <div className="space-y-4 text-sm text-fg-muted">
      <p>Agent <code className="font-mono text-xs text-fg">{agentId}</code> overview will appear here once live data is connected.</p>
    </div>
  );
}

function ActivityTab({ agentId }: { agentId: string }) {
  return (
    <div className="text-sm text-fg-muted">
      <p>Run history for agent <code className="font-mono text-xs">{agentId}</code> will appear here.</p>
    </div>
  );
}

function MemoryTab({ agentId }: { agentId: string }) {
  return (
    <div className="text-sm text-fg-muted">
      <p>
        View and search this agent&apos;s memory in the{' '}
        <Link href={`/memory/${agentId}`} className="text-accent hover:underline">
          Memory explorer
        </Link>.
      </p>
    </div>
  );
}

function SkillsTab({ agentId }: { agentId: string }) {
  return (
    <div className="text-sm text-fg-muted">
      <p>Installed skills for agent <code className="font-mono text-xs">{agentId}</code>.</p>
    </div>
  );
}

function PolicyTab({ agentId }: { agentId: string }) {
  return (
    <div className="text-sm text-fg-muted">
      <p>
        Current policy for agent <code className="font-mono text-xs">{agentId}</code>.{' '}
        <Link href={`/policies/${agentId}`} className="text-accent hover:underline">
          Manage policy →
        </Link>
      </p>
    </div>
  );
}

function SplitsTab({ agentId }: { agentId: string }) {
  return (
    <div className="text-sm text-fg-muted">
      <p>Revenue splits configuration for agent <code className="font-mono text-xs">{agentId}</code>.</p>
    </div>
  );
}

function SettingsTab({ agentId }: { agentId: string }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger/5 p-4">
        <p className="font-medium text-fg">Danger zone</p>
        <p className="mt-1 text-xs text-fg-muted">Pause or delete this agent. Pausing stops all runs but preserves data.</p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-[var(--radius)] border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10">
            Pause agent
          </button>
          <button className="rounded-[var(--radius)] border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10">
            Delete agent
          </button>
        </div>
      </div>
    </div>
  );
}
