import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const EDGE = process.env['EDGE_API_URL']?.trim().replace(/\/$/, '') || process.env['NEXT_PUBLIC_API_URL']?.trim().replace(/\/$/, '') || PROD_EDGE_URL;

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { skillId: string } }) {
  const token = cookies().get('apogee-jwt')?.value;
  if (!token) return NextResponse.json({ title: 'Not authenticated', detail: 'Sign in with your wallet first.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ title: 'Invalid request body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${EDGE}/v1/skills/${encodeURIComponent(params.skillId)}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Edge API unreachable';
    return NextResponse.json({ title: 'Edge API error', detail: message }, { status: 502 });
  }
}
