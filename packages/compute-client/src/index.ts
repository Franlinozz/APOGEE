import { createHash } from 'node:crypto';
import {
  createZGComputeNetworkBroker,
  type ZGComputeNetworkBroker,
} from '@0glabs/0g-serving-broker';
import { JsonRpcProvider, Wallet } from 'ethers';
import { z } from 'zod';

export interface ComputeClientOptions {
  rpcUrl: string;
  signerKey: string;
  defaultProvider?: string | undefined;
  defaultModel?: string | undefined;
  fetchImpl?: typeof fetch;
}

export type ServiceType = 'chatbot' | 'text-to-image' | 'speech-to-text';

export interface ComputeProvider {
  providerAddress: string;
  serviceType: string;
  endpoint?: string | undefined;
  model?: string | undefined;
  teeVerified?: boolean | undefined;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  providerAddress?: string | undefined;
  model?: string | undefined;
  messages: ChatMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export interface ChatResult {
  id?: string | undefined;
  content: string;
  usage?: unknown;
  raw: unknown;
}

const chatResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullable().optional() }).optional(),
      text: z.string().optional(),
    }),
  ),
  usage: z.unknown().optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export class ComputeClient {
  private readonly signer: Wallet;
  private readonly defaultProvider: string | undefined;
  private readonly defaultModel: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private broker?: ZGComputeNetworkBroker;

  constructor(options: ComputeClientOptions) {
    this.signer = new Wallet(options.signerKey, new JsonRpcProvider(options.rpcUrl));
    this.defaultProvider = options.defaultProvider;
    this.defaultModel = options.defaultModel;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getBroker(): Promise<ZGComputeNetworkBroker> {
    const sdkSigner = this.signer as unknown as Parameters<typeof createZGComputeNetworkBroker>[0];
    this.broker ??= await createZGComputeNetworkBroker(sdkSigner);
    return this.broker;
  }

  async listProviders(serviceType?: ServiceType): Promise<ComputeProvider[]> {
    const broker = await this.getBroker();
    const services = (await broker.inference.listService()) as unknown[];
    return services
      .map((service) => this.parseService(service))
      .filter((service) => (serviceType ? service.serviceType === serviceType : true));
  }

  async ensureProvider(providerAddress: string): Promise<void> {
    const broker = await this.getBroker();
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const providerAddress = options.providerAddress ?? this.defaultProvider;
    if (!providerAddress) throw new Error('No 0G compute provider address supplied');

    const broker = await this.getBroker();
    await this.ensureProvider(providerAddress);
    const metadata = (await broker.inference.getServiceMetadata(providerAddress)) as unknown;
    const endpoint = this.extractEndpoint(metadata);
    const model = options.model ?? this.extractModel(metadata) ?? this.defaultModel;
    if (!model) throw new Error('No model supplied and provider metadata did not include one');

    const body = {
      messages: options.messages,
      model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    const headers = (await broker.inference.getRequestHeaders(
      providerAddress,
    )) as unknown as Record<string, string>;
    const response = await this.fetchImpl(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`0G compute request failed: ${response.status} ${response.statusText}`);

    const data = (await response.json()) as unknown;
    const parsed = chatResponseSchema.parse(data);
    const chatId =
      response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? parsed.id;
    await broker.inference.processResponse(
      providerAddress,
      chatId,
      parsed.usage === undefined ? undefined : JSON.stringify(parsed.usage),
    );

    const first = parsed.choices[0];
    const result: ChatResult = {
      content: first?.message?.content ?? first?.text ?? '',
      raw: data,
    };
    if (parsed.id !== undefined) result.id = parsed.id;
    if (parsed.usage !== undefined) result.usage = parsed.usage;
    return result;
  }

  async embed(text: string, dimensions = 256): Promise<number[]> {
    // Deterministic local fallback used by MemoryEngine when no external embedFn is provided.
    // It keeps tests/offline flows stable; production can provide an embedFn wired to a 0G model.
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

  private parseService(service: unknown): ComputeProvider {
    if (Array.isArray(service)) {
      return {
        providerAddress: String(service[0] ?? ''),
        serviceType: String(service[1] ?? ''),
        endpoint: typeof service[2] === 'string' ? service[2] : undefined,
        model: typeof service[6] === 'string' ? service[6] : undefined,
        teeVerified: typeof service[10] === 'boolean' ? service[10] : undefined,
      };
    }
    if (isRecord(service)) {
      return {
        providerAddress: String(
          service.provider ?? service.providerAddress ?? service.address ?? '',
        ),
        serviceType: String(service.serviceType ?? service.type ?? ''),
        endpoint: typeof service.url === 'string' ? service.url : undefined,
        model: typeof service.model === 'string' ? service.model : undefined,
        teeVerified: typeof service.teeVerified === 'boolean' ? service.teeVerified : undefined,
      };
    }
    return { providerAddress: '', serviceType: '' };
  }

  private extractEndpoint(metadata: unknown): string {
    if (isRecord(metadata) && typeof metadata.endpoint === 'string')
      return metadata.endpoint.replace(/\/$/, '');
    throw new Error('Provider metadata did not include an endpoint');
  }

  private extractModel(metadata: unknown): string | undefined {
    return isRecord(metadata) && typeof metadata.model === 'string' ? metadata.model : undefined;
  }
}
