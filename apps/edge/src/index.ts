import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { Contract, JsonRpcProvider, TypedDataEncoder, getAddress, keccak256, toUtf8Bytes, verifyTypedData } from 'ethers';
import { Redis, type Redis as RedisClient } from 'ioredis';
import { ChainClient } from '@apogee/chain-client';
import { StorageClient } from '@apogee/storage-client';
import { DEPLOY_AUTH_DOMAIN, DEPLOY_AUTH_TYPES, buildDeployAuthorizationMessage, type DeployPolicyInput } from '@apogee/core';
import { createBillingStack, InMemoryQuoteStore, type BillingChainClient, type ReceiptIndex, type ReceiptIndexRow, type StorageBoundary } from '@apogee/billing';
import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hex32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const idSchema = z.string().min(1).max(128);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]));
const problemSchema = z.object({ type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(), instance: z.string().optional() });
const nonceResponseSchema = z.object({ nonce: z.string(), message: z.string() });
const siweNonceBodySchema = z.object({ address: addressSchema, domain: z.string().min(1).optional(), uri: z.string().url().optional(), chainId: z.number().int().positive().default(16661) });
const siweVerifyBodySchema = z.object({ message: z.string().min(1), signature: z.string().min(1) });
const jwtResponseSchema = z.object({ token: z.string(), address: addressSchema });
const agentCreateSchema = z.object({
  owner: addressSchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  metadataRoot: z.string().optional(),
  policyId: z.string().optional(),
  skills: z.array(z.string().min(1)).optional(),
  policy: z.record(z.string(), jsonValueSchema).optional(),
});
const deployNonceResponseSchema = z.object({ owner: addressSchema, nonce: z.string(), deadline: z.number().int().positive(), chainId: z.literal(16661) });
const deployAuthorizedSchema = z.object({
  form: agentCreateSchema.omit({ owner: true }).extend({ name: z.string().min(1).max(120) }),
  authorization: z.object({ owner: addressSchema, nonce: z.string().min(1), deadline: z.number().int().positive(), signature: z.string().min(1) }),
});
const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: addressSchema,
  ownerAddress: addressSchema,
  accountAddress: addressSchema.optional(),
  identityTokenId: z.string().optional(),
  metadataRoot: z.string().optional(),
  policyId: z.string().optional(),
  balanceWei: z.string(),
  kpis: z.record(z.string(), z.number()),
  status: z.enum(['pending_deploy', 'deployed', 'activating', 'initialized', 'ready', 'active', 'paused', 'failed', 'deploying', 'error']),
  createdAt: z.string(),
  updatedAt: z.string(),
  hidden: z.boolean().optional(),
  description: z.string().optional(),
  deployment: z.unknown().optional(),
  authorizationProof: z.unknown().optional(),
});
const skillManifestSchema = z.object({ id: z.string(), name: z.string(), version: z.string(), description: z.string(), category: z.string(), tier: z.enum(['free', 'premium']), pricePerCallWei: z.string(), authorAddress: addressSchema.optional(), tags: z.array(z.string()) });
const policyPatchSchema = z.object({ maxPerTxWei: z.string().optional(), maxPerDayWei: z.string().optional(), active: z.boolean().optional(), summary: z.string().optional() });
const skillBodySchema = z.object({ skillId: z.string().min(1), version: z.string().optional(), config: jsonValueSchema.optional() });
const runBodySchema = z.object({ skillId: z.string().min(1), input: jsonValueSchema.optional(), idempotencyKey: z.string().optional() });
const runSchema = z.object({ id: z.string(), agentId: z.string(), status: z.enum(['queued', 'running', 'succeeded', 'failed']), createdAt: z.string(), updatedAt: z.string() });
const serviceBodySchema = z.object({ agentId: z.string().min(1), serviceId: z.string().min(1), tags: z.array(z.string()).default([]), priceWei: z.string(), description: z.string().optional() });
const serviceSchema = z.object({
  id: z.string(),
  providerAddress: addressSchema,
  name: z.string(),
  description: z.string(),
  modelId: z.string().optional(),
  pricePerTokenWei: z.string(),
  latencyMs: z.number().optional(),
  uptime: z.number().optional(),
  tags: z.array(z.string()),
});
const quoteBodySchema = z.object({ payeeAgentId: z.string().min(1), payerAgentId: z.string().optional(), serviceId: z.string().min(1), requestedAmount: z.union([z.string(), z.number(), z.bigint()]).optional(), ttlSec: z.number().int().positive().optional() });
const quoteResponseSchema = z.object({ quoteHash: hex32Schema, amount: z.string(), deadline: z.number(), payeeReceiver: addressSchema, signature: z.string(), nonce: z.string() });
const settleBodySchema = z.object({ quoteHash: hex32Schema, payerSignature: z.string().optional(), txHash: hex32Schema.optional(), permitSignature: z.string().optional(), clientReceiptId: z.string().optional(), payerAgentId: z.string().optional() });
const refundBodySchema = z.object({ reason: z.string(), agentId: z.string().optional(), clientReceiptId: z.string().optional() });
const memoryPutSchema = z.object({ value: jsonValueSchema, tags: z.array(z.string()).default([]) });
const memorySearchSchema = z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).default(10) });
const paginationSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(100).default(25), tag: z.string().optional(), agentId: z.string().optional(), scope: z.enum(['owned', 'global']).default('owned') });
const agentsQuerySchema = z.object({ includeHidden: z.coerce.boolean().default(false) });
const chainStatusSchema = z.object({ ok: z.boolean(), chainId: z.number(), blockNumber: z.number().optional(), latencyMs: z.number().optional(), rpc: z.string() });
const healthSchema = z.object({
  ok: z.boolean(),
  uptimeSec: z.number(),
  version: z.string(),
  db: z.object({ ok: z.boolean(), note: z.string() }),
  redis: z.object({ ok: z.boolean(), note: z.string() }),
  chain: z.object({ galileo: chainStatusSchema, aristotle: chainStatusSchema }),
  runtime: z.object({ workers: z.number(), lastHeartbeat: z.object({ aurora: z.string().nullable(), vesper: z.string().nullable(), helix: z.string().nullable() }) }),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type AuthUser = { address: string };
type AgentRecord = z.infer<typeof agentSchema>;
type RunRecord = z.infer<typeof runSchema> & { receipts: ReceiptIndexRow[]; steps: Array<{ id: string; name: string; status: string; createdAt: string }> };
type ServiceRecord = z.infer<typeof serviceSchema> & { agentId?: string; serviceId?: string; priceWei?: string };
type SkillInstall = { agentId: string; skillId: string; version?: string | undefined; config?: JsonValue | undefined; installedAt: string };
type MemoryRecord = { agentId: string; key: string; value: JsonValue; tags: string[]; updatedAt: string; createdAt?: string | undefined; visibility?: 'system' | 'bootstrap' | 'private' | undefined; storageRoot?: string | undefined; txHash?: string | undefined };
type HiddenAgentRecord = { chainId: number; ownerAddress: string; tokenId: string; hiddenAt: string };
type DeploymentPolicyRecord = { maxPerTxWei?: string | undefined; dailyCapWei?: string | undefined; allowedSkills?: string[] | undefined; allowedActions?: string[] | undefined };
type AuthorizationProof = { type: 'eip712'; owner: string; signer: string; nonce: string; deadline: number; digest: string; signature: string; createdAt: string; tokenId?: string | undefined; agentId?: string | undefined };
type DeploymentRecord = {
  chainId: number;
  tokenId: string;
  owner: string;
  accountAddress?: string | undefined;
  controller?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  selectedSkillIds: string[];
  policy?: DeploymentPolicyRecord | undefined;
  createdAt: string;
  identityMintTxHash?: string | undefined;
  accountDeployTxHash?: string | undefined;
  status: 'activating' | 'initialized' | 'ready' | 'active' | 'failed';
  error?: string | undefined;
  bootstrapMemory?: MemoryRecord | undefined;
  authorizationProof?: AuthorizationProof | undefined;
};
type DeployNonceRecord = { ownerLower: string; nonce: string; deadline: number; status: 'issued' | 'consumed' | 'expired'; createdAt: string; consumedAt?: string | undefined; deploymentKey?: string | undefined; tokenId?: string | undefined };
type OnboardingRecord = { key: string; chainId: number; tokenId: string; stages: Record<string, boolean>; status: 'pending' | 'running' | 'complete' | 'failed'; attempts: number; error?: string | undefined; updatedAt: string };
type StreamEvent = { event: 'receipt' | 'run.step' | 'balance.changed' | 'policy.changed'; payload: JsonValue };
const PUBLIC_STREAM_KEY = '__public__';
type TxResponse = { hash: string; nonce?: number; gasPrice?: bigint | null; maxFeePerGas?: bigint | null; maxPriorityFeePerGas?: bigint | null; wait(): Promise<{ status?: number | null; gasUsed?: bigint } | unknown> };
type PilotMsg = { role: 'user' | 'assistant'; content: string; createdAt: string };
type PilotConvo = { id: string; userAddress: string; messages: PilotMsg[]; createdAt: string };
type AccountFactoryContract = { predict(owner: string, salt: string): Promise<string>; createAccount(owner: string, salt: string): Promise<TxResponse> };
type AgentIdentityContract = { nextTokenId(): Promise<bigint>; mint(to: string, metadataRoot: string, publicKey: string, controller: string): Promise<TxResponse> };
type PaymentRouterAdminContract = { setAgentAccount(agentId: bigint, account: string): Promise<TxResponse> };
type AgentIdentityReadContract = { nextTokenId(): Promise<bigint>; ownerOf(tokenId: bigint): Promise<string> };
type PaymentRouterReadContract = { agentAccounts(tokenId: bigint): Promise<string> };
type ReceiptBookReadContract = { nextReceiptId(): Promise<bigint>; receipts(receiptId: bigint): Promise<{ receiptId: bigint; agentId: bigint; actionTag: string; payloadHash: string; storageRoot: string; valueWei: bigint; timestamp: bigint } | [bigint, bigint, string, string, string, bigint, bigint]> };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export interface EdgeServerOptions {
  chainClient: BillingChainClient & { verifyMessage?(message: string, signature: string): string };
  storageClient: StorageBoundary;
  signerKey: string;
  chainId: number;
  paymentRouterAddress: string;
  receiptBookAddress: string;
  accountFactoryAddress?: string | undefined;
  agentIdentityAddress?: string | undefined;
  // Key used exclusively for onlyOwner calls (identity.mint, router.setAgentAccount).
  // If absent, provisionAgentOnChain will abort with a clear authorization error.
  agentDeployerKey?: string | undefined;
  jwtSecret?: string | undefined;
  corsOrigin?: boolean | string | RegExp | Array<string | RegExp> | undefined;
  logger?: FastifyBaseLogger | undefined;
}


const DEFAULT_SKILLS = [
  { id: 'chat.completion', name: 'Chat Completion', version: '1.0.0', description: 'LLM chat via 0G Compute', category: 'AI', tier: 'free' as const, pricePerCallWei: '0', tags: ['ai', 'compute'] },
  { id: 'memory.write', name: 'Memory Write', version: '1.0.0', description: 'Persist encrypted memory state to 0G Storage', category: 'Memory', tier: 'free' as const, pricePerCallWei: '0', tags: ['memory', 'storage'] },
  { id: 'memory.read', name: 'Memory Read', version: '1.0.0', description: 'Read agent memory entries', category: 'Memory', tier: 'free' as const, pricePerCallWei: '0', tags: ['memory'] },
  { id: 'memory.search', name: 'Memory Search', version: '1.0.0', description: 'Search prior agent memory entries', category: 'Memory', tier: 'free' as const, pricePerCallWei: '0', tags: ['memory', 'search'] },
  { id: 'chain.query', name: 'Chain Query', version: '1.0.0', description: 'Read Aristotle chain state', category: 'Chain', tier: 'free' as const, pricePerCallWei: '0', tags: ['chain'] },
  { id: 'chain.send', name: 'Chain Send', version: '1.0.0', description: 'Submit approved on-chain transactions', category: 'Chain', tier: 'free' as const, pricePerCallWei: '0', tags: ['chain'] },
  { id: 'web.search', name: 'Web Search', version: '1.0.0', description: 'Search the web from an agent run', category: 'Web', tier: 'free' as const, pricePerCallWei: '0', tags: ['web'] },
  { id: 'web.fetch', name: 'Web Fetch', version: '1.0.0', description: 'Fetch and parse a URL', category: 'Web', tier: 'free' as const, pricePerCallWei: '0', tags: ['web'] },
  { id: 'storage.upload', name: 'Storage Upload', version: '1.0.0', description: 'Upload artifacts to 0G Storage', category: 'Storage', tier: 'free' as const, pricePerCallWei: '0', tags: ['storage'] },
];

const DEFAULT_SERVICES: ServiceRecord[] = [
  { id: '0g-storage', providerAddress: '0x0000000000000000000000000000000000000000', name: '0G Storage', description: 'Decentralized storage roots used for receipt payloads and memory artifacts.', pricePerTokenWei: '0', latencyMs: 900, uptime: 0.995, tags: ['storage', 'aristotle'] },
  { id: '0g-compute', providerAddress: '0x0000000000000000000000000000000000000000', name: '0G Compute', description: 'Compute endpoint for model-backed agent skills when configured.', pricePerTokenWei: '0', latencyMs: 1200, uptime: 0.99, tags: ['compute', 'ai'] },
  { id: 'aristotle-rpc', providerAddress: '0x0000000000000000000000000000000000000000', name: 'Aristotle RPC', description: '0G Aristotle mainnet RPC used for agent identity, payments, and receipts.', pricePerTokenWei: '0', latencyMs: 350, uptime: 0.998, tags: ['chain', 'rpc'] },
  { id: 'receipt-book', providerAddress: '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53', name: 'ReceiptBook', description: 'On-chain receipt minting contract for auditable agent activity.', pricePerTokenWei: '0', latencyMs: 500, uptime: 0.995, tags: ['receipts', 'proofs'] },
  { id: 'payment-router', providerAddress: '0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c', name: 'Payment Router', description: 'Settlement router mapping agent identities to smart accounts.', pricePerTokenWei: '0', latencyMs: 500, uptime: 0.995, tags: ['payments', 'settlement'] },
  { id: 'memory-index', providerAddress: '0x0000000000000000000000000000000000000000', name: 'Memory Index', description: 'Edge-indexed memory records written by memory skills and initialization events.', pricePerTokenWei: '0', latencyMs: 150, uptime: 0.99, tags: ['memory', 'index'] },
];

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const slot = new Promise<void>((resolve) => { release = resolve; });
    const prev = this.tail;
    this.tail = prev.then(() => slot, () => slot);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

const deployMutex = new Mutex();
const DEPLOY_AUTH_ENABLED = process.env.APOGEE_DEPLOY_AUTH_ENABLED !== 'false';
const DEPLOY_LOCK_TIMEOUT_MS = 120_000;
const DEPLOY_RETRY_BACKOFF_MS = [1_500, 4_000] as const;

function isReplacementUnderpriced(error: unknown): boolean {
  const value = error as { code?: unknown; shortMessage?: unknown; message?: unknown; info?: { error?: { message?: unknown; code?: unknown } } };
  const text = [value?.code, value?.shortMessage, value?.message, value?.info?.error?.message, value?.info?.error?.code]
    .filter((part) => part !== undefined)
    .join(' ')
    .toLowerCase();
  return text.includes('replacement_underpriced') || text.includes('replacement transaction underpriced') || text.includes('replacement fee too low');
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class InMemoryEdgeStore {
  nextAgentId = 1;
  readonly nonces = new Map<string, { nonce: string; message: string; expiresAt: number }>();
  readonly agents = new Map<string, AgentRecord>();
  readonly runs = new Map<string, RunRecord>();
  readonly services = new Map<string, ServiceRecord>();
  readonly skills = new Map<string, SkillInstall>();
  readonly memory = new Map<string, MemoryRecord>();
  readonly receipts = new Map<string, ReceiptIndexRow>();
  readonly pilotConversations = new Map<string, PilotConvo>();
  readonly lastHeartbeat = { aurora: null as string | null, vesper: null as string | null, helix: null as string | null };
}

interface HiddenAgentStore {
  isHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<boolean>;
  setHidden(record: HiddenAgentRecord): Promise<void>;
  unsetHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<void>;
}

const hiddenAgentKey = (chainId: number, ownerAddress: string, tokenId: string): string =>
  `hidden-agent:${chainId}:${ownerAddress.toLowerCase()}:${tokenId}`;

class InMemoryHiddenAgentStore implements HiddenAgentStore {
  private readonly hidden = new Map<string, HiddenAgentRecord>();
  async isHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<boolean> {
    return this.hidden.has(hiddenAgentKey(chainId, ownerAddress, tokenId));
  }
  async setHidden(record: HiddenAgentRecord): Promise<void> {
    this.hidden.set(hiddenAgentKey(record.chainId, record.ownerAddress, record.tokenId), record);
  }
  async unsetHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<void> {
    this.hidden.delete(hiddenAgentKey(chainId, ownerAddress, tokenId));
  }
}

class RedisHiddenAgentStore implements HiddenAgentStore {
  constructor(private readonly redis: RedisClient) {}
  async isHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<boolean> {
    return (await this.redis.exists(hiddenAgentKey(chainId, ownerAddress, tokenId))) === 1;
  }
  async setHidden(record: HiddenAgentRecord): Promise<void> {
    await this.redis.set(hiddenAgentKey(record.chainId, record.ownerAddress, record.tokenId), JSON.stringify(record));
  }
  async unsetHidden(chainId: number, ownerAddress: string, tokenId: string): Promise<void> {
    await this.redis.del(hiddenAgentKey(chainId, ownerAddress, tokenId));
  }
}

interface DeployNonceStore {
  issue(owner: string, now: string, deadline: number): Promise<DeployNonceRecord>;
  get(owner: string, nonce: string): Promise<DeployNonceRecord | null>;
  consume(owner: string, nonce: string, deploymentKey: string): Promise<DeployNonceRecord>;
  attachToken(owner: string, nonce: string, tokenId: string): Promise<void>;
}

const deployNonceKey = (owner: string, nonce: string): string => `deploy-auth-nonce:${owner.toLowerCase()}:${nonce}`;
const randomUint256String = (): string => BigInt(`0x${randomBytes(32).toString('hex')}`).toString();

class InMemoryDeployNonceStore implements DeployNonceStore {
  private readonly nonces = new Map<string, DeployNonceRecord>();
  async issue(owner: string, now: string, deadline: number): Promise<DeployNonceRecord> {
    const record: DeployNonceRecord = { ownerLower: owner.toLowerCase(), nonce: randomUint256String(), deadline, status: 'issued', createdAt: now };
    this.nonces.set(deployNonceKey(owner, record.nonce), record);
    return record;
  }
  async get(owner: string, nonce: string): Promise<DeployNonceRecord | null> { return this.nonces.get(deployNonceKey(owner, nonce)) ?? null; }
  async consume(owner: string, nonce: string, deploymentKeyValue: string): Promise<DeployNonceRecord> {
    const key = deployNonceKey(owner, nonce);
    const current = this.nonces.get(key);
    if (!current) throw Object.assign(new Error('Deployment authorization nonce was not issued.'), { nonceMissing: true as const });
    if (current.status !== 'issued') return current;
    const consumed: DeployNonceRecord = { ...current, status: 'consumed', consumedAt: nowIso(), deploymentKey: deploymentKeyValue };
    this.nonces.set(key, consumed);
    return consumed;
  }
  async attachToken(owner: string, nonce: string, tokenId: string): Promise<void> {
    const key = deployNonceKey(owner, nonce);
    const current = this.nonces.get(key);
    if (current) this.nonces.set(key, { ...current, tokenId });
  }
}

class RedisDeployNonceStore implements DeployNonceStore {
  constructor(private readonly redis: RedisClient) {}
  async issue(owner: string, now: string, deadline: number): Promise<DeployNonceRecord> {
    const record: DeployNonceRecord = { ownerLower: owner.toLowerCase(), nonce: randomUint256String(), deadline, status: 'issued', createdAt: now };
    await this.redis.set(deployNonceKey(owner, record.nonce), JSON.stringify(record), 'EX', 60 * 60 * 24);
    return record;
  }
  async get(owner: string, nonce: string): Promise<DeployNonceRecord | null> {
    const raw = await this.redis.get(deployNonceKey(owner, nonce));
    return raw ? JSON.parse(raw) as DeployNonceRecord : null;
  }
  async consume(owner: string, nonce: string, deploymentKeyValue: string): Promise<DeployNonceRecord> {
    const key = deployNonceKey(owner, nonce);
    const raw = await this.redis.get(key);
    if (!raw) throw Object.assign(new Error('Deployment authorization nonce was not issued.'), { nonceMissing: true as const });
    const current = JSON.parse(raw) as DeployNonceRecord;
    if (current.status !== 'issued') return current;
    const consumed: DeployNonceRecord = { ...current, status: 'consumed', consumedAt: nowIso(), deploymentKey: deploymentKeyValue };
    await this.redis.set(key, JSON.stringify(consumed), 'EX', 60 * 60 * 24 * 7);
    return consumed;
  }
  async attachToken(owner: string, nonce: string, tokenId: string): Promise<void> {
    const key = deployNonceKey(owner, nonce);
    const raw = await this.redis.get(key);
    if (!raw) return;
    await this.redis.set(key, JSON.stringify({ ...JSON.parse(raw) as DeployNonceRecord, tokenId }), 'EX', 60 * 60 * 24 * 7);
  }
}

interface DeploymentStore {
  get(tokenId: string): Promise<DeploymentRecord | null>;
  set(record: DeploymentRecord): Promise<void>;
  update(tokenId: string, patch: Partial<DeploymentRecord>): Promise<void>;
  getOnboarding(tokenId: string): Promise<OnboardingRecord | null>;
  setOnboarding(record: OnboardingRecord): Promise<void>;
}

class InMemoryDeploymentStore implements DeploymentStore {
  private readonly deployments = new Map<string, DeploymentRecord>();
  private readonly onboardings = new Map<string, OnboardingRecord>();
  async get(tokenId: string): Promise<DeploymentRecord | null> { return this.deployments.get(tokenId) ?? null; }
  async set(record: DeploymentRecord): Promise<void> { this.deployments.set(record.tokenId, record); }
  async update(tokenId: string, patch: Partial<DeploymentRecord>): Promise<void> {
    const current = this.deployments.get(tokenId);
    if (current) this.deployments.set(tokenId, { ...current, ...patch });
  }
  async getOnboarding(tokenId: string): Promise<OnboardingRecord | null> { return this.onboardings.get(tokenId) ?? null; }
  async setOnboarding(record: OnboardingRecord): Promise<void> { this.onboardings.set(record.tokenId, record); }
}

const deploymentKey = (chainId: number, tokenId: string): string => `deployment:${chainId}:${tokenId}`;
const onboardingKey = (chainId: number, tokenId: string): string => `onboarding:${chainId}:${tokenId}`;

class RedisDeploymentStore implements DeploymentStore {
  constructor(private readonly redis: RedisClient, private readonly chainId: number) {}
  async get(tokenId: string): Promise<DeploymentRecord | null> {
    const raw = await this.redis.get(deploymentKey(this.chainId, tokenId));
    return raw ? JSON.parse(raw) as DeploymentRecord : null;
  }
  async set(record: DeploymentRecord): Promise<void> {
    await this.redis.set(deploymentKey(record.chainId, record.tokenId), JSON.stringify(record));
  }
  async update(tokenId: string, patch: Partial<DeploymentRecord>): Promise<void> {
    const current = await this.get(tokenId);
    if (current) await this.set({ ...current, ...patch });
  }
  async getOnboarding(tokenId: string): Promise<OnboardingRecord | null> {
    const raw = await this.redis.get(onboardingKey(this.chainId, tokenId));
    return raw ? JSON.parse(raw) as OnboardingRecord : null;
  }
  async setOnboarding(record: OnboardingRecord): Promise<void> {
    await this.redis.set(onboardingKey(record.chainId, record.tokenId), JSON.stringify(record));
  }
}

class RedisReceiptIndex implements ReceiptIndex {
  constructor(private readonly redis: RedisClient) {}
  async findByClientReceiptId(clientReceiptId: string): Promise<ReceiptIndexRow | null> {
    const receiptId = await this.redis.get(`receipt-client:${clientReceiptId}`);
    if (!receiptId) return null;
    const raw = await this.redis.get(`receipt:${receiptId}`);
    return raw ? JSON.parse(raw) as ReceiptIndexRow : null;
  }
  async insert(row: ReceiptIndexRow): Promise<void> {
    await this.redis.set(`receipt:${row.receiptId}`, JSON.stringify(row));
    await this.redis.sadd('receipts:index', row.receiptId);
    if (row.clientReceiptId) await this.redis.set(`receipt-client:${row.clientReceiptId}`, row.receiptId);
  }
  async update(receiptId: string, patch: Partial<ReceiptIndexRow>): Promise<void> {
    const raw = await this.redis.get(`receipt:${receiptId}`);
    if (!raw) return;
    await this.redis.set(`receipt:${receiptId}`, JSON.stringify({ ...JSON.parse(raw) as ReceiptIndexRow, ...patch }));
    await this.redis.sadd('receipts:index', receiptId);
  }
  async list(): Promise<ReceiptIndexRow[]> {
    const ids = await this.redis.smembers('receipts:index');
    if (ids.length === 0) return [];
    const rows = await this.redis.mget(ids.map((id) => `receipt:${id}`));
    return rows.filter(Boolean).map((raw) => JSON.parse(raw as string) as ReceiptIndexRow);
  }
}

class RedisTxLock {
  constructor(private readonly redis: RedisClient | null, private readonly logger: FastifyBaseLogger) {}
  async run<T>(key: string, method: string, signerAddress: string, fn: (lockWaitMs: number) => Promise<T>): Promise<T> {
    const started = Date.now();
    if (!this.redis) return fn(0);
    const token = randomUUID();
    const ttlMs = 120_000;
    while (Date.now() - started < 30_000) {
      const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (ok) {
        const lockWaitMs = Date.now() - started;
        try { return await fn(lockWaitMs); }
        finally {
          const current = await this.redis.get(key).catch(() => null);
          if (current === token) await this.redis.del(key).catch(() => undefined);
        }
      }
      await sleep(400);
    }
    this.logger.warn({ method, signerAddress, lockKey: key, lockWaitMs: Date.now() - started }, 'signer tx lock busy');
    throw Object.assign(new Error('Signer transaction queue is busy; retry shortly.'), { txLockBusy: true as const });
  }
}

class FieldRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  check(key: string): boolean {
    const now = Date.now();
    const hit = this.hits.get(key);
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (hit.count >= this.max) return false;
    hit.count += 1;
    return true;
  }
}

const nowIso = (): string => new Date().toISOString();
const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const bigintFrom = (value: string | number | bigint | undefined): bigint | undefined => value === undefined ? undefined : typeof value === 'bigint' ? value : BigInt(value);
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const bytes32From = (value: string): string => /^0x[a-fA-F0-9]{64}$/.test(value) ? value : `0x${createHash('sha256').update(value).digest('hex')}`;

const problem = (reply: FastifyReply, status: number, title: string, detail: string): FastifyReply => {
  reply.status(status).type('application/problem+json').send({ type: 'about:blank', title, status, detail });
  return reply;
};
const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

async function requireAuth(request: FastifyRequest): Promise<AuthUser> {
  await request.jwtVerify();
  return request.user;
}

const bearerFromSubprotocol = (value: string | undefined): string | null => {
  if (!value) return null;
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const bearerIndex = parts.findIndex((part) => part.toLowerCase() === 'bearer');
  if (bearerIndex >= 0) return parts[bearerIndex + 1] ?? null;
  return parts.find((part) => part.startsWith('eyJ')) ?? null;
};

function siweMessage(address: string, nonce: string, domain: string, uri: string, chainId: number): string {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to APOGEE Protocol.\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${nowIso()}`;
}

function parseSiweAddress(message: string): string | null {
  const line = message.split('\n').find((entry) => /^0x[a-fA-F0-9]{40}$/.test(entry.trim()));
  return line?.trim() ?? null;
}

export function buildEdgeServer(options: EdgeServerOptions): FastifyInstance {
  const app = Fastify(options.logger ? { loggerInstance: options.logger } : { logger: true });
  const store = new InMemoryEdgeStore();
  const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true }) : null;
  const hiddenAgentStore: HiddenAgentStore = redis
    ? new RedisHiddenAgentStore(redis)
    : new InMemoryHiddenAgentStore();
  const deploymentStore: DeploymentStore = redis
    ? new RedisDeploymentStore(redis, options.chainId)
    : new InMemoryDeploymentStore();
  const deployNonceStore: DeployNonceStore = redis
    ? new RedisDeployNonceStore(redis)
    : new InMemoryDeployNonceStore();
  const redisReceiptIndex = redis ? new RedisReceiptIndex(redis) : undefined;
  const receiptIndex: ReceiptIndex | undefined = redisReceiptIndex;
  const txLock = new RedisTxLock(redis, app.log);
  if (!redis) app.log.warn('durable edge stores/locks are in-memory; set REDIS_URL for production bootstrap, hides, and tx locks');
  const quoteByPayee = new FieldRateLimiter(30, 60_000);
  const settleByPayer = new FieldRateLimiter(30, 60_000);
  const streamClients = new Map<string, Set<{ send(payload: string): void; close(): void }>>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error, request, reply) => {
    const err = error as { statusCode?: number; message?: string };
    request.log.warn({ error }, 'edge request failed');
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    void problem(reply, status, status >= 500 ? 'Internal Server Error' : 'Bad Request', err.message ?? 'Request failed');
  });

  void app.register(helmet);
  void app.register(cors, { origin: options.corsOrigin ?? true });
  void app.register(jwt, { secret: options.jwtSecret ?? 'dev-only-apogee-edge-secret-change-me' });
  void app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', keyGenerator: (request) => request.headers.authorization ?? request.ip });
  void app.register(swagger, {
    openapi: { openapi: '3.1.0', info: { title: 'APOGEE Edge API', version: '0.4.0' } },
    transform: jsonSchemaTransform,
  });
  void app.register(swaggerUi, { routePrefix: '/docs/api' });
  void app.register(websocket);

  let lastChainAgentSyncAt = 0;
  let chainAgentSyncInFlight: Promise<void> | null = null;

  let lastChainReceiptSyncAt = 0;
  let chainReceiptSyncInFlight: Promise<void> | null = null;

  const syncOnChainReceipts = async (): Promise<void> => {
    if (!options.receiptBookAddress) return;
    if (Date.now() - lastChainReceiptSyncAt < 30_000) return;
    if (chainReceiptSyncInFlight) return chainReceiptSyncInFlight;

    chainReceiptSyncInFlight = (async () => {
      const provider = new JsonRpcProvider(process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai', 16661, { staticNetwork: true });
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 16661) throw new Error(`receipt sync expected Aristotle chainId 16661, got ${network.chainId.toString()}`);
      const code = await provider.getCode(options.receiptBookAddress);
      if (code === '0x') {
        lastChainReceiptSyncAt = Date.now();
        app.log.warn({ receiptBookAddress: options.receiptBookAddress }, 'receipt index sync skipped — ReceiptBook has no bytecode');
        return;
      }
      const book = new Contract(options.receiptBookAddress, [
        'function nextReceiptId() view returns (uint256)',
        'function receipts(uint256 receiptId) view returns (uint256 receiptId, uint256 agentId, bytes4 actionTag, bytes32 payloadHash, bytes32 storageRoot, uint256 valueWei, uint64 timestamp)',
      ], provider) as unknown as ReceiptBookReadContract;
      const nextReceiptId = await book.nextReceiptId();
      const maxReceiptId = nextReceiptId > 500n ? 500n : nextReceiptId;
      let synced = 0;
      for (let id = 1n; id < maxReceiptId; id += 1n) {
        if (store.receipts.has(id.toString())) continue;
        try {
          const receipt = await book.receipts(id);
          const receiptId = Array.isArray(receipt) ? receipt[0] : receipt.receiptId;
          const agentId = Array.isArray(receipt) ? receipt[1] : receipt.agentId;
          const actionTag = Array.isArray(receipt) ? receipt[2] : receipt.actionTag;
          const payloadHash = Array.isArray(receipt) ? receipt[3] : receipt.payloadHash;
          const storageRoot = Array.isArray(receipt) ? receipt[4] : receipt.storageRoot;
          const valueWei = Array.isArray(receipt) ? receipt[5] : receipt.valueWei;
          const timestamp = Array.isArray(receipt) ? receipt[6] : receipt.timestamp;
          if (receiptId === 0n || timestamp === 0n) continue;
          store.receipts.set(receiptId.toString(), {
            receiptId: receiptId.toString(),
            agentId: agentId.toString(),
            actionTag,
            payloadHash,
            storageRoot,
            valueWei: valueWei.toString(),
            status: 'minted',
            createdAt: new Date(Number(timestamp) * 1000).toISOString(),
          });
          synced += 1;
        } catch {
          // Missing receipt IDs are ignored; nextReceiptId is authoritative.
        }
      }
      if (redisReceiptIndex) {
        for (const row of await redisReceiptIndex.list()) store.receipts.set(row.receiptId, row);
      }
      lastChainReceiptSyncAt = Date.now();
      if (synced > 0) app.log.info({ nextReceiptId: nextReceiptId.toString(), synced }, 'receipt index sync complete');
    })().finally(() => {
      chainReceiptSyncInFlight = null;
    });
    return chainReceiptSyncInFlight;
  };

  const syncOnChainAgents = async (): Promise<void> => {
    if (!options.agentIdentityAddress || !options.paymentRouterAddress) return;
    const agentIdentityAddress = options.agentIdentityAddress;
    const paymentRouterAddress = options.paymentRouterAddress;
    if (Date.now() - lastChainAgentSyncAt < 30_000) return;
    if (chainAgentSyncInFlight) return chainAgentSyncInFlight;

    chainAgentSyncInFlight = (async () => {
      const provider = new JsonRpcProvider(process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai', 16661, { staticNetwork: true });
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 16661) throw new Error(`agent index sync expected Aristotle chainId 16661, got ${network.chainId.toString()}`);
      const identity = new Contract(agentIdentityAddress, [
        'function nextTokenId() view returns (uint256)',
        'function ownerOf(uint256 tokenId) view returns (address)',
      ], provider) as unknown as AgentIdentityReadContract;
      const router = new Contract(paymentRouterAddress, [
        'function agentAccounts(uint256 agentId) view returns (address)',
      ], provider) as unknown as PaymentRouterReadContract;
      let nextTokenId: bigint;
      try {
        nextTokenId = await identity.nextTokenId();
      } catch (err) {
        app.log.warn({ agentIdentityAddress, err }, 'agent index sync skipped — AgentIdentity unavailable or has no bytecode');
        lastChainAgentSyncAt = Date.now();
        return;
      }
      const maxTokenId = nextTokenId > 200n ? 200n : nextTokenId;
      const indexedAt = nowIso();
      let synced = 0;
      for (let tokenId = 1n; tokenId < maxTokenId; tokenId += 1n) {
        try {
          const [owner, accountAddress] = await Promise.all([
            identity.ownerOf(tokenId),
            router.agentAccounts(tokenId).catch(() => '0x0000000000000000000000000000000000000000'),
          ]);
          const id = tokenId.toString();
          const existing = store.agents.get(id);
          const indexedAgent: AgentRecord = {
            id,
            name: existing?.name ?? `Agent #${id}`,
            owner,
            ownerAddress: owner,
            identityTokenId: id,
            accountAddress: accountAddress === '0x0000000000000000000000000000000000000000' ? existing?.accountAddress : accountAddress,
            metadataRoot: existing?.metadataRoot,
            policyId: existing?.policyId,
            balanceWei: existing?.balanceWei ?? '0',
            kpis: existing?.kpis ?? { runs: 0, receipts: [...store.receipts.values()].filter((receipt) => receipt.agentId === id).length },
            status: measurableStatus(id, existing?.status ?? 'deployed'),
            createdAt: existing?.createdAt ?? indexedAt,
            updatedAt: indexedAt,
          };
          store.agents.set(id, indexedAgent);
          if (!await deploymentStore.get(id)) {
            const derived: DeploymentRecord = {
              chainId: options.chainId,
              tokenId: id,
              owner,
              accountAddress: indexedAgent.accountAddress,
              controller: indexedAgent.accountAddress,
              name: indexedAgent.name,
              selectedSkillIds: [],
              createdAt: indexedAgent.createdAt,
              status: 'activating',
            };
            await deploymentStore.set(derived);
            void enqueueOnboarding(derived).catch((err) => app.log.warn({ tokenId: id, err }, 'bootstrap backfill enqueue failed'));
          }
          synced += 1;
        } catch {
          // Burned/nonexistent token IDs are ignored; nextTokenId is authoritative.
        }
      }
      lastChainAgentSyncAt = Date.now();
      app.log.info({ nextTokenId: nextTokenId.toString(), synced }, 'agent index sync complete');
    })().finally(() => {
      chainAgentSyncInFlight = null;
    });
    return chainAgentSyncInFlight;
  };

  const ownedAgent = async (reply: FastifyReply, user: AuthUser, agentId: string): Promise<AgentRecord | FastifyReply> => {
    await syncOnChainAgents();
    const agent = store.agents.get(agentId);
    if (!agent) return problem(reply, 404, 'Agent not found', agentId);
    if (!sameAddress(agent.owner, user.address)) return problem(reply, 403, 'Forbidden', 'Agent is not owned by the caller');
    return agent;
  };

  const ownedRun = async (reply: FastifyReply, user: AuthUser, runId: string): Promise<RunRecord | FastifyReply> => {
    const run = store.runs.get(runId);
    if (!run) return problem(reply, 404, 'Run not found', runId);
    await syncOnChainAgents();
    const agent = store.agents.get(run.agentId);
    if (!agent || !sameAddress(agent.owner, user.address)) return problem(reply, 403, 'Forbidden', 'Run is not owned by the caller');
    return run;
  };

  const stack = createBillingStack({ ...options, quoteStore: new InMemoryQuoteStore(), receiptIndex, payeeResolver: async (payeeAgentId, serviceId) => {
    const service = [...store.services.values()].find((entry) => entry.agentId === payeeAgentId && entry.serviceId === serviceId);
    if (!service) throw new Error(`Service ${serviceId} for payee agent ${payeeAgentId} was not found`);
    const agent = store.agents.get(payeeAgentId);
    const receiver = agent?.accountAddress ?? service.agentId;
    if (!receiver || !addressSchema.safeParse(receiver).success) throw new Error(`Payee agent ${payeeAgentId} has no settlement receiver address`);
    return { receiver, amount: BigInt(service.priceWei ?? service.pricePerTokenWei) };
  }, eventBus: {
    publish: (_event, payload) => {
      store.receipts.set(payload.receiptId, payload);
      broadcast(payload.agentId, { event: 'receipt', payload: json(payload) });
    },
    subscribe: () => () => undefined,
  } });

  const broadcast = (agentId: string, event: StreamEvent): void => {
    for (const key of [agentId, PUBLIC_STREAM_KEY]) {
      const clients = streamClients.get(key);
      if (!clients) continue;
      for (const client of clients) client.send(JSON.stringify(event));
    }
  };

  const isRecent = (iso: string | null | undefined, windowMs = 15 * 60_000): boolean => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && Date.now() - t < windowMs;
  };

  const hasRuntimeActivity = (agentId: string): boolean => {
    const hasRecentRun = [...store.runs.values()].some((run) => run.agentId === agentId && isRecent(run.updatedAt ?? run.createdAt));
    const hasRecentReceipt = [...store.receipts.values()].some((receipt) => receipt.agentId === agentId && isRecent(receipt.createdAt));
    if (agentId === '1') return isRecent(store.lastHeartbeat.aurora) || hasRecentRun || hasRecentReceipt;
    if (agentId === '2') return isRecent(store.lastHeartbeat.vesper) || hasRecentRun || hasRecentReceipt;
    if (agentId === '3') return isRecent(store.lastHeartbeat.helix) || hasRecentRun || hasRecentReceipt;
    return hasRecentRun || hasRecentReceipt;
  };

  const measurableStatus = (agentId: string, fallback: AgentRecord['status']): AgentRecord['status'] => {
    if (fallback === 'paused' || fallback === 'failed' || fallback === 'error' || fallback === 'deploying' || fallback === 'pending_deploy') return fallback;
    return hasRuntimeActivity(agentId) ? 'active' : 'activating';
  };

  const agentTokenId = (agent: AgentRecord): string => agent.identityTokenId ?? agent.id;
  const withAgentVisibility = async (agent: AgentRecord): Promise<AgentRecord> => {
    const decorated = await decorateAgent(agent);
    return {
      ...decorated,
      hidden: await hiddenAgentStore.isHidden(options.chainId, agent.owner, agentTokenId(agent)),
    };
  };

  const receiptRows = (agentId?: string): ReceiptIndexRow[] => {
    const byKey = new Map<string, ReceiptIndexRow>();
    const score = (row: ReceiptIndexRow): number => (row.clientReceiptId ? 4 : 0) + (row.txHash ? 2 : 0) + (/^0x[a-fA-F0-9]{8}$/.test(row.actionTag) ? 0 : 1);
    for (const receipt of [...store.receipts.values()].filter((row) => !agentId || row.agentId === agentId)) {
      const key = receipt.storageRoot && receipt.payloadHash
        ? `${receipt.agentId}:${receipt.payloadHash}:${receipt.storageRoot}:${receipt.valueWei}`
        : receipt.clientReceiptId ?? receipt.receiptId;
      const current = byKey.get(key);
      if (!current || score(receipt) > score(current) || (score(receipt) === score(current) && receipt.createdAt > current.createdAt)) byKey.set(key, receipt);
    }
    return [...byKey.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  const deploymentForAgent = async (agent: AgentRecord): Promise<DeploymentRecord | null> => deploymentStore.get(agentTokenId(agent));

  const decorateAgent = async (agent: AgentRecord): Promise<AgentRecord> => {
    const deployment = await deploymentForAgent(agent);
    const receiptCount = receiptRows(agent.id).length;
    const storedMemoryCount = [...store.memory.values()].filter((entry) => entry.agentId === agent.id).length;
    const deploymentBootstrapMemory = deployment?.bootstrapMemory ? 1 : 0;
    const memoryCount = Math.max(storedMemoryCount, deploymentBootstrapMemory);
    const lifecycleStatus = deployment?.status;
    return {
      ...agent,
      description: agent.description ?? deployment?.description,
      status: lifecycleStatus === 'initialized' || lifecycleStatus === 'ready' ? lifecycleStatus : measurableStatus(agent.id, agent.status),
      kpis: { ...agent.kpis, receipts: receiptCount, memory: memoryCount, skills: deployment?.selectedSkillIds.length ?? [...store.skills.values()].filter((skill) => skill.agentId === agent.id).length },
      deployment: deployment ? json(deployment) : undefined,
      authorizationProof: deployment?.authorizationProof ? json(deployment.authorizationProof) : agent.authorizationProof,
    };
  };

  const hasBootstrapReceipt = (tokenId: string, actionTag: string, skillId?: string): boolean => [...store.receipts.values()].some((receipt) => {
    if (receipt.agentId !== tokenId || receipt.actionTag !== actionTag) return false;
    if (receipt.status === 'failed') return false;
    if (!skillId) return true;
    return receipt.clientReceiptId === `onboarding:${options.chainId}:${tokenId}:skill:${skillId}`;
  });

  async function runOnboarding(record: DeploymentRecord): Promise<void> {
    const key = onboardingKey(record.chainId, record.tokenId);
    const current = await deploymentStore.getOnboarding(record.tokenId) ?? { key, chainId: record.chainId, tokenId: record.tokenId, stages: {}, status: 'pending' as const, attempts: 0, updatedAt: nowIso() };
    if (current.status === 'complete') return;
    const onboarding: OnboardingRecord = { ...current, status: 'running', attempts: current.attempts + 1, updatedAt: nowIso() };
    await deploymentStore.setOnboarding(onboarding);

    try {
      if (record.authorizationProof && !onboarding.stages['deployment.authorized'] && !hasBootstrapReceipt(record.tokenId, 'deployment.authorized')) {
        await stack.receiptMinter.mint({
          agentId: record.tokenId,
          actionTag: 'deployment.authorized',
          payload: {
            event: 'deployment.authorized',
            tokenId: record.tokenId,
            owner: record.authorizationProof.owner,
            digest: record.authorizationProof.digest,
            nonce: record.authorizationProof.nonce,
            deadline: record.authorizationProof.deadline,
            signature: record.authorizationProof.signature,
            createdAt: record.authorizationProof.createdAt,
          },
          valueWei: 0n,
          clientReceiptId: `onboarding:${record.chainId}:${record.tokenId}:deployment.authorized`,
        });
        onboarding.stages['deployment.authorized'] = true;
        await deploymentStore.setOnboarding({ ...onboarding, updatedAt: nowIso() });
      }

      if (!onboarding.stages['agent.created'] && !hasBootstrapReceipt(record.tokenId, 'agent.created')) {
        const payload = {
          event: 'agent.created',
          tokenId: record.tokenId,
          owner: record.owner,
          accountAddress: record.accountAddress,
          name: record.name,
          description: record.description,
          installedSkills: record.selectedSkillIds,
          policy: record.policy,
          createdAt: record.createdAt,
          identityMintTxHash: record.identityMintTxHash,
          authorizationType: record.authorizationProof?.type,
          authorizationSigner: record.authorizationProof?.signer,
          authorizationDigest: record.authorizationProof?.digest,
          authorizationSignature: record.authorizationProof?.signature,
          authorizationDeadline: record.authorizationProof?.deadline,
        };
        await stack.receiptMinter.mint({
          agentId: record.tokenId,
          actionTag: 'agent.created',
          payload,
          valueWei: 0n,
          clientReceiptId: `onboarding:${record.chainId}:${record.tokenId}:agent.created`,
        });
        onboarding.stages['agent.created'] = true;
        await deploymentStore.setOnboarding({ ...onboarding, updatedAt: nowIso() });
      }

      if (!onboarding.stages['system/init']) {
        const createdAt = nowIso();
        const value = {
          event: 'agent.bootstrap',
          message: 'Agent initialized. Awaiting first task.',
          installedSkills: record.selectedSkillIds,
          createdAt,
          visibility: 'system/bootstrap',
        };
        const memoryRecord: MemoryRecord = {
          agentId: record.tokenId,
          key: 'system/init',
          value: json(value),
          tags: ['system', 'bootstrap'],
          visibility: 'bootstrap',
          createdAt,
          updatedAt: createdAt,
        };
        store.memory.set(`${record.tokenId}:system/init`, memoryRecord);
        await deploymentStore.update(record.tokenId, { bootstrapMemory: memoryRecord });
        onboarding.stages['system/init'] = true;
        await deploymentStore.setOnboarding({ ...onboarding, updatedAt: nowIso() });
      }

      for (const skillId of record.selectedSkillIds) {
        const stage = `skill.installed:${skillId}`;
        if (onboarding.stages[stage] || hasBootstrapReceipt(record.tokenId, 'skill.installed', skillId)) continue;
        const installedAt = nowIso();
        // Register skill before the mint so it's visible even if chain anchoring fails.
        store.skills.set(`${record.tokenId}:${skillId}`, { agentId: record.tokenId, skillId, installedAt });
        await stack.receiptMinter.mint({
          agentId: record.tokenId,
          actionTag: 'skill.installed',
          payload: { event: 'skill.installed', tokenId: record.tokenId, skillId, installedAt, source: 'deployment' },
          valueWei: 0n,
          clientReceiptId: `onboarding:${record.chainId}:${record.tokenId}:skill:${skillId}`,
        });
        onboarding.stages[stage] = true;
        await deploymentStore.setOnboarding({ ...onboarding, updatedAt: nowIso() });
      }

      onboarding.stages['status.finalized'] = true;
      onboarding.status = 'complete';
      onboarding.updatedAt = nowIso();
      await deploymentStore.setOnboarding(onboarding);
      await deploymentStore.update(record.tokenId, { status: 'initialized' });
      const agent = store.agents.get(record.tokenId);
      if (agent) store.agents.set(record.tokenId, { ...agent, status: 'initialized', updatedAt: nowIso() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deploymentStore.setOnboarding({ ...onboarding, status: onboarding.attempts >= 3 ? 'failed' : 'pending', error: message, updatedAt: nowIso() });
      if (onboarding.attempts >= 3) await deploymentStore.update(record.tokenId, { status: 'failed', error: message });
      app.log.warn({ tokenId: record.tokenId, err: message }, 'agent onboarding failed');
      throw err;
    }
  }

  async function enqueueOnboarding(record: DeploymentRecord): Promise<void> {
    const existing = await deploymentStore.getOnboarding(record.tokenId);
    if (existing?.status === 'complete' || existing?.status === 'running') return;
    await deploymentStore.setOnboarding(existing ?? { key: onboardingKey(record.chainId, record.tokenId), chainId: record.chainId, tokenId: record.tokenId, stages: {}, status: 'pending', attempts: 0, updatedAt: nowIso() });
    void runOnboarding(record).catch((err) => app.log.warn({ tokenId: record.tokenId, err }, 'onboarding background job failed'));
  }

  const provisionAgentOnChain = async (owner: string, metadataRoot?: string): Promise<{ id: string; accountAddress: string; metadataRoot: string; accountDeployTxHash?: string; identityMintTxHash?: string } | null> => {
    if (!options.accountFactoryAddress || !options.agentIdentityAddress) return null;

    const provider = (options.chainClient as unknown as { getProvider(): { getCode(addr: string): Promise<string>; call(tx: { to: string; data: string }): Promise<string>; getNetwork(): Promise<{ chainId: bigint }>; getTransactionCount(addr: string, blockTag: 'latest' | 'pending'): Promise<number>; getBalance(addr: string): Promise<bigint> } }).getProvider?.();

    // ── Preflight ──────────────────────────────────────────────────────────────
    if (provider) {
      // Verify chainId matches Aristotle (16661).
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 16661) {
        throw new Error(`provision-agent: RPC returned chainId ${network.chainId.toString()}, expected 16661 (Aristotle)`);
      }

      // Verify bytecode exists for both factory and identity contracts.
      const [factoryCode, identityCode] = await Promise.all([
        provider.getCode(options.accountFactoryAddress),
        provider.getCode(options.agentIdentityAddress),
      ]);
      if (factoryCode === '0x') {
        throw new Error(`AccountFactory at ${options.accountFactoryAddress} has no bytecode on chain 16661 — check ACCOUNT_FACTORY_ADDRESS env var`);
      }
      if (identityCode === '0x') {
        throw new Error(`AgentIdentity at ${options.agentIdentityAddress} has no bytecode on chain 16661 — check AGENT_IDENTITY_ADDRESS env var`);
      }

      // Verify signer balance (non-zero required for gas).
      const signerAddress = (options.chainClient as unknown as { getSigner(): { address: string } }).getSigner?.()?.address ?? '';
      const balanceHex = await provider.call({ to: '0x0000000000000000000000000000000000000000', data: '0x' }).catch(() => '0x0');
      void balanceHex; // checked via eth_getBalance instead

      // Check AgentIdentity.owner() to determine which key is authorized to mint.
      // selector: keccak256("owner()") = 0x8da5cb5b
      const ownerResult = await provider.call({ to: options.agentIdentityAddress, data: '0x8da5cb5b' });
      const identityOwner = ownerResult.length >= 66 ? getAddress('0x' + ownerResult.slice(-40)) : '';

      const signerIsOwner = signerAddress !== '' && identityOwner !== '' &&
        signerAddress.toLowerCase() === identityOwner.toLowerCase();

      if (!signerIsOwner && !options.agentDeployerKey) {
        // Throw structured error — caught by /v1/agents route to return a clean 403 with address info.
        throw Object.assign(
          new Error('Deployment signer is not authorized to call AgentIdentity.mint()'),
          { deployAuthError: true as const, identityOwner, signerAddress },
        );
      }

      const [latestNonce, pendingNonce, balanceWei] = await Promise.all([
        provider.getTransactionCount(signerAddress, 'latest'),
        provider.getTransactionCount(signerAddress, 'pending'),
        provider.getBalance(signerAddress),
      ]);

      app.log.info(
        {
          owner,
          factory: options.accountFactoryAddress,
          identity: options.agentIdentityAddress,
          router: options.paymentRouterAddress,
          chainId: 16661,
          identityOwner,
          signerAddress,
          latestNonce,
          pendingNonce,
          pendingCount: pendingNonce - latestNonce,
          balanceWei: balanceWei.toString(),
          usingDeployerKey: !signerIsOwner,
        },
        'provision-agent: preflight ok',
      );
    }

    // ── Build admin client (for onlyOwner calls) ───────────────────────────────
    // AccountFactory.createAccount is unrestricted — use the main edge signer.
    // AgentIdentity.mint and PaymentRouter.setAgentAccount are onlyOwner — use
    // the deployer key if provided, otherwise fall back to the main signer (which
    // only works if the signer IS the owner, enforced by the preflight above).
    const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai';
    const adminClient: typeof options.chainClient = options.agentDeployerKey
      ? (new ChainClient({ rpcUrl, chainId: 16661, signerKey: options.agentDeployerKey }) as unknown as typeof options.chainClient)
      : options.chainClient;

    const salt = bytes32From(`${owner}:${metadataRoot ?? ''}:${Date.now()}:${Math.random()}`);
    const metadataRootBytes = bytes32From(metadataRoot ?? `${owner}:${salt}`);
    const publicKey = bytes32From(`${owner}:apogee-agent-public-key`);

    // factory.predict / factory.createAccount — unrestricted, use edge signer
    const factory = options.chainClient.contract<AccountFactoryContract>(options.accountFactoryAddress, [
      'function predict(address owner,bytes32 salt) view returns (address)',
      'function createAccount(address owner,bytes32 salt) returns (address)',
    ]);

    // identity.mint / router.setAgentAccount — onlyOwner, use admin client
    const identity = adminClient.contract<AgentIdentityContract>(options.agentIdentityAddress, [
      'function nextTokenId() view returns (uint256)',
      'function mint(address to,bytes32 metadataRoot,bytes32 publicKey,address controller) returns (uint256)',
    ]);
    const router = adminClient.contract<PaymentRouterAdminContract>(options.paymentRouterAddress, [
      'function setAgentAccount(uint256 agentId,address account)',
    ]);

    async function submitLogged(method: string, signerAddress: string, submit: () => Promise<TxResponse>): Promise<string> {
      let lastError: unknown;
      const lockKey = `tx:${options.chainId}:${signerAddress.toLowerCase()}`;
      return txLock.run(lockKey, method, signerAddress, async (lockWaitMs) => {
        for (let attempt = 0; attempt <= DEPLOY_RETRY_BACKOFF_MS.length; attempt += 1) {
          try {
            const tx = await submit();
            app.log.info({ method, signerAddress, hash: tx.hash, nonce: tx.nonce, gasPrice: tx.gasPrice?.toString() ?? null, maxFeePerGas: tx.maxFeePerGas?.toString() ?? null, maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null, attempt, lockWaitMs }, 'provision-agent: tx submitted');
            const receipt = await tx.wait() as { status?: number | null; gasUsed?: bigint };
            if (receipt.status !== 1) throw new Error(`${method} did not confirm successfully for ${tx.hash} (status ${receipt.status ?? 'unknown'})`);
            app.log.info({ method, signerAddress, hash: tx.hash, nonce: tx.nonce, status: receipt.status, gasUsed: receipt.gasUsed?.toString(), attempt, lockWaitMs }, 'provision-agent: tx confirmed');
            return tx.hash;
          } catch (error) {
            lastError = error;
            if (!isReplacementUnderpriced(error) || attempt >= DEPLOY_RETRY_BACKOFF_MS.length) break;
            const delayMs = DEPLOY_RETRY_BACKOFF_MS[attempt] ?? 1_500;
            app.log.warn({ method, signerAddress, attempt, delayMs, lockWaitMs }, 'provision-agent: nonce collision/replacement underpriced; retrying with fresh pending nonce after backoff');
            await sleep(delayMs);
          }
        }
        throw lastError instanceof Error ? lastError : new Error(`${method} transaction failed`);
      });
    }

    const signerAddress = (options.chainClient as unknown as { getSigner(): { address: string } }).getSigner?.()?.address ?? 'unknown';
    const adminSignerAddress = (adminClient as unknown as { getSigner(): { address: string } }).getSigner?.()?.address ?? signerAddress;
    const tokenId = await identity.nextTokenId();
    app.log.info({ owner, salt, tokenId: tokenId.toString() }, 'provision-agent: calling predict');
    const accountAddress = await factory.predict(owner, salt);
    app.log.info({ accountAddress }, 'provision-agent: predict ok — creating account');
    const accountDeployTxHash = await submitLogged('AccountFactory.createAccount', signerAddress, () => factory.createAccount(owner, salt));
    app.log.info({ accountAddress, tokenId: tokenId.toString() }, 'provision-agent: account created — minting identity');
    const identityMintTxHash = await submitLogged('AgentIdentity.mint', adminSignerAddress, () => identity.mint(owner, metadataRootBytes, publicKey, accountAddress));
    app.log.info({ tokenId: tokenId.toString() }, 'provision-agent: identity minted — registering with router');
    await submitLogged('PaymentRouter.setAgentAccount', adminSignerAddress, () => router.setAgentAccount(tokenId, accountAddress));
    app.log.info({ owner, accountAddress, id: tokenId.toString() }, 'provision-agent: done');
    return { id: tokenId.toString(), accountAddress, metadataRoot: metadataRootBytes, accountDeployTxHash, identityMintTxHash };
  };

  app.post('/v1/auth/siwe/nonce', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['auth'], body: siweNonceBodySchema, response: { 200: nonceResponseSchema } } }, async (request) => {
    const body = siweNonceBodySchema.parse(request.body);
    const nonce = newId('nonce');
    const message = siweMessage(body.address, nonce, body.domain ?? 'apogee.local', body.uri ?? 'https://apogee.local', body.chainId);
    store.nonces.set(nonce, { nonce, message, expiresAt: Date.now() + 10 * 60_000 });
    return { nonce, message };
  });

  app.post('/v1/auth/siwe/verify', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['auth'], body: siweVerifyBodySchema, response: { 200: jwtResponseSchema } } }, async (request, reply) => {
    const body = siweVerifyBodySchema.parse(request.body);
    const address = parseSiweAddress(body.message);
    if (!address) return problem(reply, 401, 'Invalid SIWE message', 'Could not parse EIP-4361 address');
    const nonce = body.message.match(/Nonce: ([A-Za-z0-9_-]+)/)?.[1];
    const stored = nonce ? store.nonces.get(nonce) : null;
    if (!stored || stored.expiresAt <= Date.now() || stored.message !== body.message) return problem(reply, 401, 'Invalid nonce', 'SIWE nonce is missing, expired, or already used');
    const recovered = options.chainClient.verifyMessage?.(body.message, body.signature);
    if (!recovered || recovered.toLowerCase() !== address.toLowerCase()) return problem(reply, 401, 'Invalid signature', 'SIWE signature did not match the claimed address');
    if (nonce) store.nonces.delete(nonce);
    const token = app.jwt.sign({ address }, { expiresIn: '12h' });
    return { token, address };
  });


  app.get('/v1/auth/deploy-nonce', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['auth'], response: { 200: deployNonceResponseSchema } } }, async (request, reply) => {
    if (!DEPLOY_AUTH_ENABLED) return problem(reply, 404, 'Deploy authorization disabled', 'EIP-712 deployment authorization is disabled; use the legacy deploy endpoint.');
    const user = await requireAuth(request);
    const now = nowIso();
    const deadline = Math.floor(Date.now() / 1000) + 10 * 60;
    const record = await deployNonceStore.issue(user.address, now, deadline);
    return { owner: user.address, nonce: record.nonce, deadline: record.deadline, chainId: 16661 as const };
  });

  // Background-cached chain status — refreshed every 30s so health endpoint is instant
  const chainCache = {
    galileo:   { ok: false, chainId: 16602, rpc: process.env.ZERO_G_GALILEO_RPC_URL   ?? 'https://evmrpc-testnet.0g.ai' } as z.infer<typeof chainStatusSchema>,
    aristotle: { ok: false, chainId: 16661, rpc: process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai'        } as z.infer<typeof chainStatusSchema>,
  };

  async function checkRpc(rpcUrl: string, chainId: number): Promise<z.infer<typeof chainStatusSchema>> {
    const t0 = Date.now();
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json() as { result?: string };
      const ok = typeof data.result === 'string' && data.result.startsWith('0x');
      const blockNumber = ok ? Number(BigInt(data.result ?? '0x0')) : undefined;
      return { ok, chainId, blockNumber, latencyMs: Date.now() - t0, rpc: rpcUrl };
    } catch {
      return { ok: false, chainId, latencyMs: Date.now() - t0, rpc: rpcUrl };
    }
  }

  async function refreshChainCache(): Promise<void> {
    const [g, a] = await Promise.all([
      checkRpc(chainCache.galileo.rpc, 16602),
      checkRpc(chainCache.aristotle.rpc, 16661),
    ]);
    chainCache.galileo = g;
    chainCache.aristotle = a;
  }

  async function syncRuntimeHeartbeat(): Promise<void> {
    const metricsUrl = process.env.RUNTIME_METRICS_URL ?? 'http://localhost:9100';
    try {
      const res = await fetch(`${metricsUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json() as { lastHeartbeat?: typeof store.lastHeartbeat };
        if (data.lastHeartbeat) Object.assign(store.lastHeartbeat, data.lastHeartbeat);
      }
    } catch { /* runtime not reachable — keep stored state */ }
  }

  // ── Startup authorization preflight ──────────────────────────────────────────
  // Checks: chainId, bytecode for all 4 contracts, and whether the configured
  // signer (edge or deployer) is authorized to call AgentIdentity.mint().
  // Non-fatal — logs warnings; actual enforcement happens per-request in provisionAgentOnChain.
  async function runDeployAuthPreflight(): Promise<void> {
    if (!options.accountFactoryAddress || !options.agentIdentityAddress) return;
    type P = { getCode(a: string): Promise<string>; call(t: { to: string; data: string }): Promise<string>; getNetwork(): Promise<{ chainId: bigint }> };
    const provider = (options.chainClient as unknown as { getProvider?(): P }).getProvider?.();
    if (!provider) {
      app.log.warn('deploy-auth preflight: chainClient has no getProvider() — skipping');
      return;
    }
    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId !== 16661) {
        app.log.error({ chainId, expected: 16661 }, 'deploy-auth preflight: RPC chainId mismatch — contracts are on Aristotle (16661)');
        return;
      }

      const [factoryCode, identityCode, routerCode, bookCode] = await Promise.all([
        provider.getCode(options.accountFactoryAddress),
        provider.getCode(options.agentIdentityAddress),
        provider.getCode(options.paymentRouterAddress),
        provider.getCode(options.receiptBookAddress),
      ]);
      const missing = [
        factoryCode  === '0x' && `AccountFactory(${options.accountFactoryAddress})`,
        identityCode === '0x' && `AgentIdentity(${options.agentIdentityAddress})`,
        routerCode   === '0x' && `PaymentRouter(${options.paymentRouterAddress})`,
        bookCode     === '0x' && `ReceiptBook(${options.receiptBookAddress})`,
      ].filter(Boolean as unknown as (x: unknown) => x is string);
      if (missing.length > 0) {
        app.log.error({ missing }, 'deploy-auth preflight: contracts missing bytecode — check env address vars');
      }

      // AgentIdentity.owner() — selector 0x8da5cb5b
      const ownerResult = await provider.call({ to: options.agentIdentityAddress, data: '0x8da5cb5b' });
      const identityOwner = ownerResult.length >= 66 ? getAddress('0x' + ownerResult.slice(-40)) : '';
      const edgeSignerAddress = (options.chainClient as unknown as { getSigner?(): { address: string } }).getSigner?.()?.address ?? '';

      let deployerAddress = '';
      if (options.agentDeployerKey) {
        const { Wallet } = await import('ethers');
        deployerAddress = new Wallet(options.agentDeployerKey).address;
      }

      const signerIsOwner   = edgeSignerAddress !== '' && identityOwner !== '' && edgeSignerAddress.toLowerCase()  === identityOwner.toLowerCase();
      const deployerIsOwner = deployerAddress   !== '' && identityOwner !== '' && deployerAddress.toLowerCase()    === identityOwner.toLowerCase();
      const authorized = signerIsOwner || deployerIsOwner;

      app.log.info({
        chainId,
        contractsOk: missing.length === 0,
        identityOwner,
        edgeSignerAddress,
        deployerAddress: deployerAddress || null,
        authorized,
        usingDeployerKey: !signerIsOwner && deployerIsOwner,
      }, authorized
        ? 'deploy-auth preflight: OK — agent provisioning authorized'
        : 'deploy-auth preflight: UNAUTHORIZED — set AGENT_DEPLOYER_PRIVATE_KEY on the @apogee/edge Railway service'
      );

      if (!authorized) {
        app.log.warn(
          `deploy-auth: Agent deployment will fail at runtime. ` +
          `AgentIdentity(${options.agentIdentityAddress}).owner() = ${identityOwner}. ` +
          `Edge signer ${edgeSignerAddress} is not the owner. ` +
          `AGENT_DEPLOYER_PRIVATE_KEY is ${options.agentDeployerKey ? 'set but resolves to wrong address' : 'not set'}. ` +
          `Fix: railway variables set AGENT_DEPLOYER_PRIVATE_KEY=<key for ${identityOwner}> --service @apogee/edge --environment production`,
        );
      }
    } catch (err) {
      app.log.warn({ err }, 'deploy-auth preflight: check failed (non-fatal)');
    }
  }

  // Restore lastHeartbeat from Redis after restarts so demo cards don't reset.
  async function restoreHeartbeatFromRedis(): Promise<void> {
    if (!redis) return;
    try {
      const raw = await redis.get('edge:lastHeartbeat');
      if (raw) {
        const saved = JSON.parse(raw) as Partial<typeof store.lastHeartbeat>;
        if (saved.aurora) store.lastHeartbeat.aurora = saved.aurora;
        if (saved.vesper) store.lastHeartbeat.vesper = saved.vesper;
        if (saved.helix)  store.lastHeartbeat.helix  = saved.helix;
      }
    } catch { /* non-fatal — keep in-memory defaults */ }
  }

  async function persistHeartbeatToRedis(): Promise<void> {
    if (!redis) return;
    try {
      await redis.set('edge:lastHeartbeat', JSON.stringify(store.lastHeartbeat), 'EX', 7 * 86400);
    } catch { /* non-fatal */ }
  }

  // Start background refresh on server ready; clear on close
  let chainRefreshTimer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', () => {
    void restoreHeartbeatFromRedis();
    void refreshChainCache();
    void syncRuntimeHeartbeat();
    if (options.accountFactoryAddress && options.agentIdentityAddress) void runDeployAuthPreflight();
    chainRefreshTimer = setInterval(() => {
      void refreshChainCache();
      void syncRuntimeHeartbeat();
    }, 30_000);
  });

  app.get('/v1/health', { schema: { tags: ['system'], response: { 200: healthSchema } } }, () => {
    return {
      ok: chainCache.aristotle.ok,
      uptimeSec: Math.floor(process.uptime()),
      version: '0.5.0',
      db: { ok: true, note: redis ? 'edge memory store plus Redis lifecycle indexes' : 'in-memory store' },
      redis: { ok: Boolean(redis), note: redis ? 'used for hidden agents, lifecycle records, receipt idempotency, and tx locks' : 'not configured' },
      chain: { galileo: chainCache.galileo, aristotle: chainCache.aristotle },
      runtime: { workers: store.agents.size, lastHeartbeat: store.lastHeartbeat },
    };
  });
  app.get('/health', async () => ({ ok: true, uptimeSec: Math.floor(process.uptime()), version: '0.5.0' }));

  app.get('/v1/stats', { schema: { tags: ['system'] } }, async () => {
    await syncOnChainAgents();
    await syncOnChainReceipts();
    const receipts = receiptRows().filter((receipt) => receipt.status === 'minted');
    const demoAgentIds = new Set(receipts.map((receipt) => receipt.agentId));
    const totalFlowed = receipts.reduce((sum, receipt) => {
      try {
        return sum + BigInt(receipt.valueWei ?? '0');
      } catch {
        return sum;
      }
    }, 0n);
    const activeAgents = [...store.agents.values()].filter((agent) => measurableStatus(agent.id, agent.status) === 'active').length;
    const agents = Math.max(store.agents.size, demoAgentIds.size);

    return {
      receipts: receipts.length,
      agents,
      totalFlowedWei: totalFlowed.toString(),
      totalAgents: agents,
      totalReceipts: receipts.length,
      totalVolumeWei: totalFlowed.toString(),
      activeAgents,
    };
  });


  app.get('/v1/receipts/heatmap', { schema: { tags: ['receipts'], querystring: z.object({ days: z.coerce.number().int().positive().max(30).default(7), scope: z.enum(['owned', 'global']).default('global') }) } }, async (request) => {
    await syncOnChainReceipts();
    const query = z.object({ days: z.coerce.number().int().positive().max(30).default(7), scope: z.enum(['owned', 'global']).default('global') }).parse(request.query);
    let rows = receiptRows().filter((receipt) => receipt.status === 'minted');
    if (query.scope === 'owned') {
      const user = await requireAuth(request);
      await syncOnChainAgents();
      const ownedAgentIds = new Set([...store.agents.values()].filter((agent) => sameAddress(agent.owner, user.address)).map((agent) => agent.id));
      rows = rows.filter((receipt) => ownedAgentIds.has(receipt.agentId));
    }
    const cells = new Map<string, { day: number; hour: number; count: number }>();
    const now = Date.now();
    for (const receipt of rows) {
      const created = new Date(receipt.createdAt).getTime();
      if (!Number.isFinite(created)) continue;
      const ageDays = Math.floor((now - created) / 86_400_000);
      if (ageDays < 0 || ageDays >= query.days) continue;
      const day = query.days - 1 - ageDays;
      const hour = new Date(receipt.createdAt).getHours();
      const key = `${day}:${hour}`;
      const cell = cells.get(key) ?? { day, hour, count: 0 };
      cell.count += 1;
      cells.set(key, cell);
    }
    return [...cells.values()].sort((a, b) => a.day - b.day || a.hour - b.hour);
  });

  // ── Public proofs data (no auth, ISR-friendly) ────────────────────────────
  app.get('/v1/proofs', { schema: { tags: ['system'] } }, async (request) => {
    await syncOnChainReceipts();
    const chainParam = (request.query as Record<string, string>)['chain'] ?? 'aristotle';
    const chainId = chainParam === 'galileo' ? 16602 : 16661;
    const allReceipts = [...store.receipts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const mintedReceipts = allReceipts.filter((receipt) => receipt.status === 'minted');
    const last50 = allReceipts.slice(0, 50);

    // 14d × 24h heatmap
    const now = Date.now();
    const heatmap: Record<string, Record<number, number>> = {};
    for (let d = 0; d < 14; d++) {
      const day = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
      heatmap[day] = {};
      for (let h = 0; h < 24; h++) heatmap[day][h] = 0;
    }
    for (const r of mintedReceipts) {
      const dt = new Date(r.createdAt);
      const day = dt.toISOString().slice(0, 10);
      const hour = dt.getUTCHours();
      if (heatmap[day]) heatmap[day][hour] = (heatmap[day][hour] ?? 0) + 1;
    }

    // Map slugs to their on-chain tokenIds (from env vars with known fallbacks).
    // Chain-synced receipts use numeric agentIds; runtime-pushed receipts use slug names.
    // We match both so demo cards show correct counts regardless of how receipts arrived.
    const DEMO_TOKEN_IDS: Record<string, string> = {
      aurora: process.env.AURORA_AGENT_ID ?? '1',
      vesper: process.env.VESPER_AGENT_ID ?? '2',
      helix:  process.env.HELIX_AGENT_ID  ?? '3',
    };
    const demoAgents = ['aurora', 'vesper', 'helix'].map(slug => {
      const tokenId = DEMO_TOKEN_IDS[slug];
      const agentReceipts = mintedReceipts.filter(r =>
        r.agentId.toLowerCase().includes(slug) || r.agentId === tokenId,
      );
      return {
        slug,
        agentId: agentReceipts[0]?.agentId ?? null,
        receiptCount: agentReceipts.length,
        lastHeartbeat: store.lastHeartbeat[slug as keyof typeof store.lastHeartbeat],
        runningForHours: store.lastHeartbeat[slug as keyof typeof store.lastHeartbeat]
          ? Math.floor((Date.now() - new Date(store.lastHeartbeat[slug as keyof typeof store.lastHeartbeat]!).getTime()) / 3_600_000)
          : null,
      };
    });

    // 5 random receipts that have a real 0G storage root (not a local fallback or bare payloadHash)
    const withRealStorage = allReceipts.filter(r =>
      r.status === 'minted' &&
      r.storageRoot &&
      !r.storageRoot.startsWith('local://') &&
      r.storageRoot !== r.payloadHash,
    );
    const storageProofSample = [...withRealStorage]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map(r => ({
      receiptId: r.receiptId,
      agentId: r.agentId,
      actionTag: r.actionTag,
      payloadHash: r.payloadHash,
      storageRoot: r.storageRoot,
      storageTxHash: r.storageTxHash,
      txHash: r.txHash,
      status: r.status,
      createdAt: r.createdAt,
    }));

    return {
      chainId,
      generatedAt: new Date().toISOString(),
      totalReceipts: receiptRows().filter((receipt) => receipt.status === 'minted').length,
      demoAgents,
      receipts: last50,
      heatmap,
      storageProofSample,
    };
  });

  // Internal endpoint for runtime to push heartbeat state
  app.post('/internal/heartbeat', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    schema: { hide: true, body: z.object({ aurora: z.string().nullable().optional(), vesper: z.string().nullable().optional(), helix: z.string().nullable().optional() }) },
  }, async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return problem(reply, 401, 'Unauthorized', 'Invalid internal secret.');
    const body = request.body as { aurora?: string | null; vesper?: string | null; helix?: string | null };
    if (body.aurora !== undefined) store.lastHeartbeat.aurora = body.aurora;
    if (body.vesper !== undefined) store.lastHeartbeat.vesper = body.vesper;
    if (body.helix  !== undefined) store.lastHeartbeat.helix  = body.helix;
    void persistHeartbeatToRedis();
    return { ok: true };
  });

  const agentDiscoveredSchema = z.object({
    chainId: z.number().int().positive().default(options.chainId),
    tokenId: z.string().min(1),
    owner: addressSchema,
    accountAddress: addressSchema.optional(),
    controller: addressSchema.optional(),
    createdAt: z.string().optional(),
  });

  app.post('/internal/agent-discovered', { schema: { hide: true, body: agentDiscoveredSchema } }, async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return problem(reply, 401, 'Unauthorized', 'Invalid internal secret.');
    const body = agentDiscoveredSchema.parse(request.body);
    const now = nowIso();
    const existing = store.agents.get(body.tokenId);
    const agent: AgentRecord = {
      id: body.tokenId,
      name: existing?.name ?? `Agent #${body.tokenId}`,
      owner: body.owner,
      ownerAddress: body.owner,
      identityTokenId: body.tokenId,
      accountAddress: body.accountAddress ?? body.controller ?? existing?.accountAddress,
      metadataRoot: existing?.metadataRoot,
      policyId: existing?.policyId,
      balanceWei: existing?.balanceWei ?? '0',
      kpis: existing?.kpis ?? { runs: 0, receipts: receiptRows(body.tokenId).length },
      status: existing?.status ?? 'activating',
      createdAt: body.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    store.agents.set(body.tokenId, agent);
    let deployment = await deploymentStore.get(body.tokenId);
    if (!deployment) {
      deployment = { chainId: body.chainId, tokenId: body.tokenId, owner: body.owner, accountAddress: agent.accountAddress, controller: body.controller ?? agent.accountAddress, name: agent.name, selectedSkillIds: [], createdAt: agent.createdAt, status: 'activating' };
      await deploymentStore.set(deployment);
    }
    await enqueueOnboarding(deployment);
    return { ok: true, agent: await withAgentVisibility(agent) };
  });

  // Internal endpoint for runtime to push minted heartbeat receipts into the edge store
  app.post('/internal/receipt', {
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    schema: { hide: true },
  }, async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return problem(reply, 401, 'Unauthorized', 'Invalid internal secret.');
    const row = request.body as ReceiptIndexRow;
    if (!row?.receiptId) return problem(reply, 400, 'Bad request', 'Missing receiptId');
    const hasValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(row.txHash ?? '');
    const normalizedRow: ReceiptIndexRow = row.status === 'minted' && !hasValidTxHash
      ? { ...row, status: 'pending' }
      : row;
    store.receipts.set(normalizedRow.receiptId, normalizedRow);
    // Also persist to Redis so demo agent receipts survive edge restarts.
    if (redisReceiptIndex) {
      void redisReceiptIndex.insert(normalizedRow).catch(() => undefined);
    }
    broadcast(normalizedRow.agentId, { event: 'receipt', payload: json(normalizedRow) });
    return { ok: true };
  });

  app.post('/internal/retry-onboarding', { schema: { hide: true } }, async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) return problem(reply, 401, 'Unauthorized', 'Invalid internal secret.');
    const { tokenId } = z.object({ tokenId: z.string().min(1) }).parse(request.body);
    const deployment = await deploymentStore.get(tokenId);
    if (!deployment) return reply.status(404).send({ statusCode: 404, title: 'deployment not found', tokenId });
    const existing = await deploymentStore.getOnboarding(tokenId);
    if (existing && existing.status !== 'running') {
      // Reset stages too — the old billing code may have marked stages 'done' even when the TX failed.
      await deploymentStore.setOnboarding({ ...existing, status: 'pending', stages: {}, attempts: 0, updatedAt: nowIso() });
    }
    void runOnboarding(deployment).catch((err) => app.log.warn({ tokenId, err }, 'internal retry-onboarding failed'));
    return { ok: true, tokenId, message: 'Onboarding retry queued' };
  });

  async function deployAgentForUser(user: AuthUser, body: z.infer<typeof agentCreateSchema>, reply: FastifyReply, authorizationProof?: AuthorizationProof): Promise<AgentRecord | FastifyReply> {
    if (body.owner && !sameAddress(body.owner, user.address)) return problem(reply, 403, 'Forbidden', 'Cannot provision an agent for a different owner');
    let provisioned: Awaited<ReturnType<typeof provisionAgentOnChain>>;
    try {
      provisioned = await withTimeout(
        deployMutex.runExclusive(() => provisionAgentOnChain(user.address, body.metadataRoot)),
        DEPLOY_LOCK_TIMEOUT_MS,
        'Deployment lock timed out',
      );
    } catch (err) {
      const e = err as { deployAuthError?: boolean; identityOwner?: string; signerAddress?: string };
      if (e.deployAuthError) {
        return problem(reply, 403, 'Deployment not authorized',
          `Deployment signer is not authorized to call AgentIdentity.mint(). ` +
          `Expected owner: ${e.identityOwner} · ` +
          `Current edge signer: ${e.signerAddress} · ` +
          `Action: Set AGENT_DEPLOYER_PRIVATE_KEY (key for ${e.identityOwner}) on the @apogee/edge Railway service.`,
        );
      }
      if (isReplacementUnderpriced(err)) {
        app.log.warn({ err }, 'provision-agent: replacement underpriced after retries');
        return problem(reply, 409, 'Deployment transaction pending', 'A previous deployment transaction is still pending for the deployment signer. Wait for it to confirm before retrying.');
      }
      if ((err as { txLockBusy?: boolean }).txLockBusy) {
        return problem(reply, 409, 'Signer transaction queue busy', 'A signer transaction is already running. Wait briefly before retrying.');
      }
      if (err instanceof Error && err.message === 'Deployment lock timed out') {
        return problem(reply, 409, 'Deployment already running', 'A deployment is already running for this service. Wait for confirmation before retrying.');
      }
      throw err;
    }
    const now = nowIso();
    const id = provisioned?.id ?? String(store.nextAgentId++);
    const displayName = body.name?.trim() || (body.metadataRoot && !body.metadataRoot.startsWith('0x') ? body.metadataRoot : `Agent #${id}`);
    const policyAllowedSkills = Array.isArray(body.policy?.['allowedSkills']) ? body.policy['allowedSkills'].filter((value): value is string => typeof value === 'string') : undefined;
    const policyAllowedActions = Array.isArray(body.policy?.['allowedActions']) ? body.policy['allowedActions'].filter((value): value is string => typeof value === 'string') : undefined;
    const selectedSkills = [...new Set(body.skills ?? policyAllowedSkills ?? ['memory.write'])];
    const policyMaxPerTxWei = typeof body.policy?.['maxPerTxWei'] === 'string' ? body.policy['maxPerTxWei'] : undefined;
    const policyDailyCapWei = typeof body.policy?.['dailyCapWei'] === 'string' ? body.policy['dailyCapWei'] : undefined;
    const deploymentPolicy: DeploymentPolicyRecord = body.policy
      ? { maxPerTxWei: policyMaxPerTxWei, dailyCapWei: policyDailyCapWei, allowedSkills: policyAllowedSkills ?? selectedSkills, allowedActions: policyAllowedActions ?? policyAllowedSkills ?? selectedSkills }
      : { allowedSkills: selectedSkills, allowedActions: selectedSkills };
    const proof = authorizationProof ? { ...authorizationProof, tokenId: id, agentId: id } : undefined;
    const deployment: DeploymentRecord = {
      chainId: options.chainId,
      tokenId: id,
      owner: user.address,
      accountAddress: provisioned?.accountAddress ?? user.address,
      controller: provisioned?.accountAddress ?? user.address,
      name: displayName,
      description: body.description,
      selectedSkillIds: selectedSkills,
      policy: deploymentPolicy,
      createdAt: now,
      identityMintTxHash: provisioned?.identityMintTxHash,
      accountDeployTxHash: provisioned?.accountDeployTxHash,
      status: 'activating',
      authorizationProof: proof,
    };
    const agent: AgentRecord = {
      id,
      name: displayName,
      owner: user.address,
      ownerAddress: user.address,
      identityTokenId: provisioned?.id,
      accountAddress: provisioned?.accountAddress ?? user.address,
      balanceWei: '0',
      kpis: { runs: 0, receipts: 0, memory: 0, skills: selectedSkills.length },
      status: 'activating',
      createdAt: now,
      updatedAt: now,
      description: body.description,
      deployment: json(deployment),
      authorizationProof: proof ? json(proof) : undefined,
    };
    if (provisioned?.metadataRoot ?? body.metadataRoot) agent.metadataRoot = provisioned?.metadataRoot ?? body.metadataRoot;
    if (body.policyId) agent.policyId = body.policyId;
    if (body.policy) agent.policyId = agent.policyId ?? newId('policy');
    store.agents.set(agent.id, agent);
    await deploymentStore.set(deployment);
    if (proof) await deployNonceStore.attachToken(proof.owner, proof.nonce, id);

    for (const skillId of selectedSkills) {
      const install: SkillInstall = { agentId: agent.id, skillId, installedAt: now };
      store.skills.set(`${agent.id}:${skillId}`, install);
    }

    await enqueueOnboarding(deployment);
    return await withAgentVisibility(agent);
  }

  app.post('/v1/agents', { schema: { tags: ['agents'], body: agentCreateSchema, response: { 200: agentSchema } } }, async (request, reply) => {
    const user = await requireAuth(request);
    const body = agentCreateSchema.parse(request.body);
    return deployAgentForUser(user, body, reply);
  });


  app.post('/v1/agents/deploy-authorized', { schema: { tags: ['agents'], body: deployAuthorizedSchema, response: { 200: agentSchema } } }, async (request, reply) => {
    if (!DEPLOY_AUTH_ENABLED) return problem(reply, 404, 'Deploy authorization disabled', 'EIP-712 deployment authorization is disabled; use the legacy deploy endpoint.');
    const user = await requireAuth(request);
    const body = deployAuthorizedSchema.parse(request.body);
    const owner = body.authorization.owner;
    if (!sameAddress(owner, user.address)) return problem(reply, 403, 'Authorization owner mismatch', 'The deployment authorization must be signed by the authenticated wallet.');
    const issued = await deployNonceStore.get(owner, body.authorization.nonce);
    if (!issued) return problem(reply, 401, 'Authorization nonce missing', 'Request a new deployment authorization and sign again.');
    if (issued.deadline !== body.authorization.deadline) return problem(reply, 401, 'Authorization deadline mismatch', 'Request a new deployment authorization and sign again.');
    const nowSec = Math.floor(Date.now() / 1000);
    if (issued.status === 'issued' && issued.deadline <= nowSec) return problem(reply, 401, 'Authorization expired', 'Your deployment authorization expired. Please sign again.');
    if (issued.status === 'consumed') {
      if (issued.tokenId) {
        const existing = store.agents.get(issued.tokenId);
        if (existing && sameAddress(existing.owner, user.address)) return await withAgentVisibility(existing);
      }
      return problem(reply, 409, 'deployment_in_progress', 'This signed deployment authorization is already being processed. Wait a moment and refresh the agent list.');
    }
    if (issued.status === 'expired') return problem(reply, 401, 'Authorization expired', 'Your deployment authorization expired. Please sign again.');

    const message = buildDeployAuthorizationMessage({
      owner,
      name: body.form.name,
      description: body.form.description ?? '',
      skills: body.form.skills ?? [],
      policy: (body.form.policy ?? {}) as DeployPolicyInput,
      nonce: body.authorization.nonce,
      deadline: body.authorization.deadline,
    });
    const recovered = verifyTypedData(DEPLOY_AUTH_DOMAIN, DEPLOY_AUTH_TYPES, message, body.authorization.signature);
    if (!sameAddress(recovered, owner)) return problem(reply, 401, 'Invalid deployment signature', 'The wallet signature did not match the authenticated owner.');
    const digest = TypedDataEncoder.hash(DEPLOY_AUTH_DOMAIN, DEPLOY_AUTH_TYPES, message);
    const deploymentKeyValue = `deploy-auth:${options.chainId}:${owner.toLowerCase()}:${body.authorization.nonce}`;
    const consumed = await deployNonceStore.consume(owner, body.authorization.nonce, deploymentKeyValue);
    if (consumed.status === 'consumed' && consumed.tokenId) {
      const existing = store.agents.get(consumed.tokenId);
      if (existing && sameAddress(existing.owner, user.address)) return await withAgentVisibility(existing);
    }
    if (consumed.status !== 'consumed' && consumed.status !== 'issued') return problem(reply, 409, 'deployment_in_progress', 'This signed deployment authorization is already being processed.');
    const createdAt = nowIso();
    const proof: AuthorizationProof = { type: 'eip712', owner, signer: recovered, nonce: body.authorization.nonce, deadline: body.authorization.deadline, digest, signature: body.authorization.signature, createdAt };
    return deployAgentForUser(user, { ...body.form, metadataRoot: body.form.metadataRoot ?? body.form.name }, reply, proof);
  });

  app.get('/v1/agents', { schema: { tags: ['agents'], querystring: agentsQuerySchema, response: { 200: z.array(agentSchema) } } }, async (request) => {
    const user = await requireAuth(request);
    const query = agentsQuerySchema.parse(request.query);
    await syncOnChainAgents();
    await syncOnChainReceipts();
    const rows = await Promise.all([...store.agents.values()]
      .filter((agent) => agent.owner.toLowerCase() === user.address.toLowerCase())
      .map(withAgentVisibility));
    return rows.filter((agent) => query.includeHidden || !agent.hidden);
  });

  app.get('/v1/agents/:id', { schema: { tags: ['agents'], params: z.object({ id: idSchema }), querystring: agentsQuerySchema, response: { 200: agentSchema } } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const query = agentsQuerySchema.parse(request.query);
    await syncOnChainAgents();
    await syncOnChainReceipts();
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    const visibleAgent = await withAgentVisibility(agent);
    if (visibleAgent.hidden && !query.includeHidden) return problem(reply, 404, 'Agent hidden', 'This agent is hidden from your workspace. Restore it from the Hidden agents section.');
    return visibleAgent;
  });

  app.post('/v1/agents/:id/hide', { schema: { tags: ['agents'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    await hiddenAgentStore.setHidden({ chainId: options.chainId, ownerAddress: agent.owner.toLowerCase(), tokenId: agentTokenId(agent), hiddenAt: nowIso() });
    return { ok: true };
  });

  app.post('/v1/agents/:id/unhide', { schema: { tags: ['agents'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    await hiddenAgentStore.unsetHidden(options.chainId, agent.owner, agentTokenId(agent));
    return { ok: true };
  });

  app.post('/v1/agents/:id/retry-onboarding', { schema: { tags: ['agents'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    const tokenId = agentTokenId(agent);
    const deployment = await deploymentStore.get(tokenId);
    if (!deployment) return reply.status(404).send({ statusCode: 404, title: 'deployment record not found' });
    // Reset failed/stuck onboarding so runOnboarding will retry it.
    const existing = await deploymentStore.getOnboarding(tokenId);
    if (existing && existing.status !== 'running') {
      // Reset stages too — old billing code may have marked stages 'done' even when TX failed.
      await deploymentStore.setOnboarding({ ...existing, status: 'pending', stages: {}, attempts: 0, updatedAt: nowIso() });
    }
    void runOnboarding(deployment).catch((err) => app.log.warn({ tokenId, err }, 'retry-onboarding background job failed'));
    return { ok: true, tokenId, message: 'Onboarding retry queued' };
  });

  app.patch('/v1/agents/:id/policy', { schema: { tags: ['agents'], params: z.object({ id: idSchema }), body: policyPatchSchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    agent.policyId = agent.policyId ?? newId('policy');
    broadcast(id, { event: 'policy.changed', payload: json(policyPatchSchema.parse(request.body)) });
    return { policyId: agent.policyId, ...policyPatchSchema.parse(request.body) };
  });

  app.post('/v1/agents/:id/skills', { schema: { tags: ['skills'], params: z.object({ id: idSchema }), body: skillBodySchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    const body = skillBodySchema.parse(request.body);
    const install: SkillInstall = { agentId: id, skillId: body.skillId, installedAt: nowIso() };
    if (body.version) install.version = body.version;
    if (body.config !== undefined) install.config = body.config;
    store.skills.set(`${id}:${body.skillId}`, install);
    return install;
  });

  app.delete('/v1/agents/:id/skills/:skillId', { schema: { tags: ['skills'], params: z.object({ id: idSchema, skillId: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id, skillId } = z.object({ id: idSchema, skillId: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    store.skills.delete(`${id}:${skillId}`);
    return { ok: true };
  });

  app.post('/v1/agents/:id/run', { schema: { tags: ['runs'], params: z.object({ id: idSchema }), body: runBodySchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    runBodySchema.parse(request.body);
    const run: RunRecord = { id: newId('run'), agentId: id, status: 'queued', createdAt: nowIso(), updatedAt: nowIso(), receipts: [], steps: [{ id: newId('step'), name: 'queued', status: 'succeeded', createdAt: nowIso() }] };
    store.runs.set(run.id, run);
    broadcast(id, { event: 'run.step', payload: json(run.steps[0]) });
    return { runId: run.id };
  });


  app.get('/v1/agents/:id/runs', { schema: { tags: ['runs'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    return [...store.runs.values()]
      .filter((run) => run.agentId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  app.get('/v1/agents/:id/skills', { schema: { tags: ['skills'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, id);
    if (reply.sent || 'statusCode' in agent) return agent;
    const skills = [...store.skills.values()].filter((skill) => skill.agentId === id);
    const deployment = await deploymentStore.get(agentTokenId(agent));
    for (const skillId of deployment?.selectedSkillIds ?? []) {
      if (!skills.some((skill) => skill.skillId === skillId)) skills.push({ agentId: id, skillId, installedAt: deployment?.createdAt ?? agent.createdAt });
    }
    return skills;
  });

  app.get('/v1/runs/:runId', { schema: { tags: ['runs'], params: z.object({ runId: idSchema }), response: { 200: runSchema } } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { runId } = z.object({ runId: idSchema }).parse(request.params);
    return await ownedRun(reply, user, runId);
  });

  app.get('/v1/runs/:runId/receipts', { schema: { tags: ['runs'], params: z.object({ runId: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { runId } = z.object({ runId: idSchema }).parse(request.params);
    const run = await ownedRun(reply, user, runId);
    if (reply.sent || 'statusCode' in run) return run;
    return run.receipts;
  });

  app.get('/v1/skills', { schema: { tags: ['skills'], querystring: z.object({ tier: z.string().optional(), category: z.string().optional() }), response: { 200: z.array(skillManifestSchema) } } }, async (request) => {
    const { tier, category } = z.object({ tier: z.string().optional(), category: z.string().optional() }).parse(request.query);
    return DEFAULT_SKILLS.filter((skill) =>
      (!tier || skill.tier === tier) &&
      (!category || skill.category.toLowerCase() === category.toLowerCase()),
    );
  });

  app.post('/v1/services', { schema: { tags: ['services'], body: serviceBodySchema, response: { 200: serviceSchema } } }, async (request, reply) => {
    const user = await requireAuth(request);
    const body = serviceBodySchema.parse(request.body);
    const agent = await ownedAgent(reply, user, body.agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    const service: ServiceRecord = {
      id: newId('svc'),
      agentId: body.agentId,
      serviceId: body.serviceId,
      providerAddress: agent.accountAddress ?? agent.owner,
      name: body.serviceId,
      description: body.description ?? `Service exposed by agent ${body.agentId}`,
      tags: body.tags,
      priceWei: body.priceWei,
      pricePerTokenWei: body.priceWei,
    };
    store.services.set(service.id, service);
    return service;
  });

  app.get('/v1/services', { schema: { tags: ['services'], querystring: z.object({ tag: z.string().optional(), tags: z.string().optional() }), response: { 200: z.array(serviceSchema) } } }, async (request) => {
    const { tag, tags } = z.object({ tag: z.string().optional(), tags: z.string().optional() }).parse(request.query);
    const filter = tag ?? tags;
    const custom = [...store.services.values()];
    return [...DEFAULT_SERVICES, ...custom].filter((service) => !filter || service.tags.includes(filter));
  });

  app.post('/v1/quote', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags: ['billing'], body: quoteBodySchema, response: { 402: quoteResponseSchema } }, preHandler: async (request, reply) => {
    const body = quoteBodySchema.parse(request.body);
    if (!quoteByPayee.check(body.payeeAgentId)) return problem(reply, 429, 'Rate limit exceeded', 'Too many quotes for this payeeAgent');
    return undefined;
  } }, async (request, reply) => {
    const body = quoteBodySchema.parse(request.body);
    const quote = await stack.quoteIssuer.issue({ ...body, requestedAmount: bigintFrom(body.requestedAmount) });
    return reply.status(402).send({ ...quote, amount: quote.amount.toString(), nonce: quote.nonce.toString() });
  });

  app.post('/v1/settle', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['billing'], body: settleBodySchema }, preHandler: async (request, reply) => {
    const body = settleBodySchema.parse(request.body);
    if (body.payerAgentId && !settleByPayer.check(body.payerAgentId)) return problem(reply, 429, 'Rate limit exceeded', 'Too many settlements for this payerAgent');
    return undefined;
  } }, async (request) => stack.settlementHandler.settle(settleBodySchema.parse(request.body)));

  app.post('/v1/refund/:paymentId', { schema: { tags: ['billing'], params: z.object({ paymentId: idSchema }), body: refundBodySchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { paymentId } = z.object({ paymentId: idSchema }).parse(request.params);
    const body = refundBodySchema.parse(request.body);
    if (body.agentId) {
      const agent = await ownedAgent(reply, user, body.agentId);
      if (reply.sent || 'statusCode' in agent) return agent;
    }
    return stack.refundManager.refund({ paymentId, ...body });
  });

  app.post('/v1/refund', { schema: { hide: true, body: z.object({ paymentId: idSchema }).merge(refundBodySchema) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const body = z.object({ paymentId: idSchema }).merge(refundBodySchema).parse(request.body);
    if (body.agentId) {
      const agent = await ownedAgent(reply, user, body.agentId);
      if (reply.sent || 'statusCode' in agent) return agent;
    }
    return stack.refundManager.refund(body);
  });

  const listAgentMemory = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { agentId } = z.object({ agentId: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    const entries = [...store.memory.values()].filter((entry) => entry.agentId === agentId);
    const deployment = await deploymentStore.get(agentTokenId(agent));
    if (deployment?.bootstrapMemory && !entries.some((entry) => entry.key === deployment.bootstrapMemory?.key)) entries.push(deployment.bootstrapMemory);
    return entries.map((entry) => ({ id: entry.key, agentId: entry.agentId, key: entry.key, value: entry.value, version: 1, createdAt: entry.createdAt ?? entry.updatedAt, updatedAt: entry.updatedAt, tags: entry.tags, visibility: entry.visibility, storageRoot: entry.storageRoot, anchoredTxHash: entry.txHash }));
  };

  app.get('/v1/memory/:agentId', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema }) } }, listAgentMemory);
  app.get('/v1/agents/:agentId/memory', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema }) } }, listAgentMemory);

  app.put('/v1/memory/:agentId/:key', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema, key: idSchema }), body: memoryPutSchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { agentId, key } = z.object({ agentId: idSchema, key: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    const body = memoryPutSchema.parse(request.body);
    const record: MemoryRecord = { agentId, key, value: body.value, tags: body.tags, updatedAt: nowIso() };
    store.memory.set(`${agentId}:${key}`, record);
    return record;
  });

  app.get('/v1/memory/:agentId/:key', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema, key: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { agentId, key } = z.object({ agentId: idSchema, key: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    return store.memory.get(`${agentId}:${key}`) ?? problem(reply, 404, 'Memory key not found', key);
  });

  app.delete('/v1/memory/:agentId/:key', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema, key: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { agentId, key } = z.object({ agentId: idSchema, key: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    store.memory.delete(`${agentId}:${key}`);
    return { ok: true };
  });

  app.post('/v1/memory/:agentId/search', { schema: { tags: ['memory'], params: z.object({ agentId: idSchema }), body: memorySearchSchema } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { agentId } = z.object({ agentId: idSchema }).parse(request.params);
    const agent = await ownedAgent(reply, user, agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    const body = memorySearchSchema.parse(request.body);
    return [...store.memory.values()].filter((entry) => entry.agentId === agentId && JSON.stringify(entry.value).includes(body.query)).slice(0, body.limit);
  });

  app.get('/v1/receipts', { schema: { tags: ['receipts'], querystring: paginationSchema } }, async (request, reply) => {
    await syncOnChainReceipts();
    const query = paginationSchema.parse(request.query);
    let ownedAgentIds: Set<string> | null = null;
    if (query.scope !== 'global') {
      const user = await requireAuth(request);
      if (query.agentId) {
        const agent = await ownedAgent(reply, user, query.agentId);
        if (reply.sent || 'statusCode' in agent) return agent;
      }
      await syncOnChainAgents();
      ownedAgentIds = new Set([...store.agents.values()].filter((agent) => sameAddress(agent.owner, user.address)).map((agent) => agent.id));
    } else {
      await syncOnChainAgents();
    }
    const rows = receiptRows(query.agentId)
      .filter((receipt) => !ownedAgentIds || ownedAgentIds.has(receipt.agentId));
    return { items: rows.slice(0, query.limit), total: rows.length, scope: query.scope, nextCursor: null };
  });

  app.get('/v1/receipts/:id', { schema: { tags: ['receipts'], params: z.object({ id: idSchema }) } }, async (request, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const receipt = store.receipts.get(id);
    if (!receipt) return problem(reply, 404, 'Receipt not found', id);
    const agent = await ownedAgent(reply, user, receipt.agentId);
    if (reply.sent || 'statusCode' in agent) return agent;
    return receipt;
  });

  app.after(() => {
    app.get('/v1/stream/:agentId', { websocket: true }, (socket, request) => {
      const token = bearerFromSubprotocol(request.headers['sec-websocket-protocol']);
      if (!token) {
        socket.close();
        return;
      }
      try {
        const user = app.jwt.verify<AuthUser>(token);
        const { agentId } = z.object({ agentId: idSchema }).parse(request.params);
        const agent = store.agents.get(agentId);
        if (!agent || !sameAddress(agent.owner, user.address)) {
          socket.close();
          return;
        }
        const client = { send: (payload: string) => socket.send(payload), close: () => socket.close() };
        const clients = streamClients.get(agentId) ?? new Set<typeof client>();
        clients.add(client);
        streamClients.set(agentId, clients);
        socket.on('close', () => clients.delete(client));
      } catch {
        socket.close();
      }
    });

    app.get('/v1/stream', { websocket: true }, (socket) => {
      const client = { send: (payload: string) => socket.send(payload), close: () => socket.close() };
      const clients = streamClients.get(PUBLIC_STREAM_KEY) ?? new Set<typeof client>();
      clients.add(client);
      streamClients.set(PUBLIC_STREAM_KEY, clients);
      socket.on('close', () => clients.delete(client));
    });
  });

  // ── Pilot chat ────────────────────────────────────────────────────────────

  const pilotGuestLimiter = new FieldRateLimiter(5, 10 * 60_000);

  const pilotChatBody = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(4000),
    })).min(1).max(50),
  });

  async function executePilotTool(name: string, args: Record<string, unknown>, userAddress?: string): Promise<unknown> {
    if (name === 'getMyAgents') {
      if (!userAddress) return [];
      return [...store.agents.values()].filter(a => sameAddress(a.owner, userAddress));
    }
    if (name === 'listRecentReceipts') {
      const agentId = args.agentId ? String(args.agentId) : '';
      const limit = Math.min(Number(args.limit ?? 5), 20);
      return [...store.receipts.values()].filter(r => !agentId || r.agentId === agentId).slice(0, limit);
    }
    if (name === 'getMemorySummary') {
      const agentId = String(args.agentId ?? '');
      return [...store.memory.values()].filter(m => m.agentId === agentId).slice(0, 10).map(m => ({ key: m.key, tags: m.tags, updatedAt: m.updatedAt }));
    }
    if (name === 'getProtocolStats') {
      return { totalAgents: store.agents.size, totalReceipts: receiptRows().length, totalServices: store.services.size };
    }
    if (name === 'explainConcept') {
      const concepts: Record<string, string> = {
        agent: 'An autonomous AI agent with an ERC-4337 smart account, on-chain identity NFT, and configurable spending policy.',
        receipt: 'A cryptographic proof of an agent action stored in 0G decentralised storage and anchored on-chain.',
        policy: 'Spending rules: max per transaction, daily cap, active hours, and allowed skill addresses.',
        skill: 'A sandboxed capability module: chat.completion, web.search, memory.write, chain.query, etc.',
        memory: 'Encrypted agent state in 0G Storage with semantic search and on-chain version anchors.',
        '0g': '0G is a decentralised AI operating system providing storage, compute, and data availability layers.',
      };
      const key = String(args.name ?? '').toLowerCase();
      return concepts[key] ?? `No explanation found for "${String(args.name)}". Try: agent, receipt, policy, skill, memory.`;
    }
    return null;
  }

  async function* simulatePilotTokens(msg: string, toolResults: { name: string; result: unknown }[]): AsyncGenerator<string> {
    const lower = msg.toLowerCase();
    const agentList = (toolResults.find(t => t.name === 'getMyAgents')?.result ?? []) as Array<{ id?: string; balanceWei?: string }>;
    const receiptList = (toolResults.find(t => t.name === 'listRecentReceipts')?.result ?? []) as unknown[];

    let response: string;
    if (lower.includes('deploy') || lower.includes('first agent') || lower.includes('create agent')) {
      response = `To deploy your first agent, click **New agent** in the sidebar and follow the 5-step wizard:\n\n1. **Identity** — name and description\n2. **Funding** — copy the predicted ERC-4337 address to fund it\n3. **Policy** — set spending limits and active hours\n4. **Skills** — select capabilities (chat.completion, web.search, etc.)\n5. **Deploy** — confirm the on-chain transaction\n\nGas cost is ~0.02 0G on Galileo testnet.`;
    } else if (lower.includes('receipt')) {
      const n = receiptList.length;
      response = `Receipts are cryptographic proofs of every agent action.\n\nEach receipt contains:\n- **Action tag** — a \`bytes4\` keccak hash (e.g. \`pilot.chat\`)\n- **Amount** — 0G tokens spent\n- **Content hash** — stored in 0G decentralised storage\n- **On-chain anchor** — block number + tx hash\n\n${n > 0 ? `You have **${n}** receipt${n > 1 ? 's' : ''} on record.` : 'No receipts yet — they appear when your agents run.'} Navigate to **Receipts** in the sidebar for the full list.`;
    } else if (lower.includes('stop') || lower.includes('paused') || lower.includes('error')) {
      response = `Common reasons an agent stops:\n\n1. **Policy limit** — exceeded daily cap or per-tx max\n2. **Zero balance** — smart account ran out of 0G tokens\n3. **Skill error** — unhandled exception in a skill module\n4. **Manual pause** — disabled from the Settings tab\n\nCheck the **Activity** tab on the agent detail page for the last run log and error details.`;
    } else if (lower.includes('cost') || lower.includes('price') || lower.includes('estimate') || lower.includes('monthly')) {
      response = `Estimated costs on Galileo testnet:\n\n| Operation | Cost |\n|-----------|------|\n| Deploy agent | ~0.02 0G |\n| chat.completion | ~0.001 0G/call |\n| web.search | ~0.0005 0G/call |\n| memory.write | ~0.0002 0G/write |\n\nA typical agent at 100 tasks/day costs **~3–5 0G/month**. Adjust limits in the Policy settings.`;
    } else if (lower.includes('memory')) {
      response = `Agent memory is encrypted state stored in 0G decentralised storage.\n\nEach write:\n- Encrypts the value with AES-256-GCM\n- Uploads to 0G Storage (content-addressed)\n- Anchors the storage root on-chain via ReceiptBook\n\nYou can view, search (semantic), and anchor entries in the **Memory** section.`;
    } else if (lower.includes('demo run') || lower.includes('show me')) {
      response = `Here's a typical agent run:\n\n\`\`\`\n[00:00] Receives task via API\n[00:01] Calls web.search("latest 0G price")\n[00:12] Processes with chat.completion\n[00:18] Stores summary via memory.write\n[00:19] Mints receipt (tag: pilot.chat)\n[00:20] ✓ Done — cost: 0.0008 0G\n\`\`\`\n\nEvery step is logged in the **Activity** tab on the agent detail page.`;
    } else if (agentList.length > 0) {
      const a = agentList[0]!;
      const bal = (Number(BigInt(a.balanceWei ?? '0')) / 1e18).toFixed(6);
      response = `You have **${agentList.length}** agent${agentList.length > 1 ? 's' : ''}. Your first agent (\`${String(a.id ?? '').slice(0, 8)}…\`) has a balance of **${bal} 0G**.\n\nI can help you:\n- Check receipts and activity logs\n- Explain spending policies\n- Guide you through deploying more agents\n\nWhat would you like to know?`;
    } else {
      response = `I'm Apogee Pilot — your on-chain agent assistant.\n\nI can help you:\n- **Deploy and manage agents** on the 0G blockchain\n- **Understand receipts** and on-chain proofs\n- **Read agent memory** and activity\n- **Estimate costs** and configure policies\n\nTry: *"Deploy my first agent"* or *"Explain receipts"*.`;
    }

    for (const token of response.split(/(?<= )/)) {
      yield token;
      await new Promise<void>(r => setTimeout(r, 18 + Math.random() * 28));
    }
  }

  app.post('/v1/pilot/chat', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['pilot'], body: pilotChatBody },
  }, async (request, reply) => {
    let user: AuthUser | null = null;
    try { user = await requireAuth(request); } catch {}

    if (!user) {
      const guestIp = request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? request.ip;
      if (!pilotGuestLimiter.check(guestIp)) {
        return problem(reply, 429, 'Guest limit reached', 'Sign in to continue. Guests may send 5 messages per 10 minutes.');
      }
    }

    const body = pilotChatBody.parse(request.body);
    const lastMsg = body.messages[body.messages.length - 1];
    if (!lastMsg) return problem(reply, 400, 'Bad Request', 'messages array is empty');
    const userMsg = lastMsg.content;
    const lower = userMsg.toLowerCase();

    void reply.hijack();
    const res = reply.raw;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: string, data: unknown): void => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const toolsToRun: { name: string; args: Record<string, unknown> }[] = user
        ? [
            { name: 'getMyAgents', args: {} },
            ...(lower.includes('receipt') || lower.includes('spent') || lower.includes('cost')
              ? [{ name: 'listRecentReceipts', args: { limit: 5 } }]
              : []),
            ...(lower.includes('memory')
              ? [{ name: 'getMemorySummary', args: { agentId: '' } }]
              : []),
          ]
        : [{ name: 'getProtocolStats', args: {} }];

      const toolResults: { name: string; result: unknown }[] = [];
      for (const tool of toolsToRun) {
        emit('tool_call', { name: tool.name, args: tool.args });
        const result = await executePilotTool(tool.name, tool.args, user?.address);
        emit('tool_result', { name: tool.name, result });
        toolResults.push({ name: tool.name, result });
      }

      const chatId = newId('pilot');
      const assistantParts: string[] = [];
      let tokenCount = 0;

      const llmBase = process.env.PILOT_LLM_BASE_URL;
      const llmKey = process.env.PILOT_LLM_API_KEY;

      if (llmBase && llmKey) {
        const toolCtx = toolResults.map(t => `[${t.name}]\n${JSON.stringify(t.result, null, 2)}`).join('\n\n');
        const sysPrompt = `You are Apogee Pilot, an AI assistant embedded in the Apogee Protocol — an autonomous agent runtime on the 0G blockchain. Be concise, technical, and helpful. You only read data, never mutate state.\n\n${toolCtx ? `Current context:\n${toolCtx}` : ''}`;
        const llmRes = await fetch(`${llmBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmKey}` },
          body: JSON.stringify({
            model: process.env.PILOT_LLM_MODEL ?? 'gpt-4o-mini',
            messages: [{ role: 'system', content: sysPrompt }, ...body.messages],
            stream: true,
            max_tokens: 800,
          }),
        });
        if (llmRes.ok && llmRes.body) {
          const reader = llmRes.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          streamLoop: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (line === 'data: [DONE]') break streamLoop;
              if (!line.startsWith('data: ')) continue;
              try {
                const c = JSON.parse(line.slice(6)) as { choices?: [{ delta?: { content?: string } }] };
                const tok = c.choices?.[0]?.delta?.content ?? '';
                if (tok) { emit('token', tok); assistantParts.push(tok); tokenCount++; }
              } catch { /* malformed chunk */ }
            }
          }
        }
      } else {
        for await (const tok of simulatePilotTokens(userMsg, toolResults)) {
          emit('token', tok);
          assistantParts.push(tok);
          tokenCount++;
        }
      }

      emit('done', { chatId, tokensUsed: tokenCount });

      if (user) {
        const prev = store.pilotConversations.get(user.address) ?? { id: chatId, userAddress: user.address, messages: [] as PilotMsg[], createdAt: nowIso() };
        prev.messages.push(
          { role: 'user', content: userMsg, createdAt: nowIso() },
          { role: 'assistant', content: assistantParts.join(''), createdAt: nowIso() },
        );
        store.pilotConversations.set(user.address, prev);
      }
    } catch (err) {
      emit('error', { message: err instanceof Error ? err.message : 'Pilot error' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // ── End pilot ──────────────────────────────────────────────────────────────

  app.addHook('onClose', async () => {
    if (chainRefreshTimer) clearInterval(chainRefreshTimer);
    for (const clients of streamClients.values()) for (const client of clients) client.close();
  });

  process.once('SIGTERM', () => {
    void app.close().finally(() => process.exit(0));
  });

  // 90 seconds after startup: find all onboarding receipts still marked 'failed'
  // and re-run their onboarding. By then, store.receipts is populated from Redis
  // (the first health/receipt request triggers syncReceipts which takes ~60s).
  // Repeats every 3 minutes so transient TX-lock contention does not permanently block.
  // NOTE: 'running' in Redis at startup is ALWAYS stale (written by the dead previous
  // process) — we reset it unconditionally. For periodic runs we skip only if the
  // record was updated within the last 5 minutes (a genuinely in-flight onboarding).
  if (redis && redisReceiptIndex) {
    const retryFailedOnboardings = async (isFirstRun: boolean) => {
      try {
        const allReceipts = await redisReceiptIndex.list();
        const failedOnboardingAgents = new Set<string>();
        for (const r of allReceipts) {
          if (r.status === 'failed' && r.clientReceiptId?.startsWith(`onboarding:${options.chainId}:`)) {
            failedOnboardingAgents.add(r.agentId);
          }
        }
        if (failedOnboardingAgents.size === 0) return;
        app.log.info({ agents: [...failedOnboardingAgents] }, 'startup: found agents with failed onboarding receipts — queuing retries');
        for (const tokenId of failedOnboardingAgents) {
          const deployment = await deploymentStore.get(tokenId);
          if (!deployment) {
            app.log.warn({ tokenId }, 'startup: skipping — no deployment record in Redis');
            continue;
          }
          const existing = await deploymentStore.getOnboarding(tokenId);
          // On the first startup run, any 'running' status is stale (the previous
          // process crashed). On periodic runs, skip only if the record was updated
          // recently (i.e., runOnboarding is genuinely in-flight in this process).
          const updatedMs = existing?.updatedAt ? Date.parse(existing.updatedAt) : 0;
          const isActivelyRunning = !isFirstRun && existing?.status === 'running' && (Date.now() - updatedMs) < 5 * 60_000;
          if (isActivelyRunning) {
            app.log.info({ tokenId }, 'startup: skipping — onboarding is actively running');
            continue;
          }
          // Reset stages so runOnboarding re-attempts via receipt status, not stale stages dict.
          await deploymentStore.setOnboarding({ ...(existing ?? { key: onboardingKey(options.chainId, tokenId), chainId: options.chainId, tokenId, stages: {}, updatedAt: nowIso() }), status: 'pending', stages: {}, attempts: 0, updatedAt: nowIso() });
          void runOnboarding(deployment).catch((err) => app.log.warn({ tokenId, err }, 'startup onboarding retry failed'));
          app.log.info({ tokenId }, 'startup: queued onboarding retry for agent with failed receipts');
        }
      } catch (err) {
        app.log.warn({ err }, 'startup onboarding retry scan failed');
      }
    };
    setTimeout(() => {
      void retryFailedOnboardings(true);
      // Keep retrying every 3 minutes until cleared (handles TX-lock contention, etc.)
      setInterval(() => void retryFailedOnboardings(false), 3 * 60_000);
    }, 90_000);
  }

  return app;
}

export async function startFromEnv(): Promise<FastifyInstance> {
  // Always use Aristotle mainnet (16661) — contracts are deployed there, not Galileo (16602).
  const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai';
  const signerKey = process.env.EDGE_SERVICE_PRIVATE_KEY;
  const storageIndexerUrl = process.env.ZERO_G_STORAGE_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';

  const rawPaymentRouter   = process.env.PAYMENT_ROUTER_ADDRESS;
  const rawReceiptBook     = process.env.RECEIPT_BOOK_ADDRESS;
  const rawAccountFactory  = process.env.ACCOUNT_FACTORY_ADDRESS;
  const rawAgentIdentity   = process.env.AGENT_IDENTITY_ADDRESS;

  if (!signerKey || !rawPaymentRouter || !rawReceiptBook || !rawAccountFactory || !rawAgentIdentity) {
    throw new Error('Missing edge API environment: EDGE_SERVICE_PRIVATE_KEY, PAYMENT_ROUTER_ADDRESS, RECEIPT_BOOK_ADDRESS, ACCOUNT_FACTORY_ADDRESS, and AGENT_IDENTITY_ADDRESS are required');
  }

  const normalizeAddr = (raw: string, label: string): string => {
    try {
      return getAddress(raw.trim().toLowerCase());
    } catch {
      throw new Error(`${label} is not a valid Ethereum address: "${raw}"`);
    }
  };

  const paymentRouterAddress  = normalizeAddr(rawPaymentRouter,  'PAYMENT_ROUTER_ADDRESS');
  const receiptBookAddress    = normalizeAddr(rawReceiptBook,    'RECEIPT_BOOK_ADDRESS');
  const accountFactoryAddress = normalizeAddr(rawAccountFactory, 'ACCOUNT_FACTORY_ADDRESS');
  const agentIdentityAddress  = normalizeAddr(rawAgentIdentity,  'AGENT_IDENTITY_ADDRESS');

  // Optional: key for the deployer/owner wallet that can call onlyOwner functions
  // (AgentIdentity.mint, PaymentRouter.setAgentAccount). If absent, agent provisioning
  // will fail with a clear auth error instead of a raw estimateGas revert.
  const agentDeployerKey = process.env.AGENT_DEPLOYER_PRIVATE_KEY || undefined;

  // Log deployer address (never the key itself) so ops can verify authorization.
  if (agentDeployerKey) {
    const { Wallet } = await import('ethers');
    const deployerAddr = new Wallet(agentDeployerKey).address;
    console.info('[edge] startFromEnv agentDeployer=%s (AGENT_DEPLOYER_PRIVATE_KEY set)', deployerAddr);
  } else {
    console.warn('[edge] startFromEnv AGENT_DEPLOYER_PRIVATE_KEY not set — agent provisioning requires AgentIdentity.transferOwnership to edge signer first');
  }

  console.info('[edge] startFromEnv chainId=16661 rpc=%s paymentRouter=%s receiptBook=%s accountFactory=%s agentIdentity=%s',
    rpcUrl, paymentRouterAddress, receiptBookAddress, accountFactoryAddress, agentIdentityAddress);

  const chainClient = new ChainClient({ rpcUrl, chainId: 16661, signerKey }) as unknown as BillingChainClient & { verifyMessage(message: string, signature: string): string };
  const storageClient = new StorageClient({ rpcUrl, indexerUrl: storageIndexerUrl, signerKey }) as StorageBoundary;
  const app = buildEdgeServer({ chainClient, storageClient, signerKey, chainId: 16661, paymentRouterAddress, receiptBookAddress, accountFactoryAddress, agentIdentityAddress, agentDeployerKey, jwtSecret: process.env.EDGE_JWT_SECRET });
  await app.listen({ port: Number(process.env.PORT ?? 8080), host: '0.0.0.0' });
  return app;
}

if (process.env.APOGEE_EDGE_AUTOSTART === '1') void startFromEnv();
