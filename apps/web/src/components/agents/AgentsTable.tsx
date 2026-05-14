'use client';

import { useState, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import Link from 'next/link';
import type { Agent } from '@/lib/types';
import { AgentAvatar, Badge } from '@apogee/ui';
import { ArrowUpDown } from 'lucide-react';

const BADGE_VARIANT: Record<Agent['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending_deploy: 'warning',
  deployed: 'neutral',
  activating: 'warning',
  initialized: 'success',
  ready: 'success',
  active: 'success',
  paused: 'neutral',
  failed: 'danger',
  deploying: 'warning',
  error: 'danger',
};

const col = createColumnHelper<Agent>();

function formatCreatedAt(value: unknown): string {
  if (value == null || value === '') return 'Pending index';
  let date: Date;
  if (typeof value === 'bigint') {
    const n = Number(value);
    date = new Date(n < 10_000_000_000 ? n * 1000 : n);
  } else if (typeof value === 'number') {
    date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    date = new Date(n < 10_000_000_000 ? n * 1000 : n);
  } else {
    date = new Date(String(value));
  }
  if (Number.isNaN(date.getTime())) return 'Pending index';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const COLUMNS = [
  col.accessor('id', {
    header: 'Agent',
    cell: (info) => {
      const agent = info.row.original;
      return (
        <div className="flex items-center gap-3">
          <AgentAvatar agentId={agent.id} size="sm" />
          <div>
            <Link
              href={`/agents/${agent.id}`}
              className="text-sm font-medium text-fg hover:text-accent"
            >
              {agent.name}
            </Link>
            <p className="font-mono text-xs text-fg-faint">{agent.id.slice(0, 8)}…</p>
          </div>
        </div>
      );
    },
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <Badge variant={BADGE_VARIANT[info.getValue()]} className="capitalize">
        {info.getValue()}
      </Badge>
    ),
  }),
  col.accessor('accountAddress', {
    header: 'Account',
    cell: (info) => {
      const addr = info.getValue();
      return addr ? (
        <span className="font-mono text-xs text-fg-muted">
          {addr.slice(0, 6)}…{addr.slice(-4)}
        </span>
      ) : (
        <span className="text-xs text-fg-faint">—</span>
      );
    },
  }),
  col.accessor('createdAt', {
    header: 'Created',
    cell: (info) => formatCreatedAt(info.getValue()),
  }),
];

export function AgentsTable({ agents }: { agents: Agent[] }) {
  const [allAgents, setAllAgents] = useState(agents);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  const visibleAgents = useMemo(() => allAgents.filter((agent) => !agent.hidden), [allAgents]);
  const hiddenAgents = useMemo(() => allAgents.filter((agent) => agent.hidden), [allAgents]);

  async function restore(agent: Agent) {
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/unhide`, { method: 'POST' });
    if (res.ok) setAllAgents((prev) => prev.map((entry) => entry.id === agent.id ? { ...entry, hidden: false } : entry));
  }

  const table = useReactTable({
    data: visibleAgents,
    columns: COLUMNS,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const useVirtual = rows.length > 100;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    enabled: useVirtual,
  });

  if (visibleAgents.length === 0 && hiddenAgents.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-16 text-center">
        <p className="text-sm text-fg-muted">No agents yet.</p>
        <Link
          href="/agents/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Create your first agent
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search agents…"
        className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
      />

      {/* Table */}
      {visibleAgents.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-12 text-center">
          <p className="text-sm text-fg-muted">No visible agents. Restore a hidden agent below or create a new one.</p>
        </div>
      ) : (
      <div
        ref={useVirtual ? parentRef : undefined}
        className="overflow-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface"
        style={useVirtual ? { height: '560px' } : undefined}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--color-line)]">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-5 py-3 text-left text-xs font-medium text-fg-muted"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : undefined }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="h-3 w-3 text-fg-faint" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {useVirtual ? (
              <>
                <tr style={{ height: `${virtualizer.getVirtualItems()[0]?.start ?? 0}px` }} />
                {virtualizer.getVirtualItems().map((vRow) => {
                  const row = rows[vRow.index]!;
                  return (
                    <tr key={row.id} className="hover-row border-b border-[var(--color-line)] last:border-0">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr
                  style={{
                    height: `${virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0)}px`,
                  }}
                />
              </>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover-row border-b border-[var(--color-line)] last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-5 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      <p className="text-xs text-fg-faint">{rows.length} visible agent{rows.length !== 1 ? 's' : ''}</p>

      {hiddenAgents.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-fg">Hidden agents</p>
            <p className="text-xs text-fg-faint">Hidden only from your workspace UI. On-chain agents and global receipts remain unchanged.</p>
          </div>
          <div className="space-y-2">
            {hiddenAgents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2">
                <div>
                  <p className="text-sm text-fg">{agent.name}</p>
                  <p className="font-mono text-xs text-fg-faint">{agent.id}</p>
                </div>
                <button onClick={() => restore(agent)} className="rounded-[var(--radius)] border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10">Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
