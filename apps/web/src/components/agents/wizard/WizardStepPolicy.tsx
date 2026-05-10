'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AgentWizardState } from '@/lib/types';
import { useState } from 'react';

const weiPat = /^\d+(\.\d+)?$/;

const schema = z.object({
  maxPerTxEth: z.string().regex(weiPat, 'Must be a number'),
  dailyCapEth: z.string().regex(weiPat, 'Must be a number'),
  requiresApprovalAboveEth: z.string().regex(weiPat, 'Must be a number'),
  activeHoursStart: z.number().int().min(0).max(23),
  activeHoursEnd: z.number().int().min(1).max(24),
  allowedContracts: z.array(z.string()),
  allowedSkills: z.array(z.string()),
});

type Fields = z.infer<typeof schema>;

const PRESET_SKILLS = ['chat.completion', 'memory.write', 'memory.read', 'chain.send', 'chain.query', 'web.search'];

interface Props {
  value: AgentWizardState['policy'];
  onChange: (v: AgentWizardState['policy']) => void;
  onBack: () => void;
  onNext: () => void;
}

export function WizardStepPolicy({ value, onChange, onBack, onNext }: Props) {
  const [contractInput, setContractInput] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: value,
  });

  const watched = watch();
  const previewPolicy = {
    maxPerTxWei: String(BigInt(Math.round(parseFloat(watched.maxPerTxEth || '0') * 1e18))),
    dailyCapWei: String(BigInt(Math.round(parseFloat(watched.dailyCapEth || '0') * 1e18))),
    requiresApprovalAboveWei: String(BigInt(Math.round(parseFloat(watched.requiresApprovalAboveEth || '0') * 1e18))),
    activeHoursStart: watched.activeHoursStart,
    activeHoursEnd: watched.activeHoursEnd,
    allowedContracts: watched.allowedContracts ?? [],
    allowedSkills: watched.allowedSkills ?? [],
  };

  function addContract() {
    if (contractInput.startsWith('0x') && contractInput.length === 42) {
      setValue('allowedContracts', [...(watched.allowedContracts ?? []), contractInput]);
      setContractInput('');
    }
  }

  function toggleSkill(skill: string) {
    const current = watched.allowedSkills ?? [];
    if (current.includes(skill)) {
      setValue('allowedSkills', current.filter((s: string) => s !== skill));
    } else {
      setValue('allowedSkills', [...current, skill]);
    }
  }

  function submit(data: Fields) {
    onChange(data);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Spending policy</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Set limits and permissions. These are encoded into the agent&apos;s on-chain PolicyEngine.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-fg-muted">Max per tx (0G)</label>
          <input
            {...register('maxPerTxEth')}
            className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {errors.maxPerTxEth && <p className="mt-1 text-xs text-danger">{errors.maxPerTxEth.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-fg-muted">Daily cap (0G)</label>
          <input
            {...register('dailyCapEth')}
            className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {errors.dailyCapEth && <p className="mt-1 text-xs text-danger">{errors.dailyCapEth.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-fg-muted">Approval above (0G)</label>
          <input
            {...register('requiresApprovalAboveEth')}
            className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {errors.requiresApprovalAboveEth && (
            <p className="mt-1 text-xs text-danger">{errors.requiresApprovalAboveEth.message}</p>
          )}
        </div>
      </div>

      {/* Active hours */}
      <div>
        <label className="mb-2 block text-xs font-medium text-fg-muted">Active hours (UTC)</label>
        <div className="flex items-center gap-3">
          <Controller
            control={control}
            name="activeHoursStart"
            render={({ field }) => (
              <select
                {...field}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{`${i}:00`}</option>
                ))}
              </select>
            )}
          />
          <span className="text-sm text-fg-muted">to</span>
          <Controller
            control={control}
            name="activeHoursEnd"
            render={({ field }) => (
              <select
                {...field}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{`${i + 1}:00`}</option>
                ))}
              </select>
            )}
          />
        </div>
      </div>

      {/* Allowed skills */}
      <div>
        <label className="mb-2 block text-xs font-medium text-fg-muted">Allowed skills</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_SKILLS.map((skill) => {
            const active = (watched.allowedSkills ?? []).includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={[
                  'rounded-full border px-3 py-1 font-mono text-xs transition-colors',
                  active
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-[var(--color-line)] text-fg-muted hover:text-fg',
                ].join(' ')}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>

      {/* Allowed contracts */}
      <div>
        <label className="mb-2 block text-xs font-medium text-fg-muted">Allowed contracts</label>
        <div className="flex gap-2">
          <input
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            placeholder="0x…"
            className="flex-1 rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <button
            type="button"
            onClick={addContract}
            className="rounded-[var(--radius)] border border-[var(--color-line)] px-3 py-2 text-xs text-fg-muted hover:text-fg"
          >
            Add
          </button>
        </div>
        {(watched.allowedContracts ?? []).length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {(watched.allowedContracts ?? []).map((addr) => (
              <div key={addr} className="flex items-center justify-between rounded bg-elevated px-3 py-1.5">
                <code className="font-mono text-xs text-fg">{addr}</code>
                <button
                  type="button"
                  onClick={() =>
                    setValue(
                      'allowedContracts',
                      (watched.allowedContracts ?? []).filter((a: string) => a !== addr),
                    )
                  }
                  className="text-xs text-danger hover:opacity-80"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* JSON preview */}
      <div>
        <p className="mb-1 text-xs font-medium text-fg-muted">Policy preview (on-chain encoding)</p>
        <pre className="overflow-auto rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated p-3 font-mono text-[10px] text-fg-muted">
          {JSON.stringify(previewPolicy, null, 2)}
        </pre>
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
          type="submit"
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white hover:opacity-90"
        >
          Next →
        </button>
      </div>
    </form>
  );
}
