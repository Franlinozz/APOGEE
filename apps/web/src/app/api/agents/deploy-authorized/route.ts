import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

const EDGE = process.env['EDGE_API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';

export async function POST(req: NextRequest) {
  const token = cookies().get('apogee-jwt')?.value;
  if (!token) return NextResponse.json({ title: 'Not authenticated', detail: 'Sign in with your wallet first.' }, { status: 401 });

  const body = await req.text();
  const upstream = await fetch(`${EDGE}/v1/agents/deploy-authorized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
