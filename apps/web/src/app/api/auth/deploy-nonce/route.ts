import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const EDGE = process.env['EDGE_API_URL']?.trim().replace(/\/$/, '') || process.env['NEXT_PUBLIC_API_URL']?.trim().replace(/\/$/, '') || PROD_EDGE_URL;

export async function GET() {
  const token = cookies().get('apogee-jwt')?.value;
  if (!token) return NextResponse.json({ title: 'Not authenticated', detail: 'Sign in with your wallet first.' }, { status: 401 });

  const upstream = await fetch(`${EDGE}/v1/auth/deploy-nonce`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
