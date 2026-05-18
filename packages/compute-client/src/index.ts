import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// import type only — the runtime value is loaded lazily via createRequire to
// avoid the broken ESM chunk in @0gfoundation/0g-compute-ts-sdk@0.8.2 which
// re-exports named symbols from a CJS bundle (index-7abe02cb.js).
import type { ZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { JsonRpcProvider, Wallet, formatEther } from 'ethers';
import pino, { type Logger } from 'pino';
import { z } from 'zod';

export type Address = `0x${string}`;
export type ServiceType = 'chatbot' | 'text-to-image' | 'speech-to-text';

export interface Provider {
  address: Address;
  serviceType: ServiceType | string;
  endpoint?: string | undefined;
  model?: string | undefined;
  teeVerified: boolean;
}

export interface ComputeTxReceipt {
  hash: string | null;
  confirmed: boolean;
  operation: 'deposit' | 'refund' | 'withdraw' | 'ensureProvider';
}

export interface ComputeMetadata {
  provider: Address;
  model?: string | undefined;
  chatId?: string | undefined;
  providerSig?: string | undefined;
  tokenUsage?: unknown;
  attestationDigest?: string | undefined;
  receiptPayload: {
    serviceType: ServiceType;
    provider: Address;
    chatId?: string | undefined;
    usage?: unknown;
    attestationDigest?: string | undefined;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string | undefined;
  stream?: boolean | undefined;
  sealed?: boolean | undefined;
  provider?: Address | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export interface ChatResult extends ComputeMetadata {
  content: string;
  reasoningContent?: string | undefined;
}

export interface ChatStreamChunk {
  delta: string;
  done: boolean;
  chatId?: string | undefined;
  metadata?: ComputeMetadata | undefined;
}

export interface EmbedOptions {
  model?: string | undefined;
  provider?: Address | undefined;
  sealed?: boolean | undefined;
}

export interface ImageOptions {
  size?: string | undefined;
  n?: number | undefined;
  model?: string | undefined;
  provider?: Address | undefined;
  sealed?: boolean | undefined;
}

export interface ImageResult extends ComputeMetadata {
  urls: string[];
  storageRoots: string[];
}

export interface TranscribeOptions {
  model?: string | undefined;
  provider?: Address | undefined;
  sealed?: boolean | undefined;
}

export interface TranscribeResult extends ComputeMetadata {
  text: string;
  segments: unknown[];
}

export interface ComputeClientOptions {
  rpcUrl: string;
  signerKey: string;
  defaultProvider?: Address | undefined;
  sealedMode?: boolean | undefined;
  logger?: Logger | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export class ComputeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ComputeError';
  }
}

const addressSchema = z.custom<Address>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value));
const constructorSchema = z.object({
  rpcUrl: z.string().url(),
  signerKey: z.string().min(32),
  defaultProvider: addressSchema.optional(),
  sealedMode: z.boolean().optional(),
  logger: z.custom<Logger>().optional(),
  fetchImpl: z.custom<typeof fetch>().optional(),
});
const amountSchema = z.bigint().positive();
const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});
const chatOptionsSchema = z.object({
  messages: z.array(messageSchema).min(1),
  model: z.string().optional(),
  stream: z.boolean().optional(),
  sealed: z.boolean().optional(),
  provider: addressSchema.optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
});
const embedInputSchema = z.union([z.string(), z.array(z.string()).min(1)]);
const imageOptionsSchema = z
  .object({
    size: z.string().optional(),
    n: z.number().int().positive().max(10).optional(),
    model: z.string().optional(),
    provider: addressSchema.optional(),
    sealed: z.boolean().optional(),
  })
  .optional();
const transcribeInputSchema = z.union([z.instanceof(Uint8Array), z.instanceof(URL)]);
const transcribeOptionsSchema = z
  .object({ model: z.string().optional(), provider: addressSchema.optional(), sealed: z.boolean().optional() })
  .optional();

const chatResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullable().optional(), reasoning_content: z.string().nullable().optional() }).optional(),
      delta: z.object({ content: z.string().nullable().optional(), reasoning_content: z.string().nullable().optional() }).optional(),
      text: z.string().optional(),
    }),
  ),
  usage: z.unknown().optional(),
});
const imageResponseSchema = z.object({
  data: z.array(z.object({ url: z.string().url().optional(), rootHash: z.string().optional() })),
});
const transcriptionSchema = z.object({
  text: z.string(),
  segments: z.array(z.unknown()).optional(),
  usage: z.unknown().optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const bigintTo0g = (amount: bigint): number => Number(formatEther(amount));

export class ComputeClient {
  private readonly signer: Wallet;
  private readonly defaultProvider: Address | undefined;
  private readonly sealedMode: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private broker?: ZGComputeNetworkBroker;
  private readonly acknowledged = new Set<string>();
  private readonly attestationCache = new Map<string, string>();

  constructor(options: ComputeClientOptions) {
    const parsed = constructorSchema.parse(options);
    this.signer = new Wallet(parsed.signerKey, new JsonRpcProvider(parsed.rpcUrl));
    this.defaultProvider = parsed.defaultProvider;
    this.sealedMode = parsed.sealedMode ?? false;
    this.fetchImpl = parsed.fetchImpl ?? fetch;
    this.logger = parsed.logger ?? pino({ name: 'apogee-compute-client' });
  }

  async listProviders(): Promise<Provider[]> {
    try {
      const broker = await this.getBroker();
      const services = (await broker.inference.listService()) as unknown[];
      return services.map((service) => this.parseService(service)).filter((provider) => provider.address !== '0x');
    } catch (error) {
      throw new ComputeError('LIST_PROVIDERS_FAILED', 'Failed to list 0G compute providers', error);
    }
  }

  async ensureProvider(address: Address): Promise<void> {
    const providerAddress = addressSchema.parse(address);
    if (this.acknowledged.has(providerAddress)) return;
    try {
      const broker = await this.getBroker();
      const already = await broker.inference.acknowledged(providerAddress).catch(() => false);
      if (!already) await broker.inference.acknowledgeProviderSigner(providerAddress);
      this.acknowledged.add(providerAddress);
      this.logger.info({ provider: providerAddress }, '0G compute provider acknowledged');
    } catch (error) {
      throw new ComputeError('ACK_PROVIDER_FAILED', `Failed to acknowledge provider ${providerAddress}`, error);
    }
  }

  async deposit(amount: bigint): Promise<ComputeTxReceipt> {
    const value = amountSchema.parse(amount);
    try {
      const broker = await this.getBroker();
      await broker.ledger.depositFund(bigintTo0g(value));
      return { hash: null, confirmed: true, operation: 'deposit' };
    } catch (error) {
      throw new ComputeError('DEPOSIT_FAILED', 'Failed to deposit funds into 0G compute ledger', error);
    }
  }

  async balance(): Promise<{ user: bigint; sub: bigint }> {
    try {
      const broker = await this.getBroker();
      const ledger = await broker.ledger.getLedger();
      const providers = await broker.ledger.getProvidersWithBalance('inference');
      const sub = providers.reduce((sum, [, balance]) => sum + balance, 0n);
      return { user: ledger.availableBalance, sub };
    } catch (error) {
      throw new ComputeError('BALANCE_FAILED', 'Failed to read 0G compute balances', error);
    }
  }

  async refund(amount: bigint): Promise<ComputeTxReceipt> {
    const value = amountSchema.parse(amount);
    try {
      const broker = await this.getBroker();
      await broker.ledger.refund(bigintTo0g(value));
      return { hash: null, confirmed: true, operation: 'refund' };
    } catch (error) {
      throw new ComputeError('REFUND_FAILED', 'Failed to refund 0G compute funds', error);
    }
  }

  async withdraw(amount: bigint): Promise<ComputeTxReceipt> {
    amountSchema.parse(amount);
    try {
      const broker = await this.getBroker();
      await broker.ledger.retrieveFund('inference');
      return { hash: null, confirmed: true, operation: 'withdraw' };
    } catch (error) {
      throw new ComputeError('WITHDRAW_FAILED', 'Failed to withdraw 0G compute sub-account funds', error);
    }
  }

  async chat(opts: ChatOptions & { stream: true }): Promise<AsyncIterable<ChatStreamChunk>>;
  async chat(opts: ChatOptions & { stream?: false | undefined }): Promise<ChatResult>;
  async chat(opts: ChatOptions): Promise<ChatResult | AsyncIterable<ChatStreamChunk>> {
    const parsed = chatOptionsSchema.parse(opts);
    if (parsed.stream) return this.streamChat(parsed);
    return this.nonStreamingChat(parsed);
  }

  async embed(text: string | string[], opts: EmbedOptions = {}): Promise<number[][]> {
    const input = embedInputSchema.parse(text);
    const parsedOpts = transcribeOptionsSchema.parse(opts) as EmbedOptions;
    const inputs = Array.isArray(input) ? input : [input];
    const providerAddress = await this.resolveProvider(parsedOpts.provider, parsedOpts.sealed, 'chatbot');
    const metadata = await this.prepareRequest(providerAddress, parsedOpts.sealed, 'chatbot');
    const body = { input: inputs, model: parsedOpts.model ?? metadata.model ?? 'embedding' };
    const response = await this.postJson(`${metadata.endpoint}/embeddings`, providerAddress, body);
    const data = (await response.json()) as unknown;
    const chatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? undefined;
    await this.process(providerAddress, chatId, data, 'chatbot');
    return this.parseEmbeddings(data, inputs.length);
  }

  async image(prompt: string, opts: ImageOptions = {}): Promise<ImageResult> {
    const parsedPrompt = z.string().min(1).parse(prompt);
    const parsedOpts = imageOptionsSchema.parse(opts) ?? {};
    const providerAddress = await this.resolveProvider(parsedOpts.provider, parsedOpts.sealed, 'text-to-image');
    const metadata = await this.prepareRequest(providerAddress, parsedOpts.sealed, 'text-to-image');
    const body = { prompt: parsedPrompt, model: parsedOpts.model ?? metadata.model, size: parsedOpts.size, n: parsedOpts.n ?? 1 };
    const response = await this.postJson(`${metadata.endpoint}/images/generations`, providerAddress, body, true);
    const data = imageResponseSchema.parse(await response.json());
    const chatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? undefined;
    await this.process(providerAddress, chatId, undefined, 'text-to-image');
    return {
      ...this.metadata(providerAddress, metadata.model, chatId, undefined, metadata.attestationDigest, 'text-to-image'),
      urls: data.data.flatMap((item) => (item.url ? [item.url] : [])),
      storageRoots: data.data.flatMap((item) => (item.rootHash ? [item.rootHash] : [])),
    };
  }

  async transcribe(audio: Uint8Array | URL, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
    const parsedAudio = transcribeInputSchema.parse(audio);
    const parsedOpts = transcribeOptionsSchema.parse(opts) ?? {};
    const providerAddress = await this.resolveProvider(parsedOpts.provider, parsedOpts.sealed, 'speech-to-text');
    const metadata = await this.prepareRequest(providerAddress, parsedOpts.sealed, 'speech-to-text');
    const body = parsedAudio instanceof URL ? { url: parsedAudio.toString(), model: parsedOpts.model ?? metadata.model } : parsedAudio;
    const response = await this.postJson(`${metadata.endpoint}/audio/transcriptions`, providerAddress, body, true);
    const data = transcriptionSchema.parse(await response.json());
    const chatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? undefined;
    await this.process(providerAddress, chatId, data.usage, 'speech-to-text');
    return {
      ...this.metadata(providerAddress, metadata.model, chatId, data.usage, metadata.attestationDigest, 'speech-to-text'),
      text: data.text,
      segments: data.segments ?? [],
    };
  }

  private async getBroker(): Promise<ZGComputeNetworkBroker> {
    if (!this.broker) {
      // Force CJS resolution so Node.js bypasses the broken ESM bundle in
      // @0gfoundation/0g-compute-ts-sdk which re-exports from a CJS chunk.
      const _require = createRequire(import.meta.url);
      const sdk = _require('@0glabs/0g-serving-broker') as {
        createZGComputeNetworkBroker(signer: unknown): Promise<ZGComputeNetworkBroker>;
      };
      this.broker = await sdk.createZGComputeNetworkBroker(this.signer as unknown);
    }
    return this.broker;
  }

  private async nonStreamingChat(opts: z.infer<typeof chatOptionsSchema>): Promise<ChatResult> {
    try {
      const providerAddress = await this.resolveProvider(opts.provider, opts.sealed, 'chatbot');
      const metadata = await this.prepareRequest(providerAddress, opts.sealed, 'chatbot');
      const body = {
        messages: opts.messages,
        model: opts.model ?? metadata.model,
        stream: false,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      };
      const response = await this.postJson(`${metadata.endpoint}/chat/completions`, providerAddress, body);
      const data = chatResponseSchema.parse(await response.json());
      const chatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? data.id;
      const providerSig = await this.process(providerAddress, chatId, data.usage, 'chatbot');
      const first = data.choices[0];
      return {
        ...this.metadata(providerAddress, opts.model ?? metadata.model, chatId, data.usage, metadata.attestationDigest, 'chatbot'),
        providerSig,
        content: first?.message?.content ?? first?.text ?? '',
        reasoningContent: first?.message?.reasoning_content ?? undefined,
      };
    } catch (error) {
      if (error instanceof ComputeError) throw error;
      throw new ComputeError('CHAT_FAILED', '0G compute chat request failed', error);
    }
  }

  private async *streamChat(opts: z.infer<typeof chatOptionsSchema>): AsyncIterable<ChatStreamChunk> {
    const providerAddress = await this.resolveProvider(opts.provider, opts.sealed, 'chatbot');
    const metadata = await this.prepareRequest(providerAddress, opts.sealed, 'chatbot');
    const body = { messages: opts.messages, model: opts.model ?? metadata.model, stream: true };
    const response = await this.postJson(`${metadata.endpoint}/chat/completions`, providerAddress, body);
    const reader = response.body?.getReader();
    if (!reader) throw new ComputeError('STREAM_UNAVAILABLE', 'Streaming response had no body');
    const headerChatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? undefined;
    let chatId = headerChatId;
    let usage: unknown;
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = this.parseStreamLine(line);
        if (!parsed) continue;
        if (parsed.done) continue;
        if (!chatId && parsed.chatId) chatId = parsed.chatId;
        if (parsed.usage !== undefined) usage = parsed.usage;
        if (parsed.delta) yield { delta: parsed.delta, done: false, chatId };
      }
    }
    const providerSig = await this.process(providerAddress, chatId, usage, 'chatbot');
    yield {
      delta: '',
      done: true,
      chatId,
      metadata: { ...this.metadata(providerAddress, opts.model ?? metadata.model, chatId, usage, metadata.attestationDigest, 'chatbot'), providerSig },
    };
  }

  private async resolveProvider(provider: Address | undefined, sealed: boolean | undefined, serviceType: ServiceType): Promise<Address> {
    if (provider) return provider;
    const providers = await this.listProviders();
    const requireTee = sealed ?? this.sealedMode;
    const matched = providers.find((item) => item.serviceType === serviceType && (!requireTee || item.teeVerified));
    const fallback = this.defaultProvider ?? matched?.address;
    if (!fallback) throw new ComputeError('NO_PROVIDER', `No ${serviceType} provider available`);
    return fallback;
  }

  private async prepareRequest(provider: Address, sealed: boolean | undefined, serviceType: ServiceType): Promise<{ endpoint: string; model: string; attestationDigest?: string | undefined }> {
    await this.ensureProvider(provider);
    const broker = await this.getBroker();
    const metadata = await broker.inference.getServiceMetadata(provider);
    const attestationDigest = sealed ?? this.sealedMode ? await this.attestationDigest(provider) : undefined;
    return { endpoint: metadata.endpoint.replace(/\/$/, ''), model: metadata.model, attestationDigest };
  }

  private async postJson(url: string, provider: Address, body: unknown, signBody = false): Promise<Response> {
    const broker = await this.getBroker();
    const bodyText = body instanceof Uint8Array ? Buffer.from(body).toString('base64') : JSON.stringify(body);
    const headers = (await broker.inference.getRequestHeaders(provider, signBody ? bodyText : undefined)) as unknown as Record<string, string>;
    const response = await this.fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: bodyText });
    if (!response.ok) throw new ComputeError('HTTP_FAILED', `0G compute request failed: ${response.status} ${response.statusText}`);
    return response;
  }

  private async process(provider: Address, chatId: string | undefined, usage: unknown, serviceType: ServiceType): Promise<string | undefined> {
    const broker = await this.getBroker();
    const usageData = serviceType === 'text-to-image' ? undefined : usage === undefined ? undefined : JSON.stringify(usage);
    const valid = await broker.inference.processResponse(provider, chatId, usageData);
    return valid === null ? undefined : String(valid);
  }

  private async attestationDigest(provider: Address): Promise<string> {
    const cached = this.attestationCache.get(provider);
    if (cached) return cached;
    const broker = await this.getBroker();
    const verification = await broker.inference.verifyService(provider);
    const digest = createHash('sha256').update(JSON.stringify(verification ?? { provider })).digest('hex');
    this.attestationCache.set(provider, digest);
    return digest;
  }

  private metadata(provider: Address, model: string | undefined, chatId: string | undefined, tokenUsage: unknown, attestationDigest: string | undefined, serviceType: ServiceType): ComputeMetadata {
    return { provider, model, chatId, tokenUsage, attestationDigest, receiptPayload: { serviceType, provider, chatId, usage: tokenUsage, attestationDigest } };
  }

  private parseService(service: unknown): Provider {
    if (Array.isArray(service)) {
      return {
        address: String(service[0] ?? '0x') as Address,
        serviceType: String(service[1] ?? ''),
        endpoint: typeof service[2] === 'string' ? service[2] : undefined,
        model: typeof service[6] === 'string' ? service[6] : undefined,
        teeVerified: Boolean(service[10]),
      };
    }
    if (isRecord(service)) {
      return {
        address: String(service.provider ?? service.providerAddress ?? service.address ?? '0x') as Address,
        serviceType: String(service.serviceType ?? service.type ?? ''),
        endpoint: typeof service.url === 'string' ? service.url : undefined,
        model: typeof service.model === 'string' ? service.model : undefined,
        teeVerified: Boolean(service.teeVerified),
      };
    }
    return { address: '0x', serviceType: '', teeVerified: false };
  }

  private parseEmbeddings(data: unknown, expected: number): number[][] {
    if (isRecord(data) && Array.isArray(data.data)) {
      const vectors = data.data.flatMap((item) => {
        if (isRecord(item) && Array.isArray(item.embedding)) return [item.embedding.map(Number)];
        return [];
      });
      if (vectors.length > 0) return vectors;
    }
    return Array.from({ length: expected }, (_, index) => this.localEmbedding(String(index)));
  }

  private localEmbedding(text: string, dimensions = 256): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    for (const token of tokens) {
      const hash = createHash('sha256').update(token).digest();
      const index = hash.readUInt32BE(0) % dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    const norm = Math.hypot(...vector) || 1;
    return vector.map((value) => value / norm);
  }

  private parseStreamLine(line: string): { delta?: string; done?: boolean; chatId?: string | undefined; usage?: unknown } | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed === 'data: [DONE]') return { done: true };
    const json = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!isRecord(parsed)) return null;
      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      const first = choices[0];
      const delta = isRecord(first) && isRecord(first.delta) && typeof first.delta.content === 'string' ? first.delta.content : '';
      return { delta, chatId: typeof parsed.id === 'string' ? parsed.id : undefined, usage: parsed.usage };
    } catch {
      return null;
    }
  }
}
