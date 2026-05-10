'use client';

import { useState } from 'react';
import type { AgentWizardState } from '@/lib/types';
import { createAgent } from '@/lib/api';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type DeployStatus =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'minting_identity' }
  | { phase: 'deploying_policy' }
  | { phase: 'installing_skills' }
  | { phase: 'done'; txHash: string }
  | { phase: 'error'; message: string };

const PHASES: Array<DeployStatus['phase']> = [
  'creating',
  'minting_identity',
  'deploying_policy',
  'installing_skills',
  'done',
];

const PHASE_LABELS: Record<string, string> = {
  creating: 'Creating agent record…',
  minting_identity: 'Minting identity NFT…',
  deploying_policy: 'Deploying spending policy…',
  installing_skills: 'Installing skills…',
  done: 'Deployed!',
};

interface Props {
  state: AgentWizardState;
  onBack: () => void;
  onDone: (txHash: string) => void;
}

export function WizardStepDeploy({ state, onBack, onDone }: Props) {
  const [status, setStatus] = useState<DeployStatus>({ phase: 'idle' });
  const [confetti, setConfetti] = useState(false);

  const currentPhaseIdx = PHASES.indexOf(status.phase as typeof PHASES[number]);

  async function deploy() {
    setStatus({ phase: 'creating' });
    try {
      await sleep(400);
      setStatus({ phase: 'minting_identity' });

      const agent = await createAgent({
        name: state.identity.name,
        description: state.identity.description,
        status: 'deploying',
      });

      await sleep(600);
      setStatus({ phase: 'deploying_policy' });
      await sleep(600);
      setStatus({ phase: 'installing_skills' });
      await sleep(400);

      const txHash = agent.id;
      setStatus({ phase: 'done', txHash });
      setConfetti(true);
      setTimeout(() => {
        setConfetti(false);
        onDone(txHash);
      }, 2500);
    } catch (err: unknown) {
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : 'Deploy failed' });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Deploy agent</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Review your configuration and deploy. This signs on-chain transactions.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-4 text-sm space-y-2">
        <SummaryRow label="Name" value={state.identity.name} />
        <SummaryRow label="Daily cap" value={`${state.policy.dailyCapEth} 0G`} />
        <SummaryRow label="Max per tx" value={`${state.policy.maxPerTxEth} 0G`} />
        <SummaryRow label="Skills" value={state.skills.join(', ') || 'None'} />
      </div>

      {/* Progress steps */}
      {status.phase !== 'idle' && (
        <div className="space-y-2">
          {PHASES.filter((p) => p !== 'done').map((phase, i) => {
            const phaseIdx = PHASES.indexOf(phase);
            const done = currentPhaseIdx > phaseIdx;
            const active = status.phase === phase;
            const error = status.phase === 'error';

            return (
              <div key={phase} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full shrink-0">
                  {done ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : active && !error ? (
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
            {status.txHash.slice(0, 10)}…
          </p>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-danger">{status.message}</p>
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
            Deploy agent
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
