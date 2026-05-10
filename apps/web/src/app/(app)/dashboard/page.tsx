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
  const stats = await serverGetDashboardStats();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Total Agents" value={String(stats.totalAgents)} />
      <StatTile label="Active Agents" value={String(stats.activeAgents)} />
      <StatTile label="Total Receipts" value={String(stats.totalReceipts)} />
      <StatTile label="Total Volume" value={fmtWei(stats.totalVolumeWei)} />
    </div>
  );
}

async function HeatmapSection() {
  const cells = await serverGetReceiptHeatmap();
  return <DashboardHeatmap cells={cells} />;
}

async function ActivitySection() {
  const result = await serverGetReceipts({ limit: 10 });
  return <RecentActivity receipts={result.items} />;
}

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Stat tiles */}
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

          {/* Heatmap */}
          <div>
            <h2 className="mb-4 text-sm font-semibold text-fg">Receipt activity — last 7 days</h2>
            <Suspense fallback={<Skeleton className="h-[120px] rounded-[var(--radius-xl)]" />}>
              <HeatmapSection />
            </Suspense>
          </div>

          {/* Recent activity */}
          <div>
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
