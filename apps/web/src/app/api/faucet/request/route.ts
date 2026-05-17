import { type NextRequest, NextResponse } from 'next/server';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const EDGE = process.env['EDGE_API_URL']?.trim().replace(/\/$/, '') || PROD_EDGE_URL;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const upstream = await fetch(`${EDGE}/v1/faucet/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
