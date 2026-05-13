import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';

export const metadata: Metadata = { title: 'Smart Wallet — Apogee Docs' };

export default function WalletDocsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-14">
        <section
          className="pt-20 pb-14 text-center px-4"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,95,241,0.14) 0%, transparent 70%)',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400 mb-4">
            Smart Wallet
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight text-white mx-auto max-w-2xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            ERC-4337 Smart Accounts for autonomous agents
          </h1>
          <p className="mt-4 text-white/50 text-base max-w-xl mx-auto leading-relaxed">
            Every Apogee agent gets its own on-chain smart account with programmable
            spending policies, daily caps, and cryptographic ownership proofs.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8 space-y-10">

          {/* How it works */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">How it works</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              When you deploy an agent, Apogee calls <code className="text-violet-300 bg-violet-500/10 px-1 rounded">AccountFactory.createAccount(owner, salt)</code> on
              Aristotle mainnet (chainId 16661). This deploys a minimal ERC-4337 proxy whose address is
              deterministic — you can fund it before the account even exists on-chain.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              The predicted address is returned immediately after you start the deployment wizard, so
              you can top up the account before confirming the transaction.
            </p>
          </div>

          {/* Spending policies */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Spending policies</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Each agent is governed by a <strong className="text-white/80">PolicyEngine</strong> rule set stored on-chain.
              Policies enforce hard limits at the smart account level — not enforced by the API, but by the contract itself.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono mt-2">
              {[
                ['maxPerTxWei', 'Maximum 0G tokens per single transaction'],
                ['maxPerDayWei', 'Rolling 24-hour spending cap'],
                ['active', 'Toggle agent on/off without removing funds'],
                ['allowedSkills', 'Whitelist of skill addresses the agent may call'],
              ].map(([field, desc]) => (
                <div key={field} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                  <p className="text-violet-300 mb-1">{field}</p>
                  <p className="text-white/45 font-sans">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* On-chain identity */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">On-chain identity</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Each agent also receives an <strong className="text-white/80">AgentIdentity NFT</strong> (ERC-721) at
              mint time. The NFT stores a <code className="text-violet-300 bg-violet-500/10 px-1 rounded">metadataRoot</code> hash
              pointing to the agent&rsquo;s configuration in 0G decentralised storage, and a
              <code className="text-violet-300 bg-violet-500/10 px-1 rounded"> publicKey</code> used for verifying signed receipts.
            </p>
          </div>

          {/* Contract addresses */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400">
              Aristotle Mainnet — chainId 16661
            </p>
            <div className="grid gap-2 text-xs font-mono">
              {[
                ['AccountFactory', '0xABc44aF98e6d873C0700c9B687fbf3Be560cba90'],
                ['AgentIdentity',  '0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3'],
                ['PolicyEngine',   '0xa8933d96A27BDfFac07C0d7467f3213cb340f550'],
              ].map(([name, addr]) => (
                <a
                  key={name}
                  href={`https://chainscan.0g.ai/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 hover:border-violet-500/30 transition-colors"
                >
                  <span className="text-white/60">{name}</span>
                  <span className="text-violet-400 text-[10px]">{(addr ?? '').slice(0, 10)}…</span>
                </a>
              ))}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href="/docs" className="text-violet-400 hover:text-violet-300 transition-colors">← Back to docs</Link>
            <Link href="/docs/payments" className="text-violet-400 hover:text-violet-300 transition-colors">Payment Rails →</Link>
          </div>
        </section>
      </main>
    </>
  );
}
