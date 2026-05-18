import type { Agent, Policy, Receipt, MemoryEntry, SkillManifest, ServiceListing, Run, DashboardStats, HeatmapCell } from './types';

const PROD_EDGE_URL = 'https://apogeeedge-production.up.railway.app';
const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const BASE = envApiUrl || (process.env.NODE_ENV === 'production' ? PROD_EDGE_URL : 'http://localhost:8080');


function normalizeReceipt(row: Record<string, unknown>): Receipt {
  return {
    id: String(row['id'] ?? row['receiptId'] ?? ''),
    agentId: String(row['agentId'] ?? ''),
    agentName: typeof row['agentName'] === 'string' ? row['agentName'] : undefined,
    payerAddress: String(row['payerAddress'] ?? ''),
    payeeAddress: String(row['payeeAddress'] ?? ''),
    amountWei: String(row['amountWei'] ?? row['valueWei'] ?? '0'),
    skillId: typeof row['skillId'] === 'string' ? row['skillId'] : typeof row['actionTag'] === 'string' ? row['actionTag'] : undefined,
    txHash: typeof row['txHash'] === 'string' ? row['txHash'] : undefined,
    storageRoot: typeof row['storageRoot'] === 'string' ? row['storageRoot'] : undefined,
    attestationDigest: typeof row['attestationDigest'] === 'string' ? row['attestationDigest'] : typeof row['payloadHash'] === 'string' ? row['payloadHash'] : undefined,
    status: row['status'] === 'failed' ? 'failed' : row['status'] === 'pending' ? 'pending' : 'confirmed',
    error: typeof row['error'] === 'string' ? row['error'] : undefined,
    createdAt: typeof row['createdAt'] === 'string' ? row['createdAt'] : new Date().toISOString(),
  };
}

function normalizeMemoryEntry(row: Record<string, unknown>, agentId: string): MemoryEntry {
  const updatedAt = typeof row['updatedAt'] === 'string' ? row['updatedAt'] : new Date().toISOString();
  return {
    id: String(row['id'] ?? row['key'] ?? ''),
    agentId: String(row['agentId'] ?? agentId),
    key: String(row['key'] ?? row['id'] ?? ''),
    value: row['value'],
    version: typeof row['version'] === 'number' ? row['version'] : 1,
    anchoredTxHash: typeof row['anchoredTxHash'] === 'string' ? row['anchoredTxHash'] : undefined,
    visibility: row['visibility'] === 'system' || row['visibility'] === 'bootstrap' || row['visibility'] === 'private' ? row['visibility'] : undefined,
    tags: Array.isArray(row['tags']) ? row['tags'].map(String) : undefined,
    storageRoot: typeof row['storageRoot'] === 'string' ? row['storageRoot'] : undefined,
    createdAt: typeof row['createdAt'] === 'string' ? row['createdAt'] : updatedAt,
    updatedAt,
  };
}


function normalizeService(row: Record<string, unknown>): ServiceListing {
  return {
    id: String(row['id'] ?? row['serviceId'] ?? ''),
    providerAddress: String(row['providerAddress'] ?? row['agentId'] ?? '0x0000000000000000000000000000000000000000'),
    name: String(row['name'] ?? row['serviceId'] ?? 'Service'),
    description: String(row['description'] ?? ''),
    modelId: typeof row['modelId'] === 'string' ? row['modelId'] : undefined,
    pricePerTokenWei: String(row['pricePerTokenWei'] ?? row['priceWei'] ?? '0'),
    latencyMs: typeof row['latencyMs'] === 'number' ? row['latencyMs'] : undefined,
    uptime: typeof row['uptime'] === 'number' ? row['uptime'] : undefined,
    tags: Array.isArray(row['tags']) ? row['tags'].map(String) : [],
  };
}

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
    signal: AbortSignal.timeout(8000),
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

export function getAgents(token?: string, params?: { includeHidden?: boolean }): Promise<Agent[]> {
  const qs = new URLSearchParams();
  if (params?.includeHidden) qs.set('includeHidden', 'true');
  const q = qs.toString() ? `?${qs}` : '';
  return apiFetch<Agent[]>(`/v1/agents${q}`, undefined, token);
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

export function hideAgent(id: string, token?: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/v1/agents/${id}/hide`, { method: 'POST' }, token);
}

export function unhideAgent(id: string, token?: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/v1/agents/${id}/unhide`, { method: 'POST' }, token);
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
  params?: { agentId?: string; page?: number; limit?: number; scope?: 'owned' | 'global' },
  token?: string,
): Promise<{ items: Receipt[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.agentId) qs.set('agentId', params.agentId);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.scope) qs.set('scope', params.scope);
  const q = qs.toString() ? `?${qs}` : '';
  return apiFetch<{ items: Record<string, unknown>[]; total?: number }>(`/v1/receipts${q}`, undefined, token)
    .then((data) => ({ items: data.items.map(normalizeReceipt), total: data.total ?? data.items.length }));
}

// ── Memory ────────────────────────────────────────────────

export function getMemory(agentId: string, token?: string): Promise<MemoryEntry[]> {
  return apiFetch<Record<string, unknown>[]>(`/v1/agents/${agentId}/memory`, undefined, token)
    .then((rows) => rows.map((row) => normalizeMemoryEntry(row, agentId)));
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
  return apiFetch<Record<string, unknown>[]>(`/v1/services${q}`).then((rows) => rows.map(normalizeService));
}

export function installSkill(agentId: string, skillId: string, token?: string): Promise<{ installed: boolean }> {
  return apiFetch<{ installed: boolean }>(
    `/v1/agents/${agentId}/skills/${skillId}`,
    { method: 'POST' },
    token,
  );
}


export function getAgentSkills(agentId: string, token?: string): Promise<Array<{ agentId: string; skillId: string; version?: string; installedAt: string }>> {
  return apiFetch<Array<{ agentId: string; skillId: string; version?: string; installedAt: string }>>(`/v1/agents/${agentId}/skills`, undefined, token);
}

// ── Dashboard ─────────────────────────────────────────────

export function getDashboardStats(token?: string): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/v1/stats', undefined, token);
}

export function getReceiptHeatmap(token?: string): Promise<HeatmapCell[]> {
  return apiFetch<HeatmapCell[]>('/v1/receipts/heatmap', undefined, token);
}
