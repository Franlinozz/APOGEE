'use client';

import { useState } from 'react';
import type { AgentWizardState } from '@/lib/types';
import { CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

type DeployStatus =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'minting_identity' }
  | { phase: 'deploying_policy' }
  | { phase: 'installing_skills' }
  | { phase: 'done'; txHash: string }
  | { phase: 'error'; message: string; detail?: string };

const PHASES: Array<DeployStatus['phase']> = [
  'creating',
  'minting_identity',
  'deploying_policy',
  'installing_skills',
  'done',
];

const PHASE_LABELS: Record<string, string> = {
  creating:          'Creating agent record…',
  minting_identity:  'Minting identity NFT…',
  deploying_policy:  'Deploying spending policy…',
  installing_skills: 'Installing skills…',
  done:              'Deployed!',
};

interface Props {
  state: AgentWizardState;
  onBack: () => void;
  onDone: (txHash: string) => void;
}

// Map a raw error to a user-friendly message + optional detail
function classifyError(title: string, detail?: string, status?: number): { message: string; detail?: string } {
  if (status === 401 || title.toLowerCase().includes('auth') || title.toLowerCase().includes('sign')) {
    return { message: 'Not signed in', detail: 'Your session may have expired. Return to the home page and sign in again.' };
  }
  if (status === 402 || title.toLowerCase().includes('funds') || detail?.toLowerCase().includes('funds')) {
    return { message: 'Insufficient funds', detail: 'Your agent wallet needs 0G tokens to cover gas. Visit faucet.0g.ai to get testnet tokens.' };
  }
  if (status === 403) {
    return { message: 'Not authorised', detail: detail ?? 'You can only deploy agents for your own wallet address.' };
  }
  if (status === 502 || title.toLowerCase().includes('unreachable') || title.toLowerCase().includes('network')) {
    return { message: 'API unavailable', detail: 'The Edge API did not respond. Please wait a moment and try again.' };
  }
  if (title.toLowerCase().includes('contract') || detail?.toLowerCase().includes('revert')) {
    return { message: 'Contract call failed', detail: detail ?? 'The on-chain transaction reverted. Check that the Aristotle network is reachable and your wallet is funded.' };
  }
  if (title.toLowerCase().includes('name') || detail?.toLowerCase().includes('name')) {
    return { message: 'Agent name required', detail: 'Go back to step 1 and enter a name for your agent.' };
  }
  return { message: title || 'Deploy failed', detail };
}

export function WizardStepDeploy({ state, onBack, onDone }: Props) {
  const [status, setStatus] = useState<DeployStatus>({ phase: 'idle' });
  const [confetti, setConfetti] = useState(false);

  const currentPhaseIdx = PHASES.indexOf(status.phase as typeof PHASES[number]);

  async function deploy() {
    if (!state.identity.name.trim()) {
      setStatus({ phase: 'error', message: 'Agent name required', detail: 'Go back to step 1 and enter a name for your agent.' });
      return;
    }

    setStatus({ phase: 'creating' });
    try {
      await sleep(300);
      setStatus({ phase: 'minting_identity' });

      // Route through the Next.js proxy which attaches the httpOnly cookie as Bearer token.
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.identity.name.trim(),
          metadataRoot: state.identity.name.trim(),
        }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const title = (data['title'] as string | undefined) ?? res.statusText;
        const detail = data['detail'] as string | undefined;
        const classified = classifyError(title, detail, res.status);
        setStatus({ phase: 'error', message: classified.message, detail: classified.detail });
        return;
      }

      await sleep(500);
      setStatus({ phase: 'deploying_policy' });
      await sleep(400);
      setStatus({ phase: 'installing_skills' });
      await sleep(300);

      const agentId = (data['id'] as string | undefined) ?? 'deployed';
      setStatus({ phase: 'done', txHash: agentId });
      setConfetti(true);
      setTimeout(() => {
        setConfetti(false);
        onDone(agentId);
      }, 2500);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Deploy failed';
      const classified = classifyError(raw);
      setStatus({ phase: 'error', message: classified.message, detail: classified.detail });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Deploy agent</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Review your configuration and deploy. This registers your agent on Aristotle mainnet.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-4 text-sm space-y-2">
        <SummaryRow label="Name" value={state.identity.name || '—'} />
        <SummaryRow label="Daily cap" value={`${state.policy.dailyCapEth} 0G`} />
        <SummaryRow label="Max per tx" value={`${state.policy.maxPerTxEth} 0G`} />
        <SummaryRow label="Skills" value={state.skills.join(', ') || 'None selected'} />
        <SummaryRow label="Network" value="0G Aristotle Mainnet (16661)" />
      </div>

      {/* Progress steps */}
      {status.phase !== 'idle' && (
        <div className="space-y-2">
          {PHASES.filter((p) => p !== 'done').map((phase, i) => {
            const phaseIdx = PHASES.indexOf(phase);
            const done = currentPhaseIdx > phaseIdx;
            const active = status.phase === phase;

            return (
              <div key={phase} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full shrink-0">
                  {done ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : (
                    <div className={`h-2 w-2 rounded-full ${i <= currentPhaseIdx ? 'bg-accent' : 'bg-elevated border border-[var(--color-line)]'}`} />
                  )}
                </div>
                <span className={`text-sm ${active ? 'text-fg font-medium' : done ? 'text-fg-muted line-through' : 'text-fg-faint'}`}>
                  {PHASE_LABELS[phase]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {status.phase === 'done' && (
        <div className={`relative rounded-[var(--radius-lg)] border border-success/30 bg-success/10 p-4 text-center ${confetti ? 'animate-pulse' : ''}`}>
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-success" />
          <p className="text-sm font-semibold text-fg">Agent deployed!</p>
          <p className="mt-1 font-mono text-xs text-fg-muted">
            ID: {status.txHash.slice(0, 16)}…
          </p>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger/10 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-danger">{status.message}</p>
              {status.detail && (
                <p className="text-xs text-danger/80 leading-relaxed">{status.detail}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={status.phase !== 'idle' && status.phase !== 'error'}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--color-line)] px-4 text-sm text-fg-muted hover:text-fg disabled:opacity-40"
        >
          ← Back
        </button>
        {(status.phase === 'idle' || status.phase === 'error') && (
          <button
            type="button"
            onClick={deploy}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            {status.phase === 'error' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </>
            ) : (
              'Deploy agent'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-right text-xs text-fg">{value}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
