import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/shell/Topbar';
import { serverGetAgent } from '@/lib/server-api';
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
  paused: 'neutral',
  deploying: 'warning',
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
            {agent.status}
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

          <AgentDetailTabs agentId={params.id} />
        </div>
      </main>
    </>
  );
}
