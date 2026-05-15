import { Suspense } from 'react';
import { ConnectWallet } from '@/components/auth/ConnectWallet';

export default function ConnectPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4 py-8">
      <Suspense>
        <ConnectWallet />
      </Suspense>
    </div>
  );
}
