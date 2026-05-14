'use client';

import { useState } from 'react';
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from 'wagmi';
import { buildDeployAuthorizationTypedData, APOGEE_CHAIN_ID } from '@apogee/core';
import type { AgentWizardState } from '@/lib/types';
import { aristotle } from '@/lib/wagmi';
import { CheckCircle, AlertCircle, Loader2, RefreshCw, Wallet } from 'lucide-react';

type DeployStatus =
  | { phase: 'idle' }
  | { phase: 'preparing_authorization' }
  | { phase: 'switching_network' }
  | { phase: 'waiting_signature' }
  | { phase: 'signature_cancelled' }
  | { phase: 'authorization_signed' }
  | { phase: 'creating' }
  | { phase: 'minting_identity' }
  | { phase: 'deploying_policy' }
  | { phase: 'installing_skills' }
  | { phase: 'writing_receipts' }
  | { phase: 'done'; txHash: string }
  | { phase: 'error'; message: string; detail?: string; requireNewSignature?: boolean };

const PHASES: Array<DeployStatus['phase']> = [
  'authorization_signed',
  'creating',
  'minting_identity',
  'deploying_policy',
  'installing_skills',
  'writing_receipts',
  'done',
];

const PHASE_LABELS: Record<string, string> = {
  authorization_signed: 'Wallet authorization signed',
  creating:             'Creating agent record…',
  minting_identity:     'Minting identity NFT…',
  deploying_policy:     'Registering policy and skills…',
  installing_skills:    'Installing selected skills…',
  writing_receipts:     'Writing bootstrap receipts…',
  done:                 'Deployed!',
};

interface Props {
  state: AgentWizardState;
  onBack: () => void;
  onDone: (txHash: string) => void;
}

function ethToWeiString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '0';
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = `${frac}000000000000000000`.slice(0, 18);
  return (BigInt(whole || '0') * 1_000_000_000_000_000_000n + BigInt(padded || '0')).toString();
}

function deploymentPolicy(state: AgentWizardState) {
  return {
    maxPerTxWei: ethToWeiString(state.policy.maxPerTxEth),
    dailyCapWei: ethToWeiString(state.policy.dailyCapEth),
    allowedSkills: [...state.skills].sort(),
    allowedActions: [...state.skills].sort(),
  };
}

function classifyError(title: string, detail?: string, status?: number): { message: string; detail?: string; requireNewSignature?: boolean } {
  const lower = `${title} ${detail ?? ''}`.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected request') || lower.includes('4001')) {
    return { message: 'Signature cancelled', detail: 'No deployment started. You can sign again when ready.' };
  }
  if (status === 401 && (lower.includes('expired') || lower.includes('nonce') || lower.includes('signature'))) {
    return { message: 'Authorization expired or invalid', detail: detail ?? 'Please sign a fresh deployment authorization.', requireNewSignature: true };
  }
  if (status === 401 || title.toLowerCase().includes('auth') || title.toLowerCase().includes('sign')) {
    return { message: 'Not signed in', detail: 'Your session may have expired. Return to the home page and sign in again.' };
  }
  if (title === 'Deployment not authorized' || lower.includes('not authorized to mint') || detail?.includes('Expected owner:')) {
    const ownerMatch  = detail?.match(/Expected owner:\s*(0x[a-fA-F0-9]{40})/i);
    const signerMatch = detail?.match(/Current edge signer:\s*(0x[a-fA-F0-9]{40})/i);
    return {
      message: 'Deployment signer is not authorized',
      detail: [
        ownerMatch?.[1] ? `Expected owner/admin: ${ownerMatch[1]}` : null,
        signerMatch?.[1] ? `Current edge signer: ${signerMatch[1]}` : null,
        'Action needed: configure AGENT_DEPLOYER_PRIVATE_KEY on @apogee/edge or authorize the edge signer.',
      ].filter(Boolean).join('\n'),
    };
  }
  if (status === 403) return { message: 'Not authorised', detail: detail ?? 'You can only deploy agents for your own wallet address.' };
  if (status === 409 || lower.includes('pending') || lower.includes('deployment_in_progress') || lower.includes('replacement transaction underpriced') || lower.includes('replacement fee too low')) {
    return { message: 'Deployment already in progress', detail: detail ?? 'This authorization is already being processed. Wait a moment and refresh the agent list.' };
  }
  if (status === 502 || lower.includes('unreachable') || lower.includes('network')) {
    return { message: 'API unavailable', detail: 'The Edge API did not respond. Please wait a moment and try again.' };
  }
  if (lower.includes('contract') || lower.includes('revert')) {
    return { message: 'Contract call failed', detail: detail ?? 'The on-chain transaction reverted. Check that the Aristotle network is reachable.' };
  }
  if (lower.includes('name')) return { message: 'Agent name required', detail: 'Go back to step 1 and enter a name for your agent.' };
  return { message: title || 'Deploy failed', detail };
}

export function WizardStepDeploy({ state, onBack, onDone }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [status, setStatus] = useState<DeployStatus>({ phase: 'idle' });
  const [confetti, setConfetti] = useState(false);

  const currentPhaseIdx = PHASES.indexOf(status.phase as typeof PHASES[number]);
  const policy = deploymentPolicy(state);

  async function deploy() {
    if (!state.identity.name.trim()) {
      setStatus({ phase: 'error', message: 'Agent name required', detail: 'Go back to step 1 and enter a name for your agent.' });
      return;
    }
    if (!isConnected || !address) {
      setStatus({ phase: 'error', message: 'Wallet not connected', detail: 'Connect and sign in with your wallet before deploying.' });
      return;
    }

    try {
      if (chainId !== APOGEE_CHAIN_ID) {
        setStatus({ phase: 'switching_network' });
        await switchChainAsync({ chainId: aristotle.id });
      }

      setStatus({ phase: 'preparing_authorization' });
      const nonceRes = await fetch('/api/auth/deploy-nonce');
      const nonce = await nonceRes.json() as { owner?: string; nonce?: string; deadline?: number; chainId?: number; title?: string; detail?: string };
      if (!nonceRes.ok || !nonce.owner || !nonce.nonce || !nonce.deadline) {
        const classified = classifyError(nonce.title ?? nonceRes.statusText, nonce.detail, nonceRes.status);
        setStatus({ phase: 'error', message: classified.message, detail: classified.detail, requireNewSignature: classified.requireNewSignature });
        return;
      }

      const typedData = buildDeployAuthorizationTypedData({
        owner: nonce.owner,
        name: state.identity.name.trim(),
        description: state.identity.description.trim() || '',
        skills: state.skills,
        policy,
        nonce: nonce.nonce,
        deadline: nonce.deadline,
      });

      setStatus({ phase: 'waiting_signature' });
      const signature = await signTypedDataAsync({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      setStatus({ phase: 'authorization_signed' });
      await sleep(250);
      setStatus({ phase: 'creating' });

      const res = await fetch('/api/agents/deploy-authorized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: {
            name: state.identity.name.trim(),
            description: state.identity.description.trim() || undefined,
            metadataRoot: state.identity.name.trim(),
            skills: state.skills,
            policy,
          },
          authorization: {
            owner: nonce.owner,
            nonce: nonce.nonce,
            deadline: nonce.deadline,
            signature,
          },
        }),
      });

      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const classified = classifyError((data['title'] as string | undefined) ?? res.statusText, data['detail'] as string | undefined, res.status);
        setStatus({ phase: 'error', message: classified.message, detail: classified.detail, requireNewSignature: classified.requireNewSignature });
        return;
      }

      await sleep(500); setStatus({ phase: 'minting_identity' });
      await sleep(400); setStatus({ phase: 'deploying_policy' });
      await sleep(300); setStatus({ phase: 'installing_skills' });
      await sleep(300); setStatus({ phase: 'writing_receipts' });
      await sleep(300);

      const agentId = (data['id'] as string | undefined) ?? 'deployed';
      setStatus({ phase: 'done', txHash: agentId });
      setConfetti(true);
      setTimeout(() => {
        setConfetti(false);
        onDone(agentId);
      }, 1600);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Deploy failed';
      const classified = classifyError(raw);
      if (classified.message === 'Signature cancelled') setStatus({ phase: 'signature_cancelled' });
      else setStatus({ phase: 'error', message: classified.message, detail: classified.detail, requireNewSignature: classified.requireNewSignature });
    }
  }

  const busy = !['idle', 'error', 'signature_cancelled'].includes(status.phase);
  const buttonLabel = status.phase === 'preparing_authorization'
    ? 'Preparing authorization…'
    : status.phase === 'switching_network'
      ? 'Switch to Aristotle Mainnet'
      : status.phase === 'waiting_signature'
        ? 'Waiting for signature in wallet…'
        : status.phase === 'authorization_signed'
          ? 'Authorization signed ✓'
          : status.phase === 'error'
            ? 'Try again'
            : status.phase === 'signature_cancelled'
              ? 'Sign again'
              : 'Sign deployment authorization';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Deploy agent</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Review your configuration, sign a wallet authorization, then Apogee’s deployment relayer provisions the agent on Aristotle.
        </p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-elevated p-4 text-sm space-y-2">
        <SummaryRow label="Name" value={state.identity.name || '—'} />
        {state.identity.description.trim() && <SummaryRow label="Description" value={state.identity.description.trim()} />}
        <SummaryRow label="Daily cap" value={`${state.policy.dailyCapEth} 0G`} />
        <SummaryRow label="Max per tx" value={`${state.policy.maxPerTxEth} 0G`} />
        <SummaryRow label="Skills" value={state.skills.join(', ') || 'None selected'} />
        <SummaryRow label="Network" value="0G Aristotle Mainnet (16661)" />
        <div className="mt-3 rounded-[var(--radius)] border border-accent/20 bg-accent/5 p-3 text-xs text-fg-muted">
          No funds are transferred. Gas is only used by Apogee’s deployment relayer.
        </div>
      </div>

      {status.phase === 'signature_cancelled' && (
        <div className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Signature cancelled. No deployment started.
        </div>
      )}

      {status.phase !== 'idle' && status.phase !== 'signature_cancelled' && status.phase !== 'preparing_authorization' && status.phase !== 'switching_network' && status.phase !== 'waiting_signature' && (
        <div className="space-y-2">
          {PHASES.filter((p) => p !== 'done').map((phase, i) => {
            const phaseIdx = PHASES.indexOf(phase);
            const done = currentPhaseIdx > phaseIdx;
            const active = status.phase === phase;
            return (
              <div key={phase} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full shrink-0">
                  {done ? <CheckCircle className="h-5 w-5 text-success" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <div className={`h-2 w-2 rounded-full ${i <= currentPhaseIdx ? 'bg-accent' : 'bg-elevated border border-[var(--color-line)]'}`} />}
                </div>
                <span className={`text-sm ${active ? 'text-fg font-medium' : done ? 'text-fg-muted line-through' : 'text-fg-faint'}`}>{PHASE_LABELS[phase]}</span>
              </div>
            );
          })}
        </div>
      )}

      {['preparing_authorization', 'switching_network', 'waiting_signature'].includes(status.phase) && (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-accent/25 bg-accent/5 p-4 text-sm text-fg">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          {buttonLabel}
        </div>
      )}

      {status.phase === 'done' && (
        <div className={`relative rounded-[var(--radius-lg)] border border-success/30 bg-success/10 p-4 text-center ${confetti ? 'animate-pulse' : ''}`}>
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-success" />
          <p className="text-sm font-semibold text-fg">Agent deployed!</p>
          <p className="mt-1 font-mono text-xs text-fg-muted">ID: {status.txHash.slice(0, 16)}…</p>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger/10 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-danger">{status.message}</p>
              {status.detail && <div className="space-y-0.5">{status.detail.split('\n').map((line, i) => <p key={i} className="text-xs text-danger/80 leading-relaxed font-mono">{line}</p>)}</div>}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button type="button" onClick={onBack} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--color-line)] px-4 text-sm text-fg-muted hover:text-fg disabled:opacity-40">← Back</button>
        {status.phase !== 'done' && (
          <button type="button" onClick={deploy} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {status.phase === 'error' || status.phase === 'signature_cancelled' ? <RefreshCw className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-fg-faint">{label}</span>
      <span className="text-right text-fg">{value}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
