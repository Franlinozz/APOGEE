import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 60;

interface Stats {
  receipts: number;
  agents: number;
  totalFlowedWei: string;
}

async function fetchFromEdge(): Promise<Stats> {
  const edgeUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
  const res = await fetch(`${edgeUrl}/v1/stats`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Edge returned ${res.status}`);
  return res.json() as Promise<Stats>;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const stats = await fetchFromEdge();
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    /* Edge is not reachable in this environment — return safe zeros */
    const fallback: Stats = {
      receipts: 0,
      agents: 0,
      totalFlowedWei: '0',
    };
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' },
    });
  }
}
