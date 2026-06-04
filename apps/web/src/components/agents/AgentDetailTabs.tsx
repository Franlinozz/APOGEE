'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import type { Agent, MemoryEntry, Receipt, Run, SkillManifest } from '@/lib/types';
import { buildChainscanUrl } from '@/lib/chainscan';
import { normalizeSkillOutput } from '@/lib/skill-output';
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

function runtimeLabel(agent: Agent, receipts: Receipt[], runs: Run[]): string {
  const latestRun = runs.find((run) => run.status === 'success' || run.status === 'succeeded' || run.status === 'running');
  if (latestRun && agent.status === 'active') return `Active — last runtime run ${fmtDate(latestRun.createdAt)}`;
  if (agent.status === 'failed' || agent.status === 'error') return `Failed — ${agent.deployment?.error ?? 'bootstrap or runtime failed'}`;
  if (agent.status === 'activating') return 'Activating — bootstrap pending';
  if (agent.status === 'initialized' || agent.status === 'ready' || receipts.some((r) => r.skillId === 'agent.created')) return 'Bootstrapped — no recurring runtime delegated yet';
  return 'Indexed — awaiting bootstrap';
}

function latestEvent(receipts: Receipt[], runs: Run[]): string {
  const rows = [
    ...receipts.map((receipt) => ({ label: receipt.skillId ?? 'receipt.minted', time: receipt.createdAt })),
    ...runs.map((run) => ({ label: `run.${run.status}`, time: run.createdAt })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  return rows[0] ? `${rows[0].label} · ${fmtDate(rows[0].time)}` : 'No lifecycle events indexed';
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
        {activeTab === 'skills' && <SkillsTab agent={agent} installedSkills={installedSkills} skillCatalog={skillCatalog} />}
        {activeTab === 'policy' && <PolicyTab agent={agent} installedSkills={installedSkills} />}
        {activeTab === 'splits' && <SplitsTab />}
        {activeTab === 'settings' && <SettingsTab agent={agent} />}
      </div>
    </div>
  );
}

function OverviewTab({ agent, receipts, runs, memoryEntries, installedSkills }: Pick<Props, 'agent' | 'receipts' | 'runs' | 'memoryEntries' | 'installedSkills'>) {
  const totalVolume = receipts.reduce((sum, receipt) => sum + BigInt(receipt.amountWei), 0n);
  const tokenId = agent.identityTokenId ?? agent.deployment?.tokenId ?? agent.id;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Token ID" value={tokenId} mono />
        <Info label="Owner" value={short(agent.ownerAddress)} mono />
        <Info label="Agent account" value={agent.accountAddress ? short(agent.accountAddress) : 'Not indexed yet'} mono />
        <Info label="Status" value={agent.status.replace('_', ' ')} />
        <Info label="Created" value={fmtDate(agent.deployment?.createdAt ?? agent.createdAt)} />
        <Info label="Runtime" value={runtimeLabel(agent, receipts, runs)} />
        <Info label="Selected skills" value={String(agent.deployment?.selectedSkillIds?.length ?? installedSkills.length)} />
        <Info label="Receipts" value={String(receipts.length)} />
        <Info label="Memory entries" value={String(memoryEntries.length)} />
        <Info label="Latest event" value={latestEvent(receipts, runs)} />
        <Info label="Total volume" value={fmtWei(totalVolume.toString())} />
      </div>

      <AuthorizationProofTile agent={agent} />

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="text-sm font-medium text-fg">Lifecycle honesty</p>
        <p className="mt-2 text-xs text-fg-muted">
          Deployment/bootstrap receipts are real lifecycle records. They do not mean this agent has an autonomous recurring runtime loop yet.
          User-created agents become <span className="text-fg">runtime active</span> only after a real scheduled task, session key, or heartbeat exists.
        </p>
      </div>
    </div>
  );
}

function AuthorizationProofTile({ agent }: { agent: Agent }) {
  const proof = agent.authorizationProof ?? agent.deployment?.authorizationProof;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg">Authorization Proof</p>
        <Badge variant={proof ? 'success' : 'neutral'}>{proof ? 'EIP-712' : 'legacy'}</Badge>
      </div>
      {proof ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Info label="Signer" value={short(proof.signer ?? proof.owner)} mono />
          <Info label="Signed" value={fmtDate(proof.createdAt)} />
          <Info label="Digest" value={short(proof.digest)} mono />
          <Info label="Nonce" value={short(proof.nonce)} mono />
          <Info label="Deadline" value={fmtDate(new Date(proof.deadline * 1000).toISOString())} />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(proof.digest).catch(() => undefined)}
            className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-3 text-left text-xs text-accent hover:border-[var(--color-line-accent)]"
          >
            Copy digest
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg-muted">Legacy deployment — no wallet authorization signature recorded.</p>
      )}
    </div>
  );
}

function activityBadge(status: string, txHash: string | undefined): { variant: 'success' | 'danger' | 'warning' | 'neutral'; label: string } {
  if (status === 'confirmed' || status === 'success' || status === 'succeeded' || status === 'minted') return { variant: 'success', label: status };
  if (status === 'failed' || status === 'error') {
    // No txHash means the TX was never submitted (e.g. pre-fix chain client error).
    // The action still happened — show as a warning rather than a hard failure.
    if (!txHash) return { variant: 'warning', label: 'not anchored' };
    return { variant: 'danger', label: 'reverted' };
  }
  return { variant: 'warning', label: status };
}

function ActivityTab({ receipts, runs }: { receipts: Receipt[]; runs: Run[] }) {
  const events = [
    ...receipts.map((receipt) => ({ id: receipt.id, type: 'receipt', label: receipt.skillId ?? 'receipt.minted', status: receipt.status, time: receipt.createdAt, txHash: receipt.txHash, storageRoot: receipt.storageRoot })),
    ...runs.map((run) => ({ id: run.id, type: 'run', label: run.steps[0]?.type ?? 'agent.run', status: run.status, time: run.createdAt, txHash: undefined, storageRoot: undefined })),
  ].sort((a, b) => b.time.localeCompare(a.time));

  if (events.length === 0) return <Empty title="No lifecycle events indexed yet" body="No deployment, bootstrap, memory, heartbeat, or runtime receipts are indexed for this agent yet." />;

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const badge = activityBadge(event.status, event.txHash);
        return (
          <div key={`${event.type}:${event.id}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3 text-sm transition-[background-color] duration-100 hover:bg-accent/[0.04]">
            <div>
              <p className="font-medium text-fg">{event.label}</p>
              <p className="font-mono text-xs text-fg-faint">
                {short(event.id)}
                {buildChainscanUrl({ txHash: event.txHash, chainId: 16661 }) && (
                  <a className="ml-2 text-accent hover:underline" href={buildChainscanUrl({ txHash: event.txHash, chainId: 16661 })!} target="_blank" rel="noreferrer">tx ↗</a>
                )}
                {event.storageRoot && /^0x[a-fA-F0-9]{64}$/.test(event.storageRoot) && <span className="ml-2 text-fg-faint">storage {short(event.storageRoot)}</span>}
              </p>
            </div>
            <div className="text-right">
              <Badge variant={badge.variant} className="capitalize">{badge.label}</Badge>
              <p className="mt-1 text-xs text-fg-muted">{fmtDate(event.time)}</p>
            </div>
          </div>
        );
      })}
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
              <div className="flex items-center justify-between gap-3"><p className="font-mono text-xs text-fg">{entry.key}</p>{(entry.visibility === 'system' || entry.visibility === 'bootstrap' || entry.tags?.includes('bootstrap')) && <Badge variant="neutral">System bootstrap memory</Badge>}</div>
              <p className="mt-1 text-xs text-fg-muted">Updated {fmtDate(entry.updatedAt)} · not labeled private/encrypted unless written by a private memory skill</p>
            </div>
          ))}
        </div>
      )}
      <Link href={`/memory/${agentId}`} className="text-sm text-accent hover:underline">Open full memory explorer →</Link>
    </div>
  );
}


type SkillRunResult = {
  skillId: string;
  output?: unknown;
  latencyMs?: number;
  runId?: string;
  receipt?: { receiptId?: string; txHash?: string; status?: 'pending' | 'minted' | 'failed'; error?: string };
};

type SkillRunFallback = 'mint-pending' | 'maybe-running';

type SkillFormState = {
  text: string;
  maxWords: number;
  targetLanguage: string;
  code: string;
  language: string;
  prompt: string;
};

const INVOKABLE_SKILLS = new Set<string>(['chat.completion', 'text.summarize', 'text.title', 'text.translate', 'text.rewrite', 'text.sentiment', 'text.entities', 'text.keywords', 'code.review']);
const DEFAULT_FORM: SkillFormState = { text: '', maxWords: 80, targetLanguage: '', code: '', language: '', prompt: '' };

function sameAddr(a?: string, b?: string): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function buildSkillPayload(skillId: string, form: SkillFormState, agentId: string): Record<string, unknown> {
  if (skillId === 'chat.completion') return { agentId, messages: [{ role: 'user', content: form.prompt.trim() }] };
  if (skillId === 'text.summarize') return { agentId, text: form.text.trim(), maxWords: form.maxWords };
  if (skillId === 'text.title') return { agentId, text: form.text.trim() };
  if (skillId === 'text.translate') return { agentId, text: form.text.trim(), targetLanguage: form.targetLanguage.trim() };
  if (skillId === 'text.rewrite') return { agentId, text: form.text.trim() };
  if (skillId === 'text.sentiment' || skillId === 'text.entities' || skillId === 'text.keywords') return { agentId, text: form.text.trim() };
  if (skillId === 'code.review') return { agentId, code: form.code.trim(), language: form.language.trim() || undefined };
  return { agentId };
}

function validateSkillForm(skillId: string, form: SkillFormState): string | null {
  if (skillId === 'chat.completion') return form.prompt.trim() ? null : 'Prompt is required.';
  if (skillId === 'text.translate') {
    if (!form.text.trim()) return 'Text is required.';
    if (!form.targetLanguage.trim()) return 'Target language is required.';
    return null;
  }
  if (skillId === 'code.review') return form.code.trim() ? null : 'Code is required.';
  if (skillId === 'text.summarize' || skillId === 'text.title' || skillId === 'text.rewrite' || skillId === 'text.sentiment' || skillId === 'text.entities' || skillId === 'text.keywords') return form.text.trim() ? null : 'Text is required.';
  return 'This skill is not runnable from the UI yet.';
}

function SkillInputFields({ skillId, form, setForm }: { skillId: string; form: SkillFormState; setForm: (patch: Partial<SkillFormState>) => void }) {
  const textAreaClass = 'mt-1 min-h-36 w-full rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-[var(--color-line-accent)]';
  if (skillId === 'chat.completion') {
    return <Field label="Prompt" count={`${form.prompt.length}/5000`}><textarea className={textAreaClass} maxLength={5000} value={form.prompt} onChange={(e) => setForm({ prompt: e.target.value })} placeholder="Ask this agent to run its chat skill…" /></Field>;
  }
  if (skillId === 'code.review') {
    return (
      <>
        <Field label="Code" count={`${form.code.length}/15000`}><textarea className={`${textAreaClass} font-mono`} maxLength={15000} value={form.code} onChange={(e) => setForm({ code: e.target.value })} placeholder="Paste code to review…" /></Field>
        <Field label="Language (optional)"><input className="mt-1 w-full rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-[var(--color-line-accent)]" value={form.language} onChange={(e) => setForm({ language: e.target.value })} placeholder="javascript, python, rust…" /></Field>
      </>
    );
  }
  return (
    <>
      <Field label="Text" count={`${form.text.length}/10000`}><textarea className={textAreaClass} maxLength={10000} value={form.text} onChange={(e) => setForm({ text: e.target.value })} placeholder="Paste text here…" /></Field>
      {skillId === 'text.summarize' && <Field label="Max words"><input type="number" min={10} max={500} className="mt-1 w-full rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-[var(--color-line-accent)]" value={form.maxWords} onChange={(e) => setForm({ maxWords: Number(e.target.value) })} /></Field>}
      {skillId === 'text.translate' && <Field label="Target language"><input className="mt-1 w-full rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-[var(--color-line-accent)]" value={form.targetLanguage} onChange={(e) => setForm({ targetLanguage: e.target.value })} placeholder="Spanish, French, Japanese…" /></Field>}
    </>
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="flex justify-between gap-3 text-fg-muted"><span>{label}</span>{count && <span className="text-xs text-fg-faint">{count}</span>}</span>{children}</label>;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatErrorBody(data: unknown, fallbackText: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    return [record['detail'], record['title'], record['message']].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' — ');
  }
  return fallbackText.trim();
}

function SkillOutput({ skillId, output }: { skillId: string; output: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const normalized = normalizeSkillOutput(skillId, output);

  if (normalized.kind === 'text') {
    return <div className={`whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-3 text-sm text-fg ${normalized.mono ? 'font-mono' : ''}`}>{normalized.text}</div>;
  }

  if (normalized.kind === 'sentiment') {
    const variant = normalized.sentiment === 'positive' ? 'success' : normalized.sentiment === 'negative' ? 'danger' : 'neutral';
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-3 text-sm">
        <span className="text-fg-muted">Sentiment</span>
        <Badge variant={variant}>{normalized.sentiment.toUpperCase()}</Badge>
        <span className="text-fg-muted">Score <span className="font-mono text-fg">{normalized.score.toFixed(2)}</span></span>
      </div>
    );
  }

  if (normalized.kind === 'entities') {
    if (normalized.entities.length === 0) return <p className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-3 text-sm text-fg-muted">No entities found.</p>;
    return (
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-3">
        {normalized.entities.map((entity, index) => (
          <div key={`${entity.type}-${entity.value}-${index}`} className="flex items-center gap-2 text-sm text-fg">
            <Badge variant="neutral" className="font-mono text-[10px]">{entity.type}</Badge>
            <span>{entity.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
      <p>Unexpected response format</p>
      <button type="button" onClick={() => setShowRaw((current) => !current)} className="mt-2 text-xs underline">{showRaw ? 'Hide raw' : 'Show raw'}</button>
      {showRaw && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-warning/20 bg-black/10 p-2 font-mono text-xs text-fg">{normalized.raw}</pre>}
    </div>
  );
}

function SkillRunModal({ agent, skill, onClose, onDone }: { agent: Agent; skill: SkillManifest; onClose: () => void; onDone: () => void }) {
  const [form, setFormState] = useState<SkillFormState>(DEFAULT_FORM);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<SkillRunFallback | null>(null);
  const [result, setResult] = useState<SkillRunResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const setForm = (patch: Partial<SkillFormState>) => setFormState((current) => ({ ...current, ...patch }));

  async function submit() {
    const validation = validateSkillForm(skill.id, form);
    if (validation) { setError(validation); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setRunning(true);
    setError(null);
    setFallback(null);
    setResult(null);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.id)}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSkillPayload(skill.id, form, agent.id)),
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? safeJsonParse(text) : {};
      if (!res.ok) {
        const bodyMessage = formatErrorBody(data, text);
        if (res.status === 502 || res.status === 504) {
          setFallback('mint-pending');
          setError(null);
          return;
        }
        if (res.status >= 400 && res.status < 500) throw new Error(`${res.status}: ${bodyMessage || res.statusText}`);
        setFallback('maybe-running');
        setError(null);
        return;
      }
      setResult(data as SkillRunResult);
      onDone();
    } catch (err) {
      if (cancelledRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        setError('Skill run cancelled.');
      } else {
        setFallback('mint-pending');
        setError(null);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  function cancelRun() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-3 py-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-lg font-semibold text-fg">Run {skill.name}</p><p className="mt-1 font-mono text-xs text-fg-faint">{skill.id}</p></div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-sm text-fg-muted hover:text-fg">Close</button>
        </div>
        <div className="mt-5 space-y-4">
          <SkillInputFields skillId={skill.id} form={form} setForm={setForm} />
          {error && <div className="rounded-[var(--radius-lg)] border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
          {fallback === 'mint-pending' && <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success/10 p-3 text-sm text-success">Skill is running on-chain. The receipt will appear on /proofs within a minute or two once compute completes. <Link href="/proofs" target="_blank" className="underline">View /proofs ↗</Link></div>}
          {fallback === 'maybe-running' && <div className="rounded-[var(--radius-lg)] border border-warning/25 bg-warning/10 p-3 text-sm text-warning">Something went wrong. The skill may still be running — check /proofs to verify. If no receipt appears, try again. <Link href="/proofs" target="_blank" className="underline">View /proofs ↗</Link></div>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {running ? (
              <button onClick={cancelRun} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] px-4 py-2 text-sm text-fg-muted hover:text-fg">Cancel</button>
            ) : (
              <button onClick={onClose} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] px-4 py-2 text-sm text-fg-muted hover:text-fg">Close</button>
            )}
            <button onClick={() => void submit()} disabled={running} className="rounded-[var(--radius-lg)] bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{running ? 'Running…' : result || fallback ? 'Run again' : 'Run skill'}</button>
          </div>
          {result?.output !== undefined && <div className="space-y-2 pt-2"><p className="text-sm font-medium text-fg">Output</p><SkillOutput skillId={skill.id} output={result.output} /></div>}
          {result?.receipt && <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success/10 p-3 text-sm text-success">{result.receipt.status === 'minted' ? 'Receipt minted ✓ ' : result.receipt.status === 'failed' ? 'Skill ran, but receipt minting failed. ' : 'Receipt minting… '}<Link href="/proofs" target="_blank" className="underline">View on /proofs ↗</Link>{result.receipt.txHash && <span className="ml-2 font-mono text-xs">{short(result.receipt.txHash)}</span>}</div>}
          <p className="border-t border-[var(--color-line)] pt-3 text-xs text-fg-faint">Receipts mint on-chain. Output may render here a moment before or after the receipt is visible on /proofs.</p>
        </div>
      </div>
    </div>
  );
}

function SkillsTab({ agent, installedSkills, skillCatalog }: { agent: Agent; installedSkills: InstalledSkill[]; skillCatalog: SkillManifest[] }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [activeSkill, setActiveSkill] = useState<SkillManifest | null>(null);
  const selectedSkillIds = agent.deployment?.selectedSkillIds;
  const fallbackIds = useMemo(() => installedSkills.length === 0 ? (selectedSkillIds ?? []) : [], [installedSkills.length, selectedSkillIds]);
  const isOwner = sameAddr(address, agent.ownerAddress);
  const selectedIds = useMemo(() => selectedSkillIds ?? [], [selectedSkillIds]);
  const installedSkillIds = useMemo(() => new Set(installedSkills.map((skill) => skill.skillId)), [installedSkills]);
  const bootstrapComplete = selectedIds.length > 0 ? selectedIds.every((id) => installedSkillIds.has(id)) : installedSkills.length > 0;
  const canRunAfterBootstrap = agent.status === 'active' || ((agent.status === 'initialized' || agent.status === 'ready') && bootstrapComplete);
  const items: { skillId: string; installedAt: string; pending: boolean }[] = useMemo(() => (
    installedSkills.length > 0
      ? installedSkills.map((s) => ({ skillId: s.skillId, installedAt: s.installedAt, pending: false }))
      : fallbackIds.map((id) => ({ skillId: id, installedAt: agent.deployment?.createdAt ?? agent.createdAt, pending: true }))
  ), [agent.createdAt, agent.deployment?.createdAt, fallbackIds, installedSkills]);

  if (installedSkills.length === 0 && fallbackIds.length === 0) {
    return <Empty title="No selected skills indexed" body="Skill selections are stored during deployment. Existing older agents may show empty until reconfigured or indexed from a new deployment." />;
  }

  return (
    <div className="space-y-3">
      {fallbackIds.length > 0 && (
        <p className="text-xs text-fg-muted">Skills were selected at deployment. On-chain receipt not yet indexed — re-deploying or retrying onboarding will anchor them.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const manifest = skillCatalog.find((skill) => skill.id === item.skillId) ?? { id: item.skillId, name: item.skillId, version: '1.0.0', description: 'Selected skill metadata is not in the current catalog.', category: 'Skill', tier: 'free' as const, pricePerCallWei: '0', tags: [] };
          const runnable = INVOKABLE_SKILLS.has(item.skillId);
          const disabledReason = !runnable ? 'Not runnable yet' : !canRunAfterBootstrap ? 'Activation in progress' : !isConnected ? 'Connect wallet' : !isOwner ? 'Owner only' : null;
          return (
            <div key={item.skillId} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm text-fg">{manifest.name}</p>
                  <p className="mt-1 font-mono text-xs text-fg-faint">{item.skillId}</p>
                </div>
                <Badge variant={item.pending ? 'warning' : 'success'}>{item.pending ? 'selected' : 'selected'}</Badge>
              </div>
              <p className="mt-2 text-xs text-fg-muted">{manifest.description}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-fg-faint">Selected {fmtDate(item.installedAt)}</p>
                <div className="flex items-center gap-2">
                  {disabledReason && <span className="text-xs text-fg-faint">{disabledReason}</span>}
                  <button
                    type="button"
                    disabled={Boolean(disabledReason)}
                    onClick={() => setActiveSkill(manifest)}
                    className="rounded-[var(--radius)] border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:border-[var(--color-line)] disabled:text-fg-faint disabled:hover:bg-transparent"
                  >
                    Run
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {activeSkill && <SkillRunModal agent={agent} skill={activeSkill} onClose={() => setActiveSkill(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

function PolicyTab({ agent, installedSkills }: { agent: Agent; installedSkills: InstalledSkill[] }) {
  const policy = agent.deployment?.policy;
  return (
    <div className="space-y-3">
      <Info label="Daily cap" value={policy?.dailyCapWei ?? 'Not indexed'} mono />
      <Info label="Max per tx" value={policy?.maxPerTxWei ?? 'Not indexed'} mono />
      <Info label="Allowed skills/actions" value={policy?.allowedSkills?.join(', ') || installedSkills.map((skill) => skill.skillId).join(', ') || 'Not available for pre-bootstrap deployment'} />
      <Info label="Owner/admin" value={short(agent.ownerAddress)} mono />
      <p className="text-xs text-fg-faint">Deployment policy record indexed locally; on-chain policy reader not connected yet.</p>
    </div>
  );
}

function SplitsTab() {
  return <Empty title="No revenue splits configured" body="This agent has no indexed split configuration yet. Owner, protocol, and provider shares will appear after split setup is added." />;
}

function SettingsTab({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const required = agent.identityTokenId ?? agent.id;
  const canConfirm = typed.trim() === required || typed.trim() === agent.name;
  const canRetry = agent.status === 'failed' || agent.status === 'activating' || agent.status === 'error';

  async function retryOnboarding() {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/retry-onboarding`, { method: 'POST' });
      const body = await res.json().catch(() => ({})) as { message?: string; title?: string };
      setRetryMsg(res.ok ? (body.message ?? 'Retry queued. Refresh in ~30 seconds to see updated receipts.') : (body.title ?? 'Retry failed'));
    } catch {
      setRetryMsg('Network error — check your connection');
    } finally {
      setRetrying(false);
    }
  }

  async function hide() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/hide`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { title?: string; detail?: string };
        throw new Error(body.detail ?? body.title ?? 'Unable to hide agent');
      }
      router.push('/agents');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to hide agent');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-4">
        <p className="font-medium text-fg">Operational status</p>
        <p className="mt-1 text-xs text-fg-muted">Current status: <span className="capitalize text-fg">{agent.status.replace('_', ' ')}</span></p>
        <p className="mt-1 text-xs text-fg-faint">Pause/resume is not wired to an on-chain control yet, so these actions are intentionally disabled.</p>
      </div>
      {canRetry && (
        <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent/5 p-4">
          <p className="font-medium text-fg">Retry onboarding</p>
          <p className="mt-1 text-xs text-fg-muted">Bootstrap receipts failed during deployment. Retry anchors lifecycle events on-chain and repopulates your skills index.</p>
          {retryMsg && <p className={`mt-2 text-xs ${retryMsg.includes('Retry') ? 'text-fg-muted' : 'text-danger'}`}>{retryMsg}</p>}
          <button onClick={retryOnboarding} disabled={retrying} className="mt-3 rounded-[var(--radius)] border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50">{retrying ? 'Queuing…' : 'Retry onboarding'}</button>
        </div>
      )}
      <div className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning/5 p-4">
        <p className="font-medium text-fg">Workspace visibility</p>
        <p className="mt-1 text-xs text-fg-muted">Hide rushed or test agents from your local workspace without touching chain state.</p>
        <p className="mt-1 text-xs text-fg-faint">This does not delete the on-chain agent or receipts. It only hides the local workspace index entry.</p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="mt-3 rounded-[var(--radius)] border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10">Hide local index</button>
        ) : (
          <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated p-3">
            <p className="text-xs text-fg-muted">Type <span className="font-mono text-fg">{required}</span> or <span className="font-mono text-fg">{agent.name}</span> to confirm.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-xs text-fg" />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={hide} disabled={!canConfirm || saving} className="rounded-[var(--radius)] bg-warning px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">{saving ? 'Hiding…' : 'Confirm hide'}</button>
              <button onClick={() => { setConfirming(false); setTyped(''); setError(null); }} disabled={saving} className="rounded-[var(--radius)] border border-[var(--color-line)] px-3 py-1.5 text-xs text-fg-muted">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-surface p-3 transition-[border-color] duration-[150ms] hover:border-[var(--color-line-accent)]">
      <p className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 text-sm text-fg ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-line)] bg-surface px-8 py-14 text-center">
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs text-fg-muted leading-relaxed">{body}</p>
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
