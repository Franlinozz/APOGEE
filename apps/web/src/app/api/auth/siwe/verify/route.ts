import { type NextRequest, NextResponse } from 'next/server';

const EDGE_URL = process.env.EDGE_API_URL?.replace(/\/$/, '');

export async function POST(request: NextRequest) {
  if (!EDGE_URL) {
    return NextResponse.json(
      { title: 'Auth service unavailable', detail: 'EDGE_API_URL is not configured on this deployment.' },
      { status: 503 },
    );
  }
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
