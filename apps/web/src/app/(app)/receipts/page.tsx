import { Topbar } from '@/components/shell/Topbar';
import { serverGetReceipts } from '@/lib/server-api';
import type { Receipt } from '@/lib/types';
import { ReceiptsTableClient } from '@/components/receipts/ReceiptsTableClient';

export const metadata = { title: 'Receipts' };
export const revalidate = 30;

export default async function ReceiptsPage() {
  let data: { items: Receipt[]; total: number } = { items: [], total: 0 };
  try {
    data = await serverGetReceipts({ limit: 100, scope: 'global' });
  } catch {}

  return (
    <>
      <Topbar title="Receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="animate-fade-up mx-auto max-w-6xl space-y-3">
          <p className="text-sm font-semibold text-fg">On-chain receipt ledger</p>
          <p className="text-xs text-fg-faint">Showing global receipt activity from the same Edge receipt index used by dashboard stats. Wallet-specific filtering can be added from this feed.</p>
          <ReceiptsTableClient initialReceipts={data.items} totalCount={data.total} />
        </div>
      </main>
    </>
  );
}
