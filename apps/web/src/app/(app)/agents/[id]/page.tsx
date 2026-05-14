import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { serverGetAgent, serverGetAgentSkills, serverGetMemory, serverGetReceipts, serverGetRuns } from '@/lib/server-api';
import { getSkills } from '@/lib/api';
import { AgentDetailTabs } from '@/components/agents/AgentDetailTabs';
import { AgentAvatar, Badge, Skeleton } from '@apogee/ui';

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const agent = await serverGetAgent(params.id);
    return { title: agent?.name ?? 'Agent' };
  } catch {
    return { title: 'Agent' };
  }
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  activating: 'warning',
  deployed: 'neutral',
  pending_deploy: 'warning',
  paused: 'neutral',
  deploying: 'warning',
  failed: 'danger',
  error: 'danger',
};

async function AgentHeader({ id }: { id: string }) {
  const agent = await serverGetAgent(id).catch(() => notFound());

  return (
    <div className="flex items-center gap-4 px-6 py-5 border-b border-[var(--color-line)]">
      <AgentAvatar agentId={agent.id} size="lg" />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-fg">{agent.name}</h1>
          <Badge variant={STATUS_VARIANT[agent.status] ?? 'neutral'} className="capitalize">
            {agent.status.replace('_', ' ')}
          </Badge>
        </div>
        <p className="font-mono text-xs text-fg-muted mt-0.5">{agent.id}</p>
        {agent.description && (
          <p className="mt-1 text-sm text-fg-muted">{agent.description}</p>
        )}
      </div>
    </div>
  );
}

async function AgentBody({ id }: { id: string }) {
  const agent = await serverGetAgent(id).catch(() => notFound());
  const [receiptsResult, runs, memoryEntries, installedSkills, skillCatalog] = await Promise.all([
    serverGetReceipts({ agentId: id, limit: 25, scope: 'global' }).catch(() => ({ items: [], total: 0 })),
    serverGetRuns(id).catch(() => []),
    serverGetMemory(id).catch(() => []),
    serverGetAgentSkills(id).catch(() => []),
    getSkills().catch(() => []),
  ]);

  return (
    <AgentDetailTabs
      agent={agent}
      receipts={receiptsResult.items}
      runs={runs}
      memoryEntries={memoryEntries}
      installedSkills={installedSkills}
      skillCatalog={skillCatalog}
    />
  );
}

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Topbar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          <Suspense fallback={
            <div className="flex items-center gap-4 px-6 py-5 border-b border-[var(--color-line)]">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-8 w-48" />
            </div>
          }>
            <AgentHeader id={params.id} />
          </Suspense>

          <Suspense fallback={<div className="p-6"><Skeleton className="h-64 rounded-[var(--radius-xl)]" /></div>}>
            <AgentBody id={params.id} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
