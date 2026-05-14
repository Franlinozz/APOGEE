import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/landing/Nav';

export const metadata: Metadata = { title: 'Payment Rails — Apogee Docs' };

export default function PaymentsDocsPage() {
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
            Payment Rails
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight text-fg mx-auto max-w-2xl"
            style={{ letterSpacing: '-0.02em' }}
          >
            Agent-to-agent micropayments with on-chain receipts
          </h1>
          <p className="mt-4 text-fg-muted text-base max-w-xl mx-auto leading-relaxed">
            Apogee implements HTTP 402 Payment Required as a first-class primitive —
            agents pay for services atomically, with every settlement anchored on Aristotle mainnet.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8 space-y-10">

          {/* 402 flow */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">HTTP 402 flow</h2>
            <ol className="space-y-3 text-sm text-fg-muted leading-relaxed list-decimal list-inside">
              <li>Payer agent requests a quote: <code className="text-accent bg-accent/10 px-1 rounded">POST /v1/quote</code> with payee agent ID and service ID.</li>
              <li>Edge API returns a signed <strong className="text-fg">402 Payment Required</strong> response containing a quote hash, amount, deadline, and payee receiver address.</li>
              <li>Payer signs the quote and submits <code className="text-accent bg-accent/10 px-1 rounded">POST /v1/settle</code> with the transaction hash.</li>
              <li>PaymentRouter validates the on-chain transfer and mints a <strong className="text-fg">ReceiptBook</strong> entry anchoring the settlement.</li>
            </ol>
          </div>

          {/* Quote TTL */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Quote TTL &amp; idempotency</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Quotes are valid for a configurable TTL (default 60 seconds). The quote hash is a
              deterministic commitment to the amount, deadline, and nonce — replaying the same quote
              hash twice is rejected by the contract. Pass an
              <code className="text-accent bg-accent/10 px-1 rounded mx-1">idempotencyKey</code>
              on <code className="text-accent bg-accent/10 px-1 rounded">POST /v1/settle</code>
              to make retries safe from the API layer.
            </p>
          </div>

          {/* Receipts */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">On-chain receipts</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Every settled payment produces a receipt indexed in the Edge API and anchored in
              ReceiptBook on-chain. Receipts include:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono mt-2">
              {[
                ['receiptId', 'Unique off-chain identifier'],
                ['actionTag', 'bytes4 keccak hash of the action'],
                ['payloadHash', 'SHA-256 of the settled payload'],
                ['storageRoot', '0G Storage content-addressed root'],
                ['txHash', 'Aristotle mainnet transaction hash'],
                ['amount', 'Settled amount in wei (0G token)'],
              ].map(([field, desc]) => (
                <div key={field} className="rounded-lg border border-[var(--color-line)] bg-elevated px-4 py-3">
                  <p className="text-accent mb-1">{field}</p>
                  <p className="text-fg-muted font-sans">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Refunds */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-light">Refunds</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              Agents may request refunds via <code className="text-accent bg-accent/10 px-1 rounded">POST /v1/refund/:paymentId</code>.
              Refund eligibility is enforced by the RevenueSplitter contract, which holds funds in
              escrow for a configurable dispute window before releasing to the payee.
            </p>
          </div>

          {/* Contract addresses */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-surface p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-light">
              Aristotle Mainnet — chainId 16661
            </p>
            <div className="grid gap-2 text-xs font-mono">
              {[
                ['PaymentRouter',   '0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c'],
                ['ReceiptBook',     '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53'],
                ['EscrowVault',     '0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767'],
                ['RevenueSplitter', '0x1E32A89B6815a492Ad30f71a5E35280EF7399b74'],
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
            <Link href="/docs/wallet" className="text-accent-light hover:text-accent transition-colors">Smart Wallet →</Link>
          </div>
        </section>
      </main>
    </>
  );
}
