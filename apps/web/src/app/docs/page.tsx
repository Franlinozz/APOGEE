import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';

export const metadata: Metadata = { title: 'Documentation — Apogee Protocol' };

const CARDS = [
  {
    href: '/proofs',
    external: false,
    title: 'Live On-chain Proofs',
    description:
      'See real-time receipts from the three demo agents running on Aristotle mainnet. Verify every action on chainscan.0g.ai.',
    badge: 'Live',
    badgeColor: 'bg-green-500/15 text-green-400',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE/blob/main/docs/JUDGE_GUIDE.md',
    external: true,
    title: 'Judge Guide',
    description:
      'QA checklist, step-by-step verification walkthrough, and known limitations. Start here if you are evaluating Apogee.',
    badge: 'Judges',
    badgeColor: 'bg-violet-500/15 text-violet-400',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE/blob/main/docs/ARCHITECTURE.md',
    external: true,
    title: 'Architecture',
    description:
      'Four-layer system overview, Mermaid sequence diagrams (skill execution, heartbeat loop, SIWE auth), and package dependency graph.',
    badge: 'Technical',
    badgeColor: 'bg-blue-500/15 text-blue-400',
  },
  {
    href: 'https://apogeeedge-production.up.railway.app/docs/api',
    external: true,
    title: 'API Reference',
    description:
      'Interactive Swagger UI (OpenAPI 3.1) for the full Edge API — auth, agents, receipts, skills, billing, WebSocket, and SSE.',
    badge: 'API',
    badgeColor: 'bg-amber-500/15 text-amber-400',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE/blob/main/docs/DEPLOYMENT.md',
    external: true,
    title: 'Deployment Guide',
    description:
      'Vercel + Railway setup, env var names, heartbeat pause/unpause, network config, and rollback procedure.',
    badge: 'Ops',
    badgeColor: 'bg-cyan-500/15 text-cyan-400',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE/blob/main/docs/TUTORIAL.md',
    external: true,
    title: 'Tutorial: Build a Paid Agent',
    description:
      'Deploy a translator agent that charges callers 0.0001 0G per call. Step-by-step from clone to on-chain receipt in 15 minutes.',
    badge: 'Tutorial',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE',
    external: true,
    title: 'GitHub Repository',
    description:
      'Full monorepo source: 9 Solidity contracts, Fastify Edge API, Next.js frontend, BullMQ runtime workers, 22 skills.',
    badge: 'Source',
    badgeColor: 'bg-white/10 text-white/50',
  },
  {
    href: 'https://github.com/Franlinozz/APOGEE/blob/main/docs/REVIEWER.md',
    external: true,
    title: 'Extended Reviewer Guide',
    description:
      'Detailed 30-minute walkthrough for judges — contract verification, storage proofs, SIWE auth, scoring criteria mapping.',
    badge: 'Judges',
    badgeColor: 'bg-violet-500/15 text-violet-400',
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-14">
        {/* Hero */}
        <section
          className="pt-20 pb-14 text-center px-4"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,95,241,0.14) 0%, transparent 70%)',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400 mb-4">
            Documentation
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight text-white mx-auto max-w-2xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            Everything you need to understand and build on Apogee Protocol
          </h1>
          <p className="mt-4 text-white/50 text-base max-w-xl mx-auto leading-relaxed">
            Start with the Judge Guide for a guided walkthrough, or explore the
            architecture, API reference, and tutorial at your own pace.
          </p>
        </section>

        {/* Cards grid */}
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => {
              const inner = (
                <div className="group relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 h-full flex flex-col gap-3 hover:border-violet-500/40 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white leading-tight">{card.title}</h2>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                  </div>
                  <p className="text-xs text-white/45 leading-relaxed flex-1">{card.description}</p>
                  <span className="text-xs text-violet-400 group-hover:text-violet-300 transition-colors">
                    {card.external ? 'Open ↗' : 'View →'}
                  </span>
                </div>
              );

              return card.external ? (
                <a
                  key={card.title}
                  href={card.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {inner}
                </a>
              ) : (
                <Link key={card.title} href={card.href} className="block">
                  {inner}
                </Link>
              );
            })}
          </div>

          {/* Quick contract reference */}
          <div className="mt-14 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-1">
                Aristotle Mainnet — chainId 16661
              </p>
              <h2 className="text-sm font-semibold text-white">Contract quick-reference</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs font-mono">
              {[
                ['ReceiptBook',    '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53'],
                ['AgentIdentity',  '0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3'],
                ['PolicyEngine',   '0xa8933d96A27BDfFac07C0d7467f3213cb340f550'],
                ['PaymentRouter',  '0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c'],
                ['AccountFactory', '0xABc44aF98e6d873C0700c9B687fbf3Be560cba90'],
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
            <p className="text-[11px] text-white/30">
              All 9 contracts listed in{' '}
              <Link href="/proofs?tab=contracts" className="text-violet-400 hover:text-violet-300 underline">
                /proofs → Contracts tab
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
