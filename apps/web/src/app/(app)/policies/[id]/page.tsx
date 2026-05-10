import { Topbar } from '@/components/shell/Topbar';
import { serverGetPolicy } from '@/lib/server-api';
import Link from 'next/link';

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Policy — ${params.id.slice(0, 8)}` };
}

function fmtWei(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(6)} 0G`;
}

export default async function PolicyPage({ params }: { params: { id: string } }) {
  let policy = null;
  try {
    policy = await serverGetPolicy(params.id);
  } catch {}

  return (
    <>
      <Topbar title="Policy" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {!policy ? (
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface px-6 py-16 text-center">
              <p className="text-sm text-fg-muted">Policy not found.</p>
            </div>
          ) : (
            <>
              <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-fg-muted">Policy</p>
                    <p className="font-mono text-sm text-fg">{policy.id.slice(0, 12)}…</p>
                  </div>
                  <span className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs text-fg-muted">
                    v{policy.version}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 border-t border-[var(--color-line)] pt-4">
                  <PolicyRow label="Max per tx" value={fmtWei(policy.maxPerTxWei)} />
                  <PolicyRow label="Daily cap" value={fmtWei(policy.dailyCapWei)} />
                  <PolicyRow label="Approval above" value={fmtWei(policy.requiresApprovalAboveWei)} />
                  <PolicyRow
                    label="Active hours (UTC)"
                    value={`${policy.activeHoursStart}:00 – ${policy.activeHoursEnd}:00`}
                  />
                </div>

                {policy.allowedSkills.length > 0 && (
                  <div className="border-t border-[var(--color-line)] pt-4">
                    <p className="mb-2 text-xs font-medium text-fg-muted">Allowed skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {policy.allowedSkills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-0.5 font-mono text-xs text-accent"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {policy.allowedContracts.length > 0 && (
                  <div className="border-t border-[var(--color-line)] pt-4">
                    <p className="mb-2 text-xs font-medium text-fg-muted">Allowed contracts</p>
                    <div className="space-y-1">
                      {policy.allowedContracts.map((addr) => (
                        <p key={addr} className="font-mono text-xs text-fg-muted">{addr}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CTA to create new version */}
              <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">Update policy</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Creates a new policy version. The agent continues with the existing policy until you activate the new one.
                  </p>
                </div>
                <Link
                  href={`/agents/new?policy=${policy.agentId}`}
                  className="ml-4 shrink-0 inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  New version →
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-fg">{value}</p>
    </div>
  );
}
