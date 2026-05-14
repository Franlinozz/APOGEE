'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AgentWizardState, AgentWizardStep } from '@/lib/types';
import { WizardStepIdentity } from './WizardStepIdentity';
import { WizardStepFunding } from './WizardStepFunding';
import { WizardStepPolicy } from './WizardStepPolicy';
import { WizardStepSkills } from './WizardStepSkills';
import { WizardStepDeploy } from './WizardStepDeploy';

const STEPS: { id: AgentWizardStep; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'funding', label: 'Funding' },
  { id: 'policy', label: 'Policy' },
  { id: 'skills', label: 'Skills' },
  { id: 'deploy', label: 'Deploy' },
];

const INITIAL: AgentWizardState = {
  step: 'identity',
  identity: { name: '', description: '' },
  funding: { predictedAddress: '' },
  policy: {
    maxPerTxEth: '0.01',
    dailyCapEth: '0.1',
    allowedContracts: [],
    allowedSkills: [],
    activeHoursStart: 0,
    activeHoursEnd: 24,
    requiresApprovalAboveEth: '0.05',
  },
  skills: [],
};

export function AgentWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSkill = searchParams.get('skill');
  const [state, setState] = useState<AgentWizardState>(() => initialSkill ? { ...INITIAL, skills: [initialSkill], policy: { ...INITIAL.policy, allowedSkills: [initialSkill] } } : INITIAL);

  const currentIdx = STEPS.findIndex((s) => s.id === state.step);

  function patch(partial: Partial<AgentWizardState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function goTo(step: AgentWizardStep) {
    setState((prev) => ({ ...prev, step }));
  }

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <button
                onClick={() => done && goTo(s.id)}
                disabled={!done}
                className="flex items-center gap-2 disabled:cursor-default"
                aria-current={active ? 'step' : undefined}
              >
                <div
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    active ? 'bg-accent text-white' : done ? 'bg-accent/20 text-accent' : 'bg-elevated text-fg-faint',
                  ].join(' ')}
                >
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-faint'}`}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-px flex-1 ${i < currentIdx ? 'bg-accent/30' : 'bg-[var(--color-line)]'}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-7">
        {state.step === 'identity' && (
          <WizardStepIdentity
            value={state.identity}
            onChange={(identity) => patch({ identity })}
            onNext={() => goTo('funding')}
          />
        )}
        {state.step === 'funding' && (
          <WizardStepFunding
            identity={state.identity}
            value={state.funding}
            onChange={(funding) => patch({ funding })}
            onBack={() => goTo('identity')}
            onNext={() => goTo('policy')}
          />
        )}
        {state.step === 'policy' && (
          <WizardStepPolicy
            value={state.policy}
            onChange={(policy) => patch({ policy })}
            onBack={() => goTo('funding')}
            onNext={() => goTo('skills')}
          />
        )}
        {state.step === 'skills' && (
          <WizardStepSkills
            value={state.skills}
            policy={state.policy}
            onChange={(skills) => patch({ skills })}
            onBack={() => goTo('policy')}
            onNext={() => goTo('deploy')}
          />
        )}
        {state.step === 'deploy' && (
          <WizardStepDeploy
            state={state}
            onBack={() => goTo('skills')}
            onDone={(txHash) => {
              patch({ deployTxHash: txHash });
              router.push(`/agents/${encodeURIComponent(txHash)}`);
            }}
          />
        )}
      </div>
    </div>
  );
}
