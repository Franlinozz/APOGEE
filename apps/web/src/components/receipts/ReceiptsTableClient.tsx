'use client';

import { useState, useRef, useCallback } from 'react';
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
import type { Receipt } from '@/lib/types';
import { buildChainscanUrl } from '@/lib/chainscan';
import { Badge } from '@apogee/ui';
import { Download, ArrowUpDown } from 'lucide-react';

const BADGE_VARIANT: Record<Receipt['status'], 'success' | 'warning' | 'danger'> = {
  confirmed: 'success',
  pending: 'warning',
  failed: 'danger',
};

function fmtWei(wei: string): string {
  return `${(Number(BigInt(wei)) / 1e18).toFixed(6)} 0G`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

const col = createColumnHelper<Receipt>();

const COLUMNS = [
  col.accessor('id', {
    header: 'Receipt ID',
    cell: (i) => <span className="font-mono text-xs text-fg-muted">{i.getValue().slice(0, 10)}…</span>,
  }),
  col.accessor('agentId', {
    header: 'Agent',
    cell: (i) => <span className="font-mono text-xs">{i.getValue().slice(0, 8)}…</span>,
  }),
  col.accessor('amountWei', {
    header: 'Amount',
    cell: (i) => <span className="font-mono text-xs text-fg">{fmtWei(i.getValue())}</span>,
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (i) => (
      <Badge variant={BADGE_VARIANT[i.getValue()]} className="capitalize">
        {i.getValue()}
      </Badge>
    ),
  }),
  col.accessor('txHash', {
    header: 'Tx',
    cell: (i) => {
      const hash = i.getValue();
      const href = buildChainscanUrl({ txHash: hash, chainId: 16661 });
      return href && hash ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-accent hover:underline"
        >
          {hash.slice(0, 8)}…
        </a>
      ) : (
        <span className="text-xs text-fg-faint">—</span>
      );
    },
  }),
  col.accessor('createdAt', {
    header: 'Time',
    cell: (i) => <span className="text-xs text-fg-muted">{fmtDate(i.getValue())}</span>,
  }),
];

interface Props {
  initialReceipts: Receipt[];
  totalCount: number;
}

export function ReceiptsTableClient({ initialReceipts, totalCount }: Props) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data: initialReceipts,
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
    estimateSize: () => 48,
    enabled: useVirtual,
  });

  function exportCsv() {
    const header = ['id', 'agentId', 'payerAddress', 'payeeAddress', 'amountWei', 'status', 'txHash', 'createdAt'];
    const csvRows = [
      header.join(','),
      ...rows.map((r) =>
        header
          .map((k) => JSON.stringify(String(r.original[k as keyof Receipt] ?? '')))
          .join(','),
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (initialReceipts.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-16 text-center">
        <p className="text-sm text-fg-muted">No receipts yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter receipts…"
          className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-line)] px-3 py-2 text-xs text-fg-muted hover:text-fg"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

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
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-5 py-3 text-left text-xs font-medium text-fg-muted"
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

      <p className="text-xs text-fg-faint">
        {rows.length} of {totalCount} receipts
      </p>
    </div>
  );
}
