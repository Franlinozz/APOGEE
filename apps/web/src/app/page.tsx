import Link from 'next/link';

const pillars = ['Smart wallet policy engine', 'Encrypted 0G memory', 'On-chain receipts', 'Paid skills marketplace'];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#2b1f63,transparent_36rem)]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-20">
        <div className="mb-6 inline-flex w-fit rounded-full border border-line bg-white/5 px-4 py-2 text-sm text-violet-100">Built for 0G Galileo testnet</div>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">The runtime layer for autonomous agents on 0G.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">APOGEE gives agents wallets, policy, memory, payments, skills, compute, and verifiable receipts — in one developer-grade control plane.</p>
        <div className="mt-10 flex gap-3">
          <Link href="/proofs" className="rounded-xl bg-white px-5 py-3 font-medium text-ink hover:bg-violet-100">View proofs</Link>
          <a href="https://github.com/Franlinozz/APOGEE" className="rounded-xl border border-line px-5 py-3 font-medium text-white/85 hover:bg-white/10">GitHub</a>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-4">
          {pillars.map((pillar) => <div key={pillar} className="rounded-2xl border border-line bg-white/[0.04] p-5 shadow-glow"><p className="font-medium">{pillar}</p></div>)}
        </div>
      </section>
    </main>
  );
}
