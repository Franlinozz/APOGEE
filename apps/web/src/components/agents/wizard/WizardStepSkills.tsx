'use client';

import { useEffect, useState } from 'react';
import type { AgentWizardState, SkillManifest } from '@/lib/types';
import { getSkills } from '@/lib/api';
import { Skeleton } from '@apogee/ui';

interface Props {
  value: string[];
  policy: AgentWizardState['policy'];
  onChange: (skills: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const FREE_SKILLS: SkillManifest[] = [
  { id: 'chat.completion', name: 'Chat Completion', version: '1.0.0', description: 'LLM chat via 0G Compute', category: 'AI', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'memory.write', name: 'Memory Write', version: '1.0.0', description: 'Persist encrypted memory', category: 'Memory', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'memory.read', name: 'Memory Read', version: '1.0.0', description: 'Read encrypted memory', category: 'Memory', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'memory.search', name: 'Memory Search', version: '1.0.0', description: 'Semantic memory search', category: 'Memory', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'chain.query', name: 'Chain Query', version: '1.0.0', description: 'Read on-chain state', category: 'Chain', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'chain.send', name: 'Chain Send', version: '1.0.0', description: 'Submit on-chain tx', category: 'Chain', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'web.search', name: 'Web Search', version: '1.0.0', description: 'Search the web', category: 'Web', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'web.fetch', name: 'Web Fetch', version: '1.0.0', description: 'Fetch a URL', category: 'Web', tier: 'free', pricePerCallWei: '0', tags: [] },
  { id: 'storage.upload', name: 'Storage Upload', version: '1.0.0', description: 'Upload to 0G Storage', category: 'Storage', tier: 'free', pricePerCallWei: '0', tags: [] },
];

function fmtWei(wei: string): string {
  if (wei === '0') return 'Free';
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(6)} 0G/call`;
}

export function WizardStepSkills({ value, policy, onChange, onBack, onNext }: Props) {
  const [skills, setSkills] = useState<SkillManifest[]>(FREE_SKILLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSkills()
      .then((remote) => setSkills(remote.length > 0 ? remote : FREE_SKILLS))
      .catch(() => setSkills(FREE_SKILLS))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((s) => s !== id));
    } else {
      onChange([...value, id]);
    }
  }

  const selectedSkills = skills.filter((s) => value.includes(s.id));
  const estimatedCostWei = selectedSkills.reduce((acc, s) => acc + BigInt(s.pricePerCallWei), BigInt(0));

  const notInPolicy = value.filter((sid) => policy.allowedSkills.length > 0 && !policy.allowedSkills.includes(sid));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Select skills</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose the capabilities your agent can use. Free skills have no per-call cost.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => {
            const selected = value.includes(skill.id);
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggle(skill.id)}
                className={[
                  'flex w-full items-center justify-between rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors',
                  selected
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-[var(--color-line)] hover:bg-elevated',
                ].join(' ')}
              >
                <div>
                  <p className={`text-sm font-medium ${selected ? 'text-accent' : 'text-fg'}`}>{skill.name}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{skill.description}</p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className={`text-xs font-medium ${skill.tier === 'premium' ? 'text-warning' : 'text-success'}`}>
                    {fmtWei(skill.pricePerCallWei)}
                  </p>
                  <p className="text-[10px] text-fg-faint capitalize">{skill.tier}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {notInPolicy.length > 0 && (
        <p className="rounded-[var(--radius)] border border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
          ⚠ {notInPolicy.join(', ')} not in your policy&apos;s allowed skills. Update the policy or add them.
        </p>
      )}

      <div className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-4 py-2">
        <span className="text-xs text-fg-muted">Estimated cost per run cycle</span>
        <span className="font-mono text-xs text-fg">
          {estimatedCostWei === BigInt(0) ? 'Free' : `${(Number(estimatedCostWei) / 1e18).toFixed(6)} 0G`}
        </span>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--color-line)] px-4 text-sm text-fg-muted hover:text-fg"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={value.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
