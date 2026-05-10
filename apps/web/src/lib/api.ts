import type { Agent, Policy, Receipt, MemoryEntry, SkillManifest, ServiceListing, Run, DashboardStats, HeatmapCell } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly code?: string,
  ) {
    super(title);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let title = res.statusText;
    let detail: string | undefined;
    let code: string | undefined;
    try {
      const body = await res.json();
      title = body.title ?? title;
      detail = body.detail;
      code = body.code;
    } catch {}
    throw new ApiError(res.status, title, detail, code);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────
// SIWE calls go through same-origin Next.js proxy routes so the browser never
// needs to know the Edge API URL and no CORS preflight is required.

async function authFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let title = res.statusText;
    let detail: string | undefined;
    try {
      const json = await res.json();
      title = json.title ?? title;
      detail = json.detail;
    } catch {}
    throw new ApiError(res.status, title, detail);
  }
  return res.json() as Promise<T>;
}

export function siweNonce(address: string, domain: string, uri: string, chainId: number) {
  return authFetch<{ nonce: string; message: string }>(
    '/api/auth/siwe/nonce',
    { address, domain, uri, chainId },
  );
}

export function siweVerify(message: string, signature: string) {
  return authFetch<{ token: string; address: string }>(
    '/api/auth/siwe/verify',
    { message, signature },
  );
}

// ── Agents ────────────────────────────────────────────────

export function getAgents(token?: string): Promise<Agent[]> {
  return apiFetch<Agent[]>('/v1/agents', undefined, token);
}

export function getAgent(id: string, token?: string): Promise<Agent> {
  return apiFetch<Agent>(`/v1/agents/${id}`, undefined, token);
}

export function createAgent(data: Partial<Agent>, token?: string): Promise<Agent> {
  return apiFetch<Agent>('/v1/agents', { method: 'POST', body: JSON.stringify(data) }, token);
}

export function updateAgent(id: string, data: Partial<Agent>, token?: string): Promise<Agent> {
  return apiFetch<Agent>(`/v1/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}

// ── Policies ──────────────────────────────────────────────

export function getPolicy(id: string, token?: string): Promise<Policy> {
  return apiFetch<Policy>(`/v1/policies/${id}`, undefined, token);
}

export function createPolicy(data: Partial<Policy>, token?: string): Promise<Policy> {
  return apiFetch<Policy>('/v1/policies', { method: 'POST', body: JSON.stringify(data) }, token);
}

// ── Runs ──────────────────────────────────────────────────

export function getRuns(agentId: string, token?: string): Promise<Run[]> {
  return apiFetch<Run[]>(`/v1/agents/${agentId}/runs`, undefined, token);
}

// ── Receipts ──────────────────────────────────────────────

export function getReceipts(
  params?: { agentId?: string; page?: number; limit?: number },
  token?: string,
): Promise<{ items: Receipt[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.agentId) qs.set('agentId', params.agentId);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const q = qs.toString() ? `?${qs}` : '';
  return apiFetch<{ items: Receipt[]; total: number }>(`/v1/receipts${q}`, undefined, token);
}

// ── Memory ────────────────────────────────────────────────

export function getMemory(agentId: string, token?: string): Promise<MemoryEntry[]> {
  return apiFetch<MemoryEntry[]>(`/v1/agents/${agentId}/memory`, undefined, token);
}

export function searchMemory(agentId: string, query: string, token?: string): Promise<MemoryEntry[]> {
  return apiFetch<MemoryEntry[]>(
    `/v1/agents/${agentId}/memory/search?q=${encodeURIComponent(query)}`,
    undefined,
    token,
  );
}

export function anchorMemoryEntry(agentId: string, entryId: string, token?: string): Promise<{ txHash: string }> {
  return apiFetch<{ txHash: string }>(`/v1/agents/${agentId}/memory/${entryId}/anchor`, { method: 'POST' }, token);
}

// ── Skills & Services ─────────────────────────────────────

export function getSkills(params?: { tier?: string; category?: string }): Promise<SkillManifest[]> {
  const qs = new URLSearchParams();
  if (params?.tier) qs.set('tier', params.tier);
  if (params?.category) qs.set('category', params.category);
  const q = qs.toString() ? `?${qs}` : '';
  return apiFetch<SkillManifest[]>(`/v1/skills${q}`);
}

export function getServices(params?: { tags?: string }): Promise<ServiceListing[]> {
  const qs = new URLSearchParams();
  if (params?.tags) qs.set('tags', params.tags);
  const q = qs.toString() ? `?${qs}` : '';
  return apiFetch<ServiceListing[]>(`/v1/services${q}`);
}

export function installSkill(agentId: string, skillId: string, token?: string): Promise<{ installed: boolean }> {
  return apiFetch<{ installed: boolean }>(
    `/v1/agents/${agentId}/skills/${skillId}`,
    { method: 'POST' },
    token,
  );
}

// ── Dashboard ─────────────────────────────────────────────

export async function getDashboardStats(token?: string): Promise<DashboardStats> {
  try {
    return await apiFetch<DashboardStats>('/v1/stats', undefined, token);
  } catch {
    return { totalAgents: 0, totalReceipts: 0, totalVolumeWei: '0', activeAgents: 0 };
  }
}

export async function getReceiptHeatmap(token?: string): Promise<HeatmapCell[]> {
  try {
    return await apiFetch<HeatmapCell[]>('/v1/receipts/heatmap', undefined, token);
  } catch {
    return [];
  }
}
