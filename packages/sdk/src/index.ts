export interface ApogeeClientOptions {
  baseUrl: string;
  jwt?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type AgentCreateInput = { name?: string; policy?: Json; skills?: string[]; metadataRoot?: string };
export type RunInput = { goal: string; inputs?: unknown; mode?: 'plan-act' | 'fixed' };
export type ReceiptListInput = { agentId?: string; limit?: number; cursor?: string };
export type QuoteInput = { payeeAgentId: string; payerAgentId?: string; serviceId: string; requestedAmount?: string | number | bigint; ttlSec?: number };
export type SettleInput = { quoteHash: string; payerSignature?: string; txHash?: string; permitSignature?: string; clientReceiptId?: string; payerAgentId?: string };

class HttpClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: ApogeeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.options.jwt ? { authorization: `Bearer ${this.options.jwt}` } : {}),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
    const response = await this.fetchImpl(new URL(path, this.options.baseUrl), init);
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!response.ok && response.status !== 402) throw new Error(typeof parsed?.detail === 'string' ? parsed.detail : `APOGEE request failed: ${response.status}`);
    return parsed as T;
  }
}

export class ApogeeClient {
  private readonly http: HttpClient;

  constructor(private readonly options: ApogeeClientOptions) {
    this.http = new HttpClient(options);
  }

  readonly agents = {
    create: (input: AgentCreateInput): Promise<unknown> => this.http.request('POST', '/v1/agents', { metadataRoot: input.metadataRoot, policy: input.policy, skills: input.skills, name: input.name }),
    list: (): Promise<unknown[]> => this.http.request('GET', '/v1/agents'),
    get: (agentId: string): Promise<unknown> => this.http.request('GET', `/v1/agents/${encodeURIComponent(agentId)}`),
    run: (agentId: string, input: RunInput): Promise<unknown> => this.http.request('POST', `/v1/agents/${encodeURIComponent(agentId)}/run`, input),
  };

  readonly receipts = {
    list: (input: ReceiptListInput = {}): Promise<unknown> => {
      const query = new URLSearchParams();
      if (input.agentId) query.set('agentId', input.agentId);
      if (input.limit) query.set('limit', String(input.limit));
      if (input.cursor) query.set('cursor', input.cursor);
      return this.http.request('GET', `/v1/receipts${query.size ? `?${query}` : ''}`);
    },
    get: (receiptId: string): Promise<unknown> => this.http.request('GET', `/v1/receipts/${encodeURIComponent(receiptId)}`),
  };

  memory(agentId: string): { set(key: string, value: Json, tags?: string[]): Promise<unknown>; get(key: string): Promise<unknown>; search(query: string, limit?: number): Promise<unknown>; delete(key: string): Promise<unknown> } {
    const encoded = encodeURIComponent(agentId);
    return {
      set: (key, value, tags = []) => this.http.request('PUT', `/v1/memory/${encoded}/${encodeURIComponent(key)}`, { value, tags }),
      get: (key) => this.http.request('GET', `/v1/memory/${encoded}/${encodeURIComponent(key)}`),
      search: (query, limit = 10) => this.http.request('POST', `/v1/memory/${encoded}/search`, { query, limit }),
      delete: (key) => this.http.request('DELETE', `/v1/memory/${encoded}/${encodeURIComponent(key)}`),
    };
  }

  quote(input: QuoteInput): Promise<unknown> {
    return this.http.request('POST', '/v1/quote', input);
  }

  settle(input: SettleInput): Promise<unknown> {
    return this.http.request('POST', '/v1/settle', input);
  }

  stream(agentId: string, onEvent: (event: unknown) => void): WebSocket {
    const base = new URL(this.options.baseUrl);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = `/v1/stream/${encodeURIComponent(agentId)}`;
    const protocols = this.options.jwt ? ['bearer', this.options.jwt] : undefined;
    const socket = new WebSocket(base, protocols);
    socket.addEventListener('message', (message) => onEvent(JSON.parse(String(message.data))));
    return socket;
  }
}

// Thin public wrapper over the generated OpenAPI surface. Business rules stay server-side.
export const Apogee = {
  client(options: ApogeeClientOptions): ApogeeClient {
    return new ApogeeClient(options);
  },
};

export default Apogee;
