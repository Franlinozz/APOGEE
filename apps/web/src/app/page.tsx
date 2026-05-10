import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { FeaturePanels } from '@/components/landing/FeaturePanels';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ZeroGStack } from '@/components/landing/ZeroGStack';
import { NumbersSection } from '@/components/landing/NumbersSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { Footer } from '@/components/landing/Footer';

/*
 * ReceiptsTicker: client-only WebSocket component.
 * ssr:false — no server-side attempt; the Suspense fallback holds the
 * exact same height so CLS stays at 0.
 */
const ReceiptsTicker = dynamic(
  () => import('@/components/landing/ReceiptsTicker').then((m) => m.ReceiptsTicker),
  { ssr: false },
);

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        {/* ── Above fold: zero client JS ── */}
        <Hero />

        {/* ── Live receipt ticker ─────────
            SSR fallback: empty snapshot satisfies the static shape so CLS = 0. */}
        <Suspense fallback={<div className="h-[49px] border-y border-[var(--color-line)]" />}>
          <ReceiptsTicker snapshot={[]} />
        </Suspense>

        {/* ── Rest of page: server components ── */}
        <FeaturePanels />
        <HowItWorks />
        <ZeroGStack />

        <Suspense
          fallback={
            <div className="py-24">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid gap-5 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-32 animate-pulse rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface" />
                  ))}
                </div>
              </div>
            </div>
          }
        >
          {/* NumbersSection is async (fetch) — wrap in Suspense */}
          <NumbersSection />
        </Suspense>

        <FinalCta />
      </main>

      <Footer />
    </>
  );
}
