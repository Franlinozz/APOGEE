import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';

export const metadata: Metadata = { title: 'Encrypted Memory — Apogee Docs' };

export default function MemoryDocsPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen pt-14">
        <section
          className="pt-20 pb-14 text-center px-4"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,95,241,0.12) 0%, transparent 70%)',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-light mb-4">
            Encrypted Memory
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight text-fg mx-auto max-w-2xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            Private, verifiable agent state on decentralised storage
          </h1>
          <p className="mt-4 text-fg-muted text-base max-w-xl mx-auto leading-relaxed">
            Agent memory is encrypted with AES-256-GCM, uploaded to 0G Storage, and
            anchored on-chain via ReceiptBook — so it&rsquo;s private, tamper-evident, and persistent.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8 space-y-10">

          {/* Write path */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Write path</h2>
            <ol className="space-y-3 text-sm text-fg-muted leading-relaxed list-decimal list-inside">
              <li>Agent calls <code className="text-accent bg-accent/10 px-1 rounded">PUT /v1/memory/:agentId/:key</code> with a JSON value and optional tags.</li>
              <li>Edge API encrypts the value with <strong className="text-fg">AES-256-GCM</strong> using a key derived from the agent&rsquo;s identity.</li>
              <li>The ciphertext is uploaded to <strong className="text-fg">0G Storage</strong> and a content-addressed storage root is returned.</li>
              <li>The storage root is anchored on-chain via a <code className="text-accent bg-accent/10 px-1 rounded">memory.write</code> receipt in ReceiptBook.</li>
            </ol>
          </div>

          {/* Read and search */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Read &amp; search</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Authenticated reads return the decrypted JSON value. The
              <code className="text-accent bg-accent/10 px-1 rounded mx-1">POST /v1/memory/:agentId/search</code>
              endpoint accepts a free-text query and returns the top matching keys, enabling
              agents to build semantic context windows from long-running memory stores.
            </p>
            <div className="rounded-lg border border-[var(--color-line)] bg-elevated px-4 py-3 font-mono text-xs text-fg-muted">
              <p className="text-accent mb-1">POST /v1/memory/:agentId/search</p>
              <p>{`{ "query": "last user preference", "limit": 10 }`}</p>
            </div>
          </div>

          {/* Versioning and proofs */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Versioning &amp; proofs</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Every write produces an immutable receipt with the 0G storage root. Because the
              root is a content hash, you can verify at any time that the memory content matches
              what was anchored on-chain — no trust required.
            </p>
            <p className="text-sm text-fg-muted leading-relaxed">
              The <Link href="/proofs" className="text-accent-light hover:text-accent">Live Proofs</Link> page
              shows recent memory writes from the three demo agents, including their storage roots and
              transaction hashes on Aristotle mainnet.
            </p>
          </div>

          {/* Tags */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Tags</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Every memory entry supports an array of string tags (e.g. <code className="text-accent bg-accent/10 px-1 rounded">[&quot;preference&quot;, &quot;user:0xabc&quot;]</code>).
              Tags enable efficient filtering without a full-text scan and are indexed in the Edge API&rsquo;s
              in-memory store for sub-millisecond lookups.
            </p>
          </div>

          {/* Contract */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-light">
              Aristotle Mainnet — chainId 16661
            </p>
            <div className="grid gap-2 text-xs font-mono">
              {[
                ['ReceiptBook', '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53'],
              ].map(([name, addr]) => (
                <a
                  key={name}
                  href={`https://chainscan.0g.ai/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-elevated px-4 py-2.5 hover:border-[var(--color-line-accent)] transition-colors"
                >
                  <span className="text-fg-muted">{name}</span>
                  <span className="text-accent-light text-[10px]">{(addr ?? '').slice(0, 10)}…</span>
                </a>
              ))}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href="/docs" className="text-accent-light hover:text-accent transition-colors">← Back to docs</Link>
            <Link href="/docs/payments" className="text-accent-light hover:text-accent transition-colors">Payment Rails →</Link>
          </div>
        </section>
      </main>
    </>
  );
}
