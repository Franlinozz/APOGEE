import { Suspense } from 'react';
import { Topbar } from '@/components/shell/Topbar';
import { serverGetAgents } from '@/lib/server-api';
import type { Agent } from '@/lib/types';
import { AgentsTable } from '@/components/agents/AgentsTable';
import { Skeleton } from '@apogee/ui';

export const metadata = { title: 'Agents' };
export const revalidate = 30;

async function AgentsList() {
  let agents: Agent[] = [];
  try {
    agents = await serverGetAgents();
  } catch {}
  return <AgentsTable agents={agents} />;
}

export default function AgentsPage() {
  return (
    <>
      <Topbar title="Agents" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<Skeleton className="h-64 rounded-[var(--radius-xl)]" />}>
            <AgentsList />
          </Suspense>
        </div>
      </main>
    </>
  );
}
