import { Topbar } from '@/components/shell/Topbar';
import { MemoryExplorer } from '@/components/memory/MemoryExplorer';
import { serverGetMemory } from '@/lib/server-api';
import type { MemoryEntry } from '@/lib/types';

export async function generateMetadata({ params }: { params: { agentId: string } }) {
  return { title: `Memory — ${params.agentId.slice(0, 8)}` };
}

export default async function MemoryPage({ params }: { params: { agentId: string } }) {
  let entries: MemoryEntry[] = [];
  try {
    entries = await serverGetMemory(params.agentId);
  } catch {}

  return (
    <>
      <Topbar title="Memory Explorer" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <MemoryExplorer agentId={params.agentId} initialEntries={entries} />
        </div>
      </main>
    </>
  );
}
