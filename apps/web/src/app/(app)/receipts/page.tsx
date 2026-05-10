import { Topbar } from '@/components/shell/Topbar';
import { serverGetReceipts } from '@/lib/server-api';
import type { Receipt } from '@/lib/types';
import { ReceiptsTableClient } from '@/components/receipts/ReceiptsTableClient';

export const metadata = { title: 'Receipts' };
export const revalidate = 30;

export default async function ReceiptsPage() {
  let data: { items: Receipt[]; total: number } = { items: [], total: 0 };
  try {
    data = await serverGetReceipts({ limit: 100 });
  } catch {}

  return (
    <>
      <Topbar title="Receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl">
          <ReceiptsTableClient initialReceipts={data.items} totalCount={data.total} />
        </div>
      </main>
    </>
  );
}
