import { Suspense } from 'react';
import { Topbar } from '@/components/shell/Topbar';
import { serverGetDashboardStats, serverGetReceiptHeatmap, serverGetReceipts } from '@/lib/server-api';
import { StatTile } from '@apogee/ui';
import { DashboardHeatmap } from '@/components/dashboard/DashboardHeatmap';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { Skeleton } from '@apogee/ui';

export const metadata = { title: 'Dashboard' };
export const revalidate = 60;

function fmtWei(wei: string): string {
  const n = BigInt(wei);
  const eth = Number(n) / 1e18;
  if (eth >= 1000) return `${(eth / 1000).toFixed(1)}K 0G`;
  if (eth >= 1) return `${eth.toFixed(3)} 0G`;
  return `${eth.toFixed(6)} 0G`;
}

async function StatsRow() {
  let stats = { totalAgents: 0, totalReceipts: 0, totalVolumeWei: '0', activeAgents: 0 };
  try { stats = await serverGetDashboardStats(); } catch {}
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Network Agents" value={String(stats.totalAgents)} />
      <StatTile label="Runtime Active" value={String(stats.activeAgents)} />
      <StatTile label="Network Receipts" value={String(stats.totalReceipts)} />
      <StatTile label="Network Volume" value={fmtWei(stats.totalVolumeWei)} />
    </div>
  );
}

async function HeatmapSection() {
  let cells: Awaited<ReturnType<typeof serverGetReceiptHeatmap>> = [];
  try { cells = await serverGetReceiptHeatmap(); } catch {}
  return <DashboardHeatmap cells={cells} />;
}

async function ActivitySection() {
  let receipts: Awaited<ReturnType<typeof serverGetReceipts>>['items'] = [];
  try {
    const result = await serverGetReceipts({ limit: 10, scope: 'global' });
    receipts = result.items;
  } catch {}
  return <RecentActivity receipts={receipts} />;
}

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          <p className="animate-fade-up text-xs text-fg-faint">Showing global Aristotle network activity. The Agents page shows agents owned by the connected wallet.</p>

          {/* Stat tiles */}
          <div className="animate-fade-up" style={{ animationDelay: '55ms' }}>
            <Suspense
              fallback={
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-[var(--radius-xl)]" />
                  ))}
                </div>
              }
            >
              <StatsRow />
            </Suspense>
          </div>

          {/* Heatmap */}
          <div className="animate-fade-up" style={{ animationDelay: '110ms' }}>
            <h2 className="mb-4 text-sm font-semibold text-fg">Receipt activity — last 7 days</h2>
            <Suspense fallback={<Skeleton className="h-[120px] rounded-[var(--radius-xl)]" />}>
              <HeatmapSection />
            </Suspense>
          </div>

          {/* Recent activity */}
          <div className="animate-fade-up" style={{ animationDelay: '165ms' }}>
            <h2 className="mb-4 text-sm font-semibold text-fg">Recent receipts</h2>
            <Suspense fallback={<Skeleton className="h-64 rounded-[var(--radius-xl)]" />}>
              <ActivitySection />
            </Suspense>
          </div>
        </div>
      </main>
    </>
  );
}
