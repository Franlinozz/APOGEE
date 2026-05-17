'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FaucetButton } from './FaucetButton';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Max 64 characters'),
  description: z.string().max(256, 'Max 256 characters').optional().default(''),
});

type Fields = z.infer<typeof schema>;

interface Props {
  value: { name: string; description: string };
  onChange: (v: { name: string; description: string }) => void;
  onNext: () => void;
}

export function WizardStepIdentity({ value, onChange, onNext }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: value,
  });

  function submit(data: Fields) {
    onChange({ name: data.name, description: data.description ?? '' });
    onNext();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Agent identity</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Give your agent a name. This mints an ERC-7857 identity NFT.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-fg-muted" htmlFor="agent-name">
            Name <span className="text-danger">*</span>
          </label>
          <input
            id="agent-name"
            {...register('name')}
            placeholder="My trading agent"
            className="w-full rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-fg-muted" htmlFor="agent-desc">
            Description
          </label>
          <textarea
            id="agent-desc"
            {...register('description')}
            rows={3}
            placeholder="What does this agent do?"
            className="w-full resize-none rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-danger">{errors.description.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <FaucetButton />
          <p className="text-[10px] text-fg-faint px-1">Need 0G tokens to cover gas?</p>
        </div>
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
