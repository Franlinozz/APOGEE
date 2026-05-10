import { Suspense } from 'react';
import { ConnectWallet } from '@/components/auth/ConnectWallet';

export default function ConnectPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-8 shadow-[var(--shadow-card)]">
        <Suspense>
          <ConnectWallet />
        </Suspense>
      </div>
    </div>
  );
}
