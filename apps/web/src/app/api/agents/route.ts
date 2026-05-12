import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const EDGE = process.env['EDGE_API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080';

export async function POST(req: NextRequest) {
  const token = cookies().get('apogee-jwt')?.value;
  if (!token) {
    return NextResponse.json(
      { title: 'Not authenticated', detail: 'Sign in with your wallet first.' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ title: 'Invalid request body' }, { status: 400 });
  }

  // Map wizard payload to Edge schema:
  //   name → metadataRoot (Edge hashes it to bytes32 internally)
  //   Other wizard fields (description, dailyCap, etc.) are stored server-side later
  const edgeBody: Record<string, unknown> = {};
  if (typeof body['name'] === 'string' && body['name']) {
    edgeBody['metadataRoot'] = body['name'];
  }
  if (typeof body['metadataRoot'] === 'string') {
    edgeBody['metadataRoot'] = body['metadataRoot'];
  }

  try {
    const upstream = await fetch(`${EDGE}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(edgeBody),
    });

    const data: unknown = await upstream.json();

    if (!upstream.ok) {
      const err = data as { title?: string; detail?: string; message?: string };
      const title = err.title ?? err.message ?? upstream.statusText;
      const detail = err.detail;
      return NextResponse.json({ title, detail }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Edge API unreachable';
    return NextResponse.json(
      { title: 'Edge API error', detail: message },
      { status: 502 },
    );
  }
}
