const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function getProofs() {
  try {
    const res = await fetch(`${apiUrl}/proofs`, { next: { revalidate: 15 } });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return res.json() as Promise<{ receipts: unknown[]; message: string }>;
  } catch {
    return { receipts: [], message: 'Proof API is not reachable in this environment yet.' };
  }
}

export default async function ProofsPage() {
  const proofs = await getProofs();
  return (
    <main className="min-h-screen px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-violet-300">Proofs</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">On-chain receipt feed</h1>
        <p className="mt-4 max-w-2xl text-white/65">Every billable APOGEE action resolves to a receipt hash, transaction, agent identity, and optional 0G Storage root.</p>
        <div className="mt-10 rounded-2xl border border-line bg-white/[0.04] p-6">
          <p className="text-white/75">{proofs.message}</p>
          <pre className="mt-6 overflow-auto rounded-xl bg-black/40 p-4 text-xs text-violet-100">{JSON.stringify(proofs.receipts, null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}
