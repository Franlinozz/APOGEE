'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MemoryEntry } from '@/lib/types';
import { searchMemory, anchorMemoryEntry } from '@/lib/api';
import { ChevronRight, ChevronDown, Search, Anchor } from 'lucide-react';

function buildTree(entries: MemoryEntry[]): Record<string, MemoryEntry[]> {
  const tree: Record<string, MemoryEntry[]> = {};
  for (const entry of entries) {
    const parts = entry.key.split('/');
    const prefix = parts.length > 1 ? parts[0]! : '_root';
    if (!tree[prefix]) tree[prefix] = [];
    tree[prefix]!.push(entry);
  }
  return tree;
}

interface Props {
  agentId: string;
  initialEntries: MemoryEntry[];
}

export function MemoryExplorer({ agentId, initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [anchoring, setAnchoring] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setEntries(initialEntries);
      return;
    }
    setSearching(true);
    searchMemory(agentId, debouncedQuery)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setSearching(false));
  }, [debouncedQuery, agentId, initialEntries]);

  async function anchor(entry: MemoryEntry) {
    setAnchoring(entry.id);
    try {
      const { txHash } = await anchorMemoryEntry(agentId, entry.id);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, anchoredTxHash: txHash } : e)),
      );
      if (selected?.id === entry.id) {
        setSelected((prev) => prev ? { ...prev, anchoredTxHash: txHash } : prev);
      }
    } catch {}
    setAnchoring(null);
  }

  const tree = buildTree(entries);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left: tree */}
      <div className="w-64 shrink-0 overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface">
        <div className="sticky top-0 border-b border-[var(--color-line)] bg-surface p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-fg-faint" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memory…"
              className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated pl-8 pr-3 py-2 text-xs text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          {searching && <p className="mt-1 text-[10px] text-fg-faint">Searching…</p>}
        </div>

        <div className="p-2">
          {Object.entries(tree).map(([prefix, items]) => (
            <TreeSection
              key={prefix}
              prefix={prefix}
              items={items}
              expanded={expanded}
              setExpanded={setExpanded}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
          {entries.length === 0 && (
            <p className="p-3 text-xs text-fg-faint">No entries found.</p>
          )}
        </div>
      </div>

      {/* Right: entry viewer */}
      <div className="flex-1 overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface">
        {selected ? (
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-medium text-fg">{selected.key}</p>
                <p className="mt-0.5 text-xs text-fg-faint">v{selected.version} · {new Date(selected.updatedAt).toLocaleString()}</p>
              </div>
              {!selected.anchoredTxHash && (
                <button
                  onClick={() => anchor(selected)}
                  disabled={anchoring === selected.id}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  <Anchor className="h-3.5 w-3.5" />
                  {anchoring === selected.id ? 'Anchoring…' : 'Anchor on-chain'}
                </button>
              )}
              {selected.anchoredTxHash && (
                <a
                  href={`https://chainscan.0g.ai/tx/${selected.anchoredTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-success hover:underline"
                >
                  <Anchor className="h-3.5 w-3.5" />
                  Anchored ↗
                </a>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-fg-muted">Value</p>
              <pre className="overflow-auto rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated p-4 font-mono text-xs text-fg">
                {JSON.stringify(selected.value, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-fg-muted">Select an entry to view it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeSection({
  prefix,
  items,
  expanded,
  setExpanded,
  selected,
  onSelect,
}: {
  prefix: string;
  items: MemoryEntry[];
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  selected: MemoryEntry | null;
  onSelect: (e: MemoryEntry) => void;
}) {
  const isExpanded = expanded.has(prefix);

  function toggle() {
    const next = new Set(expanded);
    if (isExpanded) next.delete(prefix);
    else next.add(prefix);
    setExpanded(next);
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-medium">{prefix === '_root' ? 'root' : prefix}</span>
        <span className="ml-auto text-fg-faint">{items.length}</span>
      </button>
      {isExpanded && (
        <div className="ml-4 space-y-px">
          {items.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className={[
                'flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors',
                selected?.id === entry.id ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg hover:bg-elevated',
              ].join(' ')}
            >
              <span className="truncate font-mono">{entry.key}</span>
              {entry.anchoredTxHash && (
                <Anchor className="ml-auto h-2.5 w-2.5 shrink-0 text-success" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
