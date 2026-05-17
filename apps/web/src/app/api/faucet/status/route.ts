import { type NextRequest, NextResponse } from 'next/server';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const EDGE = process.env['EDGE_API_URL']?.trim().replace(/\/$/, '') || PROD_EDGE_URL;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') ?? '';
  const upstream = await fetch(`${EDGE}/v1/faucet/status?address=${encodeURIComponent(address)}`);
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
