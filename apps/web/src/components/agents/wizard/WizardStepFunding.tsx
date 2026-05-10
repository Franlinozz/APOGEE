'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Copy, Check } from 'lucide-react';

interface Props {
  identity: { name: string };
  value: { predictedAddress: string };
  onChange: (v: { predictedAddress: string }) => void;
  onBack: () => void;
  onNext: () => void;
}

export function WizardStepFunding({ identity, value, onChange, onBack, onNext }: Props) {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!value.predictedAddress && address) {
      const predicted = address;
      onChange({ predictedAddress: predicted });
    }
  }, [address, value.predictedAddress, onChange]);

  async function copy() {
    if (!value.predictedAddress) return;
    await navigator.clipboard.writeText(value.predictedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-fg">Fund the agent account</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Your agent gets a counterfactual ERC-4337 smart account. Send 0G tokens to this address
          before deploying so it can pay gas and settle actions.
        </p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-line-accent)] bg-accent/5 p-4">
        <p className="mb-1 text-xs font-medium text-fg-muted">Predicted account address</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-auto font-mono text-xs text-fg">
            {value.predictedAddress || 'Connect wallet to see address'}
          </code>
          {value.predictedAddress && (
            <button
              onClick={copy}
              className="shrink-0 rounded p-1 text-fg-muted transition-colors hover:text-fg"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--color-line)] bg-elevated p-4 text-xs text-fg-muted">
        <p className="font-medium text-fg">What happens next?</p>
        <ul className="mt-2 space-y-1 list-disc pl-4">
          <li>The account only activates when you deploy (Step 5).</li>
          <li>Funding now means the first transaction won&apos;t fail.</li>
          <li>You can fund later and deploy a policy first.</li>
        </ul>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--color-line)] px-4 text-sm text-fg-muted hover:text-fg"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] bg-accent px-5 text-sm font-semibold text-white hover:opacity-90"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
