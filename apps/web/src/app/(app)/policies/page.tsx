import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '@/components/shell/Topbar';
import { Shield, Zap, Clock, Lock, ArrowRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Policies — Apogee Protocol' };

const POLICY_CONCEPTS = [
  {
    icon: Zap,
    title: 'Max per transaction',
    description:
      'The maximum amount of 0G an agent can spend in a single transaction. Prevents runaway charges from a single misbehaving skill call.',
    example: 'e.g. 0.01 0G per tx',
    color: 'text-amber-400',
    iconBg: 'bg-amber-400/[0.08] border-amber-400/20',
  },
  {
    icon: Clock,
    title: 'Daily spending cap',
    description:
      'Hard ceiling on total 0G spent by an agent in a 24-hour UTC window. PolicyEngine reverts any transaction that would exceed this limit.',
    example: 'e.g. 0.1 0G / day',
    color: 'text-green-400',
    iconBg: 'bg-green-400/[0.08] border-green-400/20',
  },
  {
    icon: Shield,
    title: 'Approval threshold',
    description:
      'Any transaction above this value requires explicit owner approval before proceeding. Adds a human checkpoint for high-value actions.',
    example: 'e.g. require approval > 0.05 0G',
    color: 'text-violet-400',
    iconBg: 'bg-violet-400/[0.08] border-violet-400/20',
  },
  {
    icon: Lock,
    title: 'Skill allowlist',
    description:
      'Merkle-tree based allowlist of permitted skill IDs. Agents can only call skills explicitly approved in their policy — any other skill ID is rejected at the contract level.',
    example: 'e.g. ["chat.completion", "memory.write"]',
    color: 'text-cyan-400',
    iconBg: 'bg-cyan-400/[0.08] border-cyan-400/20',
  },
] as const;

export default function PoliciesPage() {
  return (
    <>
      <Topbar title="Policies" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">

          {/* Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-3 py-1 text-xs font-semibold text-violet-400">
              <Shield className="h-3 w-3" />
              PolicyEngine · Aristotle mainnet
            </div>
            <h1 className="text-2xl font-semibold text-fg">Spending policies</h1>
            <p className="text-sm text-fg-muted max-w-xl leading-relaxed">
              Every agent is governed by an on-chain policy registered in{' '}
              <code className="font-mono text-xs text-violet-400">PolicyEngine</code>.
              Policies define what an agent can spend, how much per action, and which
              skills it is allowed to call. The contract enforces these limits — no
              off-chain override is possible.
            </p>
          </div>

          {/* Concept cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {POLICY_CONCEPTS.map(({ icon: Icon, title, description, example, color, iconBg }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBg} ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-fg">{title}</h2>
                </div>
                <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
                <code className="block text-[10px] text-fg-faint font-mono">{example}</code>
              </div>
            ))}
          </div>

          {/* How to set a policy */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 space-y-4">
            <h2 className="text-base font-semibold text-fg">Set a policy</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Policies are configured during agent deployment. Use the{' '}
              <strong className="text-fg">New Agent wizard</strong> to define your
              spending limits and skill allowlist, then deploy to Aristotle mainnet in a
              single transaction.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/agents/new"
                className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Deploy a new agent
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <a
                href="https://chainscan.0g.ai/address/0xa8933d96A27BDfFac07C0d7467f3213cb340f550"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--color-line)] px-4 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
              >
                PolicyEngine on chainscan ↗
              </a>
            </div>
          </div>

          {/* Coming soon banner */}
          <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.015] px-6 py-5 flex items-start gap-4">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-400 text-xs font-bold">
              ↗
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-fg">Policy management UI — coming soon</p>
              <p className="text-xs text-fg-muted leading-relaxed">
                A dedicated interface to list, compare, and update policy versions across
                your agents is on the roadmap. For now, open the{' '}
                <Link href="/agents" className="text-accent hover:underline">
                  Agents page
                </Link>{' '}
                and navigate to an agent&apos;s Policy tab to view its current configuration.
              </p>
            </div>
          </div>

          {/* Contract address */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-fg-faint">PolicyEngine contract</p>
              <p className="font-mono text-xs text-violet-400 mt-0.5">
                0xa8933d96A27BDfFac07C0d7467f3213cb340f550
              </p>
            </div>
            <a
              href="https://chainscan.0g.ai/address/0xa8933d96A27BDfFac07C0d7467f3213cb340f550"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-violet-400 hover:text-violet-300"
            >
              View ↗
            </a>
          </div>

        </div>
      </main>
    </>
  );
}
