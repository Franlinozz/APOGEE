import { Topbar } from '@/components/shell/Topbar';

export const metadata = { title: 'Apogee Pilot' };

export default function ApogeePilotPage() {
  return (
    <>
      <Topbar title="Apogee Pilot" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl py-16 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-xl)] bg-accent/10">
            <span className="text-2xl">🚀</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-fg" style={{ letterSpacing: '-0.02em' }}>
            Apogee Pilot
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            Coming soon. The guided AI co-pilot experience for Apogee Protocol.
          </p>
        </div>
      </main>
    </>
  );
}
