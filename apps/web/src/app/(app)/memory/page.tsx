import { Topbar } from '@/components/shell/Topbar';
import { serverGetAgents } from '@/lib/server-api';
import type { Agent } from '@/lib/types';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata = { title: 'Memory' };

export default async function MemoryIndexPage() {
  let agents: Agent[] = [];
  try {
    agents = await serverGetAgents();
  } catch {}

  return (
    <>
      <Topbar title="Memory" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl animate-fade-up">
          {agents.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-16 text-center">
              <p className="text-sm text-fg-muted">No agents yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted mb-4">Select an agent to explore its memory.</p>
              {agents.map((agent, i) => (
                <Link
                  key={agent.id}
                  href={`/memory/${agent.id}`}
                  className="group flex items-center justify-between rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-5 py-4 transition-[border-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--color-line-accent)] hover:shadow-card hover:-translate-y-px animate-fade-up"
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <div>
                    <p className="text-sm font-medium text-fg">{agent.name}</p>
                    <p className="font-mono text-xs text-fg-faint mt-0.5">{agent.id.slice(0, 12)}…</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-fg-faint transition-[color,transform] duration-[200ms] group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
