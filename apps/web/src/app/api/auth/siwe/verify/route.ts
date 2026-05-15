import { type NextRequest, NextResponse } from 'next/server';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const EDGE_URL = process.env.EDGE_API_URL?.trim().replace(/\/$/, '') || process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '') || PROD_EDGE_URL;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const upstream = await fetch(`${EDGE_URL}/v1/auth/siwe/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
