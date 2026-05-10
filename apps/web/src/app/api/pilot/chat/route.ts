import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';

const EDGE_URL = process.env.EDGE_API_URL?.replace(/\/$/, '');

export async function POST(request: NextRequest) {
  if (!EDGE_URL) {
    const errData = JSON.stringify({ message: 'Pilot service not configured.' });
    return new Response(`event: error\ndata: ${errData}\n\n`, {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('apogee-jwt')?.value;
  const body = await request.text();

  const upstream = await fetch(`${EDGE_URL}/v1/pilot/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
