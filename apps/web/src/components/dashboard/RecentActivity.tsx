import type { Receipt } from '@/lib/types';
import { ChainAddress } from '@apogee/ui';

function fmtWei(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(6)} 0G`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'text-success',
  pending: 'text-warning',
  failed: 'text-danger',
};

export function RecentActivity({ receipts }: { receipts: Receipt[] }) {
  if (receipts.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-12 text-center">
        <p className="text-sm text-fg-muted">No receipts yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)]">
            <th className="px-5 py-3 text-left text-xs font-medium text-fg-muted">Receipt ID</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-fg-muted">Agent</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-fg-muted">Amount</th>
            <th className="px-5 py-3 text-left text-xs font-medium text-fg-muted">Status</th>
            <th className="px-5 py-3 text-right text-xs font-medium text-fg-muted">Time</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id} className="border-b border-[var(--color-line)] last:border-0">
              <td className="px-5 py-3 font-mono text-xs text-fg-muted">
                {r.id.slice(0, 8)}…
              </td>
              <td className="px-5 py-3">
                <ChainAddress address={r.agentId} short chainId={16602} />
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs text-fg">
                {fmtWei(r.amountWei)}
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs font-medium capitalize ${STATUS_CLASSES[r.status] ?? 'text-fg-muted'}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-5 py-3 text-right text-xs text-fg-muted">
                {fmtDate(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
