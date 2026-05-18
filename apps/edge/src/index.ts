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
import { ComputeClient, type ChatStreamChunk, type ComputeMetadata } from '@apogee/compute-client';
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
const PILOT_CHAT_ACTION_TAG = 'PILO'; // bytes4 action tag for Apogee Pilot chat receipts.
const logErrorFields = (error: unknown): Record<string, unknown> => {
  const err = error as { message?: unknown; code?: unknown; name?: unknown; stack?: unknown; data?: unknown; reason?: unknown; transaction?: unknown; info?: unknown } | null | undefined;
  return { message: err?.message ?? String(error), code: err?.code, name: err?.name, stack: err?.stack, data: err?.data, reason: err?.reason, transaction: err?.transaction, info: err?.info };
};
const bigintSafeJson = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v);
const PILOT_SYSTEM_PROMPT = `You are Apogee Pilot, a precise technical guide to Apogee Protocol —
the autonomous-agent runtime on 0G. You explain:
- Apogee architecture: 9 contracts on 0G Aristotle mainnet (AgentAccount,
AccountFactory, PolicyEngine, AgentIdentity, PaymentRouter, EscrowVault,
RevenueSplitter, ServiceRegistry, ReceiptBook), receipt-first audit,
encrypted memory on 0G Storage, agent-to-agent payment rails.
- The 0G stack: Storage, Compute, Chain, Agent ID (ERC-7857 + ERC-8004),
TEE Sealed Inference.
- How to deploy an agent, set policies, install skills, read receipts.

Style: technical, concise, no marketing language. Use specifics.
When a question is unrelated to Apogee or 0G, redirect briefly.
NEVER invent contract addresses, transaction hashes, feature claims,
or roadmap items. If you don't know, say so. If the user asks for live
data (current receipt count, specific agent state), explain that you
cannot read live state in this version and point them to /proofs or
/agents.`;
type TxResponse = { hash: string; nonce?: number; gasPrice?: bigint | null; maxFeePerGas?: bigint | null; maxPriorityFeePerGas?: bigint | null; wait(): Promise<{ status?: number | null; gasUsed?: bigint } | unknown> };
type PilotMsg = { role: 'user' | 'assistant'; content: string; createdAt: string };
type PilotConvo = { id: string; userAddress: string; messages: PilotMsg[]; createdAt: string };
type PilotInferenceTier = 'compute' | 'http-llm' | 'simulate';
type AccountFactoryContract = { predict(owner: string, salt: string): Promise<string>; createAccount(owner: string, salt: string): Promise<TxResponse> };
type AgentIdentityContract = { nextTokenId(): Promise<bigint>; mint(to: string, metadataRoot: string, publicKey: string, controller: string): Promise<TxResponse> };
type PaymentRouterAdminContract = { setAgentAccount(agentId: bigint, account: string): Promise<TxResponse> };
type AgentIdentityReadContract = { nextTokenId(): Promise<bigint>; ownerOf(tokenId: bigint): Promise<string> };
type PaymentRouterReadContract = { agentAccounts(tokenId: bigint): Promise<string> };
type ReceiptBookReadContract = { nextReceiptId(): Promise<bigint>; receipts(receiptId: bigint): Promise<{ receiptId: bigint; agentId: bigint; actionTag: string; payloadHash: string; storageRoot: string; valueWei: bigint; timestamp: bigint } | [bigint, bigint, string, string, string, bigint, bigint]> };
type StorageClientWithBytes = StorageBoundary & { uploadBytes(data: Uint8Array): Promise<{ rootHash: string; txHash: string; size: number }> };

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
  return { address: getAddress(request.user.address) };
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
    mode: 'static',
    specification: {
      document: {
        openapi: '3.1.0',
        info: { title: 'APOGEE Edge API', version: '0.4.0', description: 'Autonomous-agent runtime API on 0G Aristotle mainnet (chainId 16661).' },
        servers: [{ url: '/v1', description: 'Edge API v1' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT from POST /v1/auth/siwe/verify' },
          },
          schemas: {
            Problem: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, instance: { type: 'string' } }, required: ['type', 'title', 'status', 'detail'] },
            Agent: {
              type: 'object',
              properties: {
                id: { type: 'string' }, name: { type: 'string' }, owner: { type: 'string' }, ownerAddress: { type: 'string' },
                accountAddress: { type: 'string' }, identityTokenId: { type: 'string' }, metadataRoot: { type: 'string' },
                balanceWei: { type: 'string' }, status: { type: 'string', enum: ['pending_deploy','deployed','activating','initialized','ready','active','paused','failed','deploying','error'] },
                createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
              },
              required: ['id', 'name', 'owner', 'ownerAddress', 'balanceWei', 'status', 'createdAt', 'updatedAt'],
            },
            Receipt: {
              type: 'object',
              properties: {
                id: { type: 'string' }, agentId: { type: 'string' }, actionTag: { type: 'string' },
                payloadHash: { type: 'string' }, storageRoot: { type: 'string' }, valueWei: { type: 'string' },
                txHash: { type: 'string' }, storageTxHash: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' },
                status: { type: 'string' }, clientReceiptId: { type: 'string' },
              },
              required: ['id', 'agentId'],
            },
            Skill: {
              type: 'object',
              properties: {
                id: { type: 'string' }, name: { type: 'string' }, version: { type: 'string' }, description: { type: 'string' },
                category: { type: 'string' }, tier: { type: 'string', enum: ['free', 'premium'] }, pricePerCallWei: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'name', 'version', 'description', 'category', 'tier', 'pricePerCallWei', 'tags'],
            },
            Page: {
              type: 'object',
              properties: {
                items: { type: 'array', items: {} },
                nextCursor: { type: 'string' },
                total: { type: 'integer' },
              },
              required: ['items'],
            },
          },
        },
        paths: {
          '/auth/siwe/nonce': {
            post: {
              summary: 'Request a SIWE nonce', operationId: 'siweNonce', tags: ['Auth'],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string', description: 'EVM address' }, domain: { type: 'string' }, uri: { type: 'string' }, chainId: { type: 'integer', default: 16661 } }, required: ['address'] } } } },
              responses: { '200': { description: 'Nonce + SIWE message string', content: { 'application/json': { schema: { type: 'object', properties: { nonce: { type: 'string' }, message: { type: 'string' } }, required: ['nonce', 'message'] } } } }, '400': { description: 'Bad request', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Problem' } } } } },
            },
          },
          '/auth/siwe/verify': {
            post: {
              summary: 'Verify a signed SIWE message and return a JWT', operationId: 'siweVerify', tags: ['Auth'],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, signature: { type: 'string' } }, required: ['message', 'signature'] } } } },
              responses: { '200': { description: 'JWT token', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, address: { type: 'string' } }, required: ['token', 'address'] } } } }, '401': { description: 'Invalid signature' } },
            },
          },
          '/auth/deploy-nonce': {
            get: {
              summary: 'Request a deploy-authorization nonce (requires JWT)', operationId: 'deployNonce', tags: ['Auth'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'owner', in: 'query', required: true, schema: { type: 'string' }, description: 'Owner EVM address' }],
              responses: { '200': { description: 'Deploy nonce', content: { 'application/json': { schema: { type: 'object', properties: { owner: { type: 'string' }, nonce: { type: 'string' }, deadline: { type: 'integer' }, chainId: { type: 'integer', example: 16661 } }, required: ['owner', 'nonce', 'deadline', 'chainId'] } } } }, '401': { description: 'Unauthorized' } },
            },
          },
          '/health': {
            get: {
              summary: 'Service health', operationId: 'health', tags: ['System'],
              responses: { '200': { description: 'Health status', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, uptimeSec: { type: 'number' }, version: { type: 'string' }, db: { type: 'object', properties: { ok: { type: 'boolean' }, note: { type: 'string' } } }, redis: { type: 'object', properties: { ok: { type: 'boolean' }, note: { type: 'string' } } }, runtime: { type: 'object', properties: { workers: { type: 'integer' }, lastHeartbeat: { type: 'object', properties: { aurora: { type: 'string', nullable: true }, vesper: { type: 'string', nullable: true }, helix: { type: 'string', nullable: true } } } } } }, required: ['ok', 'uptimeSec', 'version'] } } } } },
            },
          },
          '/stats': {
            get: {
              summary: 'Protocol-level statistics', operationId: 'stats', tags: ['System'],
              responses: { '200': { description: 'Stats object', content: { 'application/json': { schema: { type: 'object', properties: { totalAgents: { type: 'integer' }, totalReceipts: { type: 'integer' }, totalValueWei: { type: 'string' } } } } } } },
            },
          },
          '/proofs': {
            get: {
              summary: 'Public proof summary for demo agents', operationId: 'proofs', tags: ['System'],
              responses: { '200': { description: 'Proof summary', content: { 'application/json': { schema: { type: 'object' } } } } },
            },
          },
          '/receipts': {
            get: {
              summary: 'List receipts', operationId: 'listReceipts', tags: ['Receipts'],
              parameters: [
                { name: 'agentId', in: 'query', schema: { type: 'string' }, description: 'Filter by agent ID' },
                { name: 'scope', in: 'query', schema: { type: 'string', enum: ['owned', 'global'], default: 'owned' } },
                { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
                { name: 'cursor', in: 'query', schema: { type: 'string' } },
              ],
              responses: { '200': { description: 'Paginated receipts', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { '$ref': '#/components/schemas/Receipt' } }, nextCursor: { type: 'string' } } } } } } },
            },
          },
          '/receipts/heatmap': {
            get: {
              summary: 'Receipt activity heatmap', operationId: 'receiptsHeatmap', tags: ['Receipts'],
              parameters: [
                { name: 'days', in: 'query', schema: { type: 'integer', default: 14 } },
                { name: 'scope', in: 'query', schema: { type: 'string', enum: ['owned', 'global'], default: 'global' } },
              ],
              responses: { '200': { description: 'Heatmap data', content: { 'application/json': { schema: { type: 'object' } } } } },
            },
          },
          '/receipts/{id}': {
            get: {
              summary: 'Get a receipt by ID', operationId: 'getReceipt', tags: ['Receipts'],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Receipt', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Receipt' } } } }, '404': { description: 'Not found' } },
            },
          },
          '/agents': {
            post: {
              summary: 'Create and deploy an agent', operationId: 'createAgent', tags: ['Agents'], security: [{ bearerAuth: [] }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { owner: { type: 'string' }, name: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 1000 }, skills: { type: 'array', items: { type: 'string' } }, policy: { type: 'object' } } } } } },
              responses: { '201': { description: 'Created agent', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Agent' } } } }, '401': { description: 'Unauthorized' } },
            },
            get: {
              summary: 'List agents', operationId: 'listAgents', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [
                { name: 'scope', in: 'query', schema: { type: 'string', enum: ['owned', 'global'], default: 'owned' } },
                { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
                { name: 'cursor', in: 'query', schema: { type: 'string' } },
                { name: 'includeHidden', in: 'query', schema: { type: 'boolean', default: false } },
              ],
              responses: { '200': { description: 'Paginated agents', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { '$ref': '#/components/schemas/Agent' } }, nextCursor: { type: 'string' } } } } } } },
            },
          },
          '/agents/deploy-authorized': {
            post: {
              summary: 'Deploy an agent with an EIP-712 owner-signed authorization', operationId: 'deployAuthorized', tags: ['Agents'],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { form: { type: 'object' }, authorization: { type: 'object', properties: { owner: { type: 'string' }, nonce: { type: 'string' }, deadline: { type: 'integer' }, signature: { type: 'string' } }, required: ['owner', 'nonce', 'deadline', 'signature'] } }, required: ['form', 'authorization'] } } } },
              responses: { '201': { description: 'Created agent', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Agent' } } } }, '400': { description: 'Bad request' } },
            },
          },
          '/agents/{id}': {
            get: {
              summary: 'Get agent by ID', operationId: 'getAgent', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Agent', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Agent' } } } }, '404': { description: 'Not found' } },
            },
          },
          '/agents/{id}/hide': {
            post: {
              summary: 'Hide an agent from listings', operationId: 'hideAgent', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/unhide': {
            post: {
              summary: 'Unhide an agent', operationId: 'unhideAgent', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/retry-onboarding': {
            post: {
              summary: 'Retry onboarding receipts for an agent', operationId: 'retryOnboarding', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '202': { description: 'Queued' }, '404': { description: 'Not found' } },
            },
          },
          '/agents/{id}/policy': {
            patch: {
              summary: 'Update agent spending policy', operationId: 'patchAgentPolicy', tags: ['Agents'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { maxPerTxWei: { type: 'string' }, maxPerDayWei: { type: 'string' }, active: { type: 'boolean' }, summary: { type: 'string' } } } } } },
              responses: { '200': { description: 'Updated policy' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/skills': {
            get: {
              summary: 'List skills installed on an agent', operationId: 'listAgentSkills', tags: ['Skills'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Installed skills', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Skill' } } } } } },
            },
            post: {
              summary: 'Install a skill on an agent', operationId: 'installSkill', tags: ['Skills'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { skillId: { type: 'string' }, version: { type: 'string' }, config: {} }, required: ['skillId'] } } } },
              responses: { '201': { description: 'Installed' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/skills/{skillId}': {
            delete: {
              summary: 'Uninstall a skill from an agent', operationId: 'uninstallSkill', tags: ['Skills'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '204': { description: 'Removed' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/run': {
            post: {
              summary: 'Execute a skill run on an agent', operationId: 'runSkill', tags: ['Runs'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { skillId: { type: 'string' }, input: {}, idempotencyKey: { type: 'string' } }, required: ['skillId'] } } } },
              responses: { '202': { description: 'Run queued', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, agentId: { type: 'string' }, status: { type: 'string' }, createdAt: { type: 'string' } } } } } }, '401': { description: 'Unauthorized' } },
            },
          },
          '/agents/{id}/runs': {
            get: {
              summary: 'List runs for an agent', operationId: 'listAgentRuns', tags: ['Runs'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Runs list', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } } } } } } } },
            },
          },
          '/agents/{agentId}/memory': {
            get: {
              summary: 'List memory entries for an agent', operationId: 'listAgentMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Memory entries', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
          '/runs/{runId}': {
            get: {
              summary: 'Get a run by ID', operationId: 'getRun', tags: ['Runs'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Run details' }, '404': { description: 'Not found' } },
            },
          },
          '/runs/{runId}/receipts': {
            get: {
              summary: 'Get receipts for a run', operationId: 'getRunReceipts', tags: ['Runs'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Receipts for the run', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Receipt' } } } } } },
            },
          },
          '/skills': {
            get: {
              summary: 'List available skills in the marketplace', operationId: 'listSkills', tags: ['Skills'],
              parameters: [
                { name: 'tier', in: 'query', schema: { type: 'string', enum: ['free', 'premium'] } },
                { name: 'category', in: 'query', schema: { type: 'string' } },
              ],
              responses: { '200': { description: 'Skills catalog', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Skill' } } } } } },
            },
          },
          '/services': {
            post: {
              summary: 'Register a service listing', operationId: 'createService', tags: ['Services'], security: [{ bearerAuth: [] }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { agentId: { type: 'string' }, serviceId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, priceWei: { type: 'string' }, description: { type: 'string' } }, required: ['agentId', 'serviceId', 'priceWei'] } } } },
              responses: { '201': { description: 'Created service' }, '401': { description: 'Unauthorized' } },
            },
            get: {
              summary: 'List service listings', operationId: 'listServices', tags: ['Services'],
              parameters: [{ name: 'tag', in: 'query', schema: { type: 'string' } }, { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated tags' }],
              responses: { '200': { description: 'Services', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
          '/quote': {
            post: {
              summary: 'Request a payment quote for a service call', operationId: 'requestQuote', tags: ['Billing'], security: [{ bearerAuth: [] }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { payeeAgentId: { type: 'string' }, payerAgentId: { type: 'string' }, serviceId: { type: 'string' }, requestedAmount: { type: 'string' }, ttlSec: { type: 'integer' } }, required: ['payeeAgentId', 'serviceId'] } } } },
              responses: { '200': { description: 'Quote', content: { 'application/json': { schema: { type: 'object', properties: { quoteHash: { type: 'string' }, amount: { type: 'string' }, deadline: { type: 'integer' }, payeeReceiver: { type: 'string' }, signature: { type: 'string' }, nonce: { type: 'string' } } } } } } },
            },
          },
          '/settle': {
            post: {
              summary: 'Settle a quote (record payment receipt)', operationId: 'settle', tags: ['Billing'], security: [{ bearerAuth: [] }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { quoteHash: { type: 'string' }, payerSignature: { type: 'string' }, txHash: { type: 'string' }, clientReceiptId: { type: 'string' }, payerAgentId: { type: 'string' } }, required: ['quoteHash'] } } } },
              responses: { '200': { description: 'Receipt', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Receipt' } } } } },
            },
          },
          '/refund/{paymentId}': {
            post: {
              summary: 'Request a refund for a payment', operationId: 'refund', tags: ['Billing'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string' }, agentId: { type: 'string' }, clientReceiptId: { type: 'string' } }, required: ['reason'] } } } },
              responses: { '200': { description: 'Refund result' }, '404': { description: 'Payment not found' } },
            },
          },
          '/memory/{agentId}': {
            get: {
              summary: 'List memory entries for an agent', operationId: 'listMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Memory entries', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
          '/memory/{agentId}/{key}': {
            get: {
              summary: 'Get a memory entry', operationId: 'getMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'Memory entry' }, '404': { description: 'Not found' } },
            },
            put: {
              summary: 'Write a memory entry', operationId: 'putMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { value: {}, tags: { type: 'array', items: { type: 'string' } } }, required: ['value'] } } } },
              responses: { '200': { description: 'Written' }, '401': { description: 'Unauthorized' } },
            },
            delete: {
              summary: 'Delete a memory entry', operationId: 'deleteMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '204': { description: 'Deleted' }, '401': { description: 'Unauthorized' } },
            },
          },
          '/memory/{agentId}/search': {
            post: {
              summary: 'Semantic search over agent memory', operationId: 'searchMemory', tags: ['Memory'], security: [{ bearerAuth: [] }],
              parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 10, maximum: 50 } }, required: ['query'] } } } },
              responses: { '200': { description: 'Matching memory entries', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
        },
      },
    },
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
  let pilotComputeClient: ComputeClient | null | undefined;

  const getPilotComputeClient = (): ComputeClient | null => {
    if (pilotComputeClient !== undefined) return pilotComputeClient;
    try {
      const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai';
      const defaultProvider = process.env.ZERO_G_COMPUTE_PROVIDER as `0x${string}` | undefined;
      pilotComputeClient = new ComputeClient({
        rpcUrl,
        signerKey: options.signerKey,
        defaultProvider,
      });
    } catch (error) {
      app.log.warn({ error }, 'pilot.compute_client_init_failed');
      pilotComputeClient = null;
    }
    return pilotComputeClient;
  };

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
      const mintedReceipts = receiptRows().filter(r => r.status === 'minted').length;
      return {
        totalAgents: store.agents.size,
        totalReceipts: mintedReceipts,
        totalServices: store.services.size,
        network: 'Aristotle mainnet',
        chainId: options.chainId,
        demoAgents: ['Aurora (#1, every 10 min)', 'Vesper (#2, every 15 min)', 'Helix (#3, every 30 min)'],
      };
    }
    if (name === 'listSkillsCatalog') {
      return DEFAULT_SKILLS.map(s => ({ id: s.id, name: s.name, category: s.category, tier: s.tier, description: s.description }));
    }
    if (name === 'explainConcept') {
      const concepts: Record<string, string> = {
        agent: 'An autonomous AI agent with an ERC-4337 smart account (AgentAccount), an ERC-7857 on-chain identity NFT (AgentIdentity), and a configurable spending policy enforced by PolicyEngine.',
        receipt: 'A cryptographic proof of an agent action minted by ReceiptBook.emitReceipt() on Aristotle mainnet. Contains actionTag, payloadHash, storageRoot (0G Storage Merkle root), valueWei, and timestamp.',
        policy: 'Spending rules enforced by the PolicyEngine contract: maxPerTxWei, maxPerDayWei, active toggle, and allowedSkills whitelist.',
        skill: 'A sandboxed capability module running in isolated-vm: chat.completion, web.search, memory.write, chain.query, storage.upload, etc.',
        memory: 'Encrypted agent state stored in 0G Storage with semantic search. Entries include key, value, tags, and a storageRoot anchor.',
        '0g': '0G is a decentralised AI operating system providing EVM chain (Aristotle), decentralised storage, compute inference, and data availability layers.',
        marketplace: 'The skill catalog: free and premium skills available for installation on agents. Browse at /marketplace.',
        dashboard: 'Protocol-wide stats: total indexed agents, active runtime agents, total on-chain receipts, and cumulative 0G volume.',
      };
      const key = String(args.name ?? '').toLowerCase();
      return concepts[key] ?? `No explanation found for "${String(args.name)}". Try: agent, receipt, policy, skill, memory, marketplace, dashboard.`;
    }
    return null;
  }

  async function* simulatePilotTokens(msg: string, toolResults: { name: string; result: unknown }[]): AsyncGenerator<string> {
    const lower = msg.toLowerCase();
    const agentList = (toolResults.find(t => t.name === 'getMyAgents')?.result ?? []) as Array<{ id?: string; balanceWei?: string; status?: string }>;
    const receiptList = (toolResults.find(t => t.name === 'listRecentReceipts')?.result ?? []) as unknown[];
    const stats = toolResults.find(t => t.name === 'getProtocolStats')?.result as { totalAgents?: number; totalReceipts?: number } | undefined;
    const totalAgents = stats?.totalAgents ?? 0;
    const totalReceipts = stats?.totalReceipts ?? 0;

    let response: string;

    // ── What is Apogee? ─────────────────────────────────────────────────────────
    if (lower.match(/what (is|are|does) apogee|explain apogee|tell me about apogee|about apogee|apogee protocol/)) {
      response = `**Apogee Protocol** is an autonomous-agent runtime on **0G Aristotle mainnet** (chainId 16661). It lets you create AI agents that:\n\n- Hold their own funds in **self-custodial ERC-4337 smart wallets**\n- Have a verifiable **on-chain identity** (ERC-7857 AgentIdentity NFT)\n- Execute sandboxed **skill modules** (chat, search, memory, chain queries)\n- Operate within **programmable spending policies** enforced on-chain\n- Emit a **tamper-proof receipt** for every action via \`ReceiptBook.emitReceipt()\`\n- Store/retrieve **encrypted memory** in 0G decentralised storage\n\nApogee integrates all four 0G primitives: **0G Chain** (9 deployed contracts), **0G Storage** (payload blobs), **0G Compute** (LLM skills), and **0G DA**.\n\n${totalAgents > 0 ? `**${totalAgents}** agents and **${totalReceipts}** on-chain receipts are indexed right now.` : ''}\n\nNavigate to [Dashboard](/dashboard) for live stats or [Proofs](/proofs) to see live on-chain activity.`;

    // ── 0G integration ──────────────────────────────────────────────────────────
    } else if (lower.match(/how.*0g|0g.*integrat|0g storage|0g compute|0g chain|0g da|use.*0g|0g.*use|0g.*primitive|which 0g/)) {
      response = `Apogee integrates **all four 0G primitives**:\n\n**1. 0G Chain (Aristotle EVM)**\n9 Solidity contracts deployed on chainId 16661:\n- \`AgentIdentity\` — ERC-7857 NFT registry for agent on-chain identity\n- \`ReceiptBook\` — records every agent action as a tamper-proof on-chain receipt\n- \`PolicyEngine\` — enforces spending limits and skill allowlists\n- \`PaymentRouter\` — maps agent IDs to their smart account wallets\n- \`AccountFactory\` — deploys ERC-4337 smart wallets for agents\n- Plus \`EscrowVault\`, \`RevenueSplitter\`, \`ServiceRegistry\`, \`AgentAccount\`\n\n**2. 0G Storage** (via \`@0gfoundation/0g-ts-sdk\`)\n- Vesper demo agent uploads images and memory artifacts as content-addressed blobs\n- Receipt payloads are hashed and a Merkle \`storageRoot\` is anchored on-chain\n- Memory entries are encrypted and stored as blobs\n\n**3. 0G Compute** (via \`@0glabs/0g-serving-broker\`)\n- \`chat.completion\` and \`image.generate\` skills route through 0G Compute providers\n- Falls back gracefully with \`safeSkill()\` when providers are unavailable\n\n**4. 0G DA**\n- All contracts, receipts, and identity NFTs live on Aristotle — the 0G EVM layer itself\n\nSee live integration evidence at [Proofs](/proofs) or [API Docs](https://apogeeedge-production.up.railway.app/docs/api).`;

    // ── Agent account / smart account ───────────────────────────────────────────
    } else if (lower.match(/agent account|smart account|erc.?4337|smart wallet|what.*account|account.*what/)) {
      response = `Every agent deployed on Apogee gets two on-chain identities:\n\n**AgentIdentity NFT** (ERC-7857)\n- Minted by \`AgentIdentity.mint()\` on Aristotle\n- The permanent on-chain identity for the agent\n- Token ID becomes the agent's ID across the protocol\n\n**AgentAccount** (ERC-4337 smart wallet)\n- Deployed by \`AccountFactory\` at a deterministic address\n- Holds 0G tokens for gas and skill costs\n- **Self-custodial** — you control the wallet via your EOA\n- Apogee holds an operator role to submit transactions within your policy limits only\n\nThe smart wallet address is shown on the agent detail page and on [Chainscan](https://chainscan.0g.ai) once deployed.`;

    // ── Agent status / activating ────────────────────────────────────────────────
    } else if (lower.match(/activating|what.*status|status.*mean|initializ|bootstrapped|ready.*mean|pending.*deploy|agent.*stuck|stuck.*agent/)) {
      response = `After you click Deploy, the agent moves through lifecycle stages:\n\n| Status | Meaning |\n|---|---|\n| \`pending_deploy\` | Waiting for on-chain tx to confirm |\n| \`activating\` / \`initialized\` | Identity NFT minted, smart account deployed |\n| \`ready\` | Onboarding receipts minted — agent is ready |\n| \`active\` | Agent has run at least one skill |\n| \`failed\` | Deployment error — check the agent detail page |\n| \`paused\` | Manually disabled |\n\nIf stuck at \`activating\`, the Aristotle tx is still confirming (~30s). Refresh and wait. If stuck more than 2 minutes, check [Agents](/agents) for an error message or open [Chainscan](https://chainscan.0g.ai) to inspect the pending tx.`;

    // ── Memory (empty / new agent) ───────────────────────────────────────────────
    } else if (lower.match(/no memory|empty memory|why.*memory.*empty|memory.*empty|why.*no memory|new agent.*memory|memory.*new agent|memory.*not appear|memory.*missing/)) {
      response = `Memory appearing empty for a new agent is **expected behavior**, not a bug.\n\nHere's what populates memory:\n1. **\`system/init\`** — a bootstrap entry written during onboarding (appears within ~60s of deployment)\n2. **\`memory.write\` skill calls** — entries added when the agent runs tasks\n3. **Manual API writes** — via \`PUT /v1/memory/:agentId/:key\`\n\nFor a freshly deployed agent: the onboarding job writes \`system/init\` and mints receipts. If memory is still empty after 2 minutes, try the **Retry onboarding** button on the agent detail page.\n\nRuntime-generated memory only appears after autonomous runs — which for user-deployed agents requires the agent to be triggered via API or the run interface. Navigate to [Memory](/memory) to see entries once they exist.`;

    // ── Memory (general) ────────────────────────────────────────────────────────
    } else if (lower.match(/what.*memory|how.*memory|memory.*work|memory.*store|memory.*encrypt/)) {
      response = `**Agent memory** is encrypted state stored in 0G decentralised storage.\n\nEach memory write:\n- Encrypts the value\n- Uploads to 0G Storage (content-addressed blob)\n- Records a \`storageRoot\` (Merkle root) and anchors it on-chain via \`ReceiptBook\`\n\nKey properties:\n- **Semantic search** — search memory by embedding similarity, not just exact key\n- **Versioned** — each write creates a new storage root\n- **Agent-scoped** — each agent's memory is isolated by its token ID\n- **Accessible** — read via the [Memory](/memory) page or \`GET /v1/memory/:agentId\`\n\nDemo agents (Aurora, Vesper, Helix) write memory on every heartbeat — their entries are visible in the Edge API.`;

    // ── Live proofs / judge verification (checked BEFORE generic receipt) ────────
    } else if (lower.match(/live proof|proofs page|judge|how.*verify|verify.*on.?chain|where.*receipt|chainscan|see.*proof|proof.*see|on.?chain.*verif/)) {
      response = `**Four paths for live on-chain verification:**\n\n**1. Proofs page** — [apogeeprotocol.vercel.app/proofs](/proofs)\n- Receipt feed with real \`txHash\` links to Chainscan\n- Storage Proofs tab: rows with a green \`storageRoot\` show the full 0G Storage round-trip\n- Contracts tab: all 9 deployed addresses with Chainscan links\n\n**2. ReceiptBook on Chainscan**\nPaste \`0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53\` into [chainscan.0g.ai](https://chainscan.0g.ai) → Events → filter \`ReceiptMinted\`. The counter grows every ~10 minutes as Aurora fires.\n\n**3. Edge API** (no auth needed):\n\`\`\`bash\ncurl "https://apogeeedge-production.up.railway.app/v1/receipts?scope=global&limit=3" | jq .items\n\`\`\`\n\n**4. Smart contract read** (with cast):\n\`\`\`bash\ncast call 0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \\\n  "totalReceipts()(uint256)" --rpc-url https://evmrpc-testnet.0g.ai\n\`\`\`\n\nDemo agents **Aurora** (every 10 min), **Vesper** (every 15 min), and **Helix** (every 30 min) mint receipts autonomously — the counter on Chainscan grows in real time.\n\n${totalReceipts > 0 ? `**${totalReceipts}** receipts are indexed right now.` : ''}`;

    // ── Receipts (what/why questions — after judge/verify block) ─────────────────
    } else if (lower.match(/what.*receipt|receipt.*what|why.*receipt|receipt.*import|how.*receipt|receipt.*work|on.?chain proof/)) {
      const n = receiptList.length;
      const globalCount = totalReceipts > 0 ? `**${totalReceipts}** receipts` : 'receipts';
      response = `**Receipts** are tamper-proof on-chain records of every agent action, minted by \`ReceiptBook.emitReceipt()\` on Aristotle mainnet.\n\nEach receipt contains:\n- \`actionTag\` — 4-byte identifier (e.g. \`mem.write\`, \`chain.qry\`, \`pilot.chat\`)\n- \`payloadHash\` — keccak256 of the action payload\n- \`storageRoot\` — 0G Storage Merkle root (if payload was uploaded to 0G Storage)\n- \`valueWei\` — 0G tokens spent\n- \`timestamp\` — Aristotle block timestamp\n\n**Why receipts matter:** they are the accountability layer — proving which agent ran which action, when, at what cost, with the payload content-addressed and retrievable.\n\n${n > 0 ? `You have **${n}** recent receipt${n > 1 ? 's' : ''} in this session. ` : ''}${totalReceipts > 0 ? `${globalCount} are indexed globally.` : ''}\n\nBrowse at [Receipts](/receipts) or see live demo activity at [Proofs](/proofs).`;

    // ── Skills ───────────────────────────────────────────────────────────────────
    } else if (lower.match(/what.*skill|skill.*what|how.*skill|install.*skill|skill.*install|skill.*work|capability|skill.*catalog/)) {
      response = `**Skills** are sandboxed capability modules that agents execute in isolated-vm environments.\n\nAvailable skills:\n\n| Skill ID | Category | Description |\n|---|---|---|\n| \`chat.completion\` | AI | LLM inference via 0G Compute |\n| \`memory.write\` | Memory | Persist encrypted state to 0G Storage |\n| \`memory.read\` | Memory | Read agent memory entries |\n| \`memory.search\` | Memory | Semantic search over memory |\n| \`chain.query\` | Chain | Read Aristotle chain state |\n| \`chain.send\` | Chain | Submit approved on-chain txs |\n| \`web.search\` | Web | Internet search from agent runs |\n| \`web.fetch\` | Web | Fetch and parse a URL |\n| \`storage.upload\` | Storage | Upload artifacts to 0G Storage |\n\n**Installing a skill** registers it on the agent so it can be invoked in runs. Skills are selected during deployment or added later from the [Marketplace](/marketplace) or the Skills tab on an agent detail page.\n\nSkills are run in strict isolation — no access to other agents' state or the host environment.`;

    // ── Marketplace ──────────────────────────────────────────────────────────────
    } else if (lower.match(/marketplace|what.*market|market.*what/)) {
      response = `The **Marketplace** at [/marketplace](/marketplace) is the skill and service catalog.\n\n**Skills tab** — browse free and premium skills:\n- Free tier: chat, memory, chain queries, web search, storage upload\n- Premium tier: image generation, embeddings, transcription, and more\n- Install skills on agents during deployment or from the agent detail page\n\n**Services tab** — registered service providers including:\n- 0G Storage — decentralised payload storage\n- 0G Compute — model inference for AI skills\n- Aristotle RPC — chain connectivity\n- ReceiptBook — on-chain receipt minting\n\nA full paid third-party marketplace purchase flow is roadmap. Current install/selection happens at deployment or configuration time.`;

    // ── Policies ─────────────────────────────────────────────────────────────────
    } else if (lower.match(/polic|spending.*limit|spending.*cap|what.*policy|policy.*what|daily.*cap|per.*tx|max.*spend/)) {
      response = `**Spending policies** are enforced by the \`PolicyEngine\` contract on Aristotle mainnet.\n\nEach policy defines:\n- \`maxPerTxWei\` — maximum 0G per single transaction\n- \`maxPerDayWei\` — daily spending cap (resets at UTC midnight)\n- \`active\` — on/off toggle\n- \`allowedSkills\` — whitelist of skill IDs the agent may invoke\n\nPolicies protect against runaway spending. The on-chain enforcement means even if the edge API were compromised, the smart contract enforces limits before any transaction executes.\n\nSet policies during deployment. The UI to edit policies post-deployment is roadmap — for now, policies can be updated via \`PATCH /v1/agents/:id/policy\` if you're authenticated as the owner.`;

    // ── Revenue splits ───────────────────────────────────────────────────────────
    } else if (lower.match(/split|revenue split|revenue shar|rev.*split|split.*rev/)) {
      response = `**Revenue splitting** is handled by the \`RevenueSplitter\` contract on Aristotle mainnet.\n\nHow it works:\n- When an agent earns 0G from providing services, the revenue is split between the agent owner and configurable beneficiaries\n- Split ratios are set at deployment time\n- The contract enforces distribution on-chain — no central party controls disbursement\n\nThis is the infrastructure layer for **agent-to-agent payments** and **service monetization**. A UI for configuring split ratios is roadmap. Current splits are set at deployment with protocol defaults.`;

    // ── Dashboard ────────────────────────────────────────────────────────────────
    } else if (lower.match(/dashboard|what.*show|showing.*what|stat.*show|explain.*dashboard|dashboard.*explain/)) {
      response = `The **[Dashboard](/dashboard)** shows protocol-wide statistics from Aristotle mainnet and the edge index:\n\n- **Network Agents** — total indexed \`AgentIdentity\` records on Aristotle\n- **Runtime Active** — agents with recent heartbeat or run activity\n- **Network Receipts** — total on-chain receipts minted by \`ReceiptBook\`\n- **Network Volume** — cumulative 0G value recorded by indexed receipts\n- **Activity heatmap** — receipt volume across the last 14 days × 24 hours\n\n${totalAgents > 0 ? `Right now: **${totalAgents}** agents and **${totalReceipts}** receipts indexed.` : ''}\n\nStats include demo agents (Aurora, Vesper, Helix) plus user-deployed agents. Connect your wallet to see your own agents and their activity.`;

    // ── Deployed contracts ───────────────────────────────────────────────────────
    } else if (lower.match(/contract|deployed contract|contract address|what contract|which contract|smart contract/)) {
      response = `**9 contracts deployed on Aristotle mainnet** (chainId 16661):\n\n| Contract | Address |\n|---|---|\n| AgentIdentity | \`0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3\` |\n| PolicyEngine | \`0xa8933d96A27BDfFac07C0d7467f3213cb340f550\` |\n| **ReceiptBook** | \`0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53\` |\n| ServiceRegistry | \`0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad\` |\n| RevenueSplitter | \`0x1E32A89B6815a492Ad30f71a5E35280EF7399b74\` |\n| PaymentRouter | \`0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c\` |\n| EscrowVault | \`0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767\` |\n| AccountFactory | \`0xABc44aF98e6d873C0700c9B687fbf3Be560cba90\` |\n| AgentAccount | \`0xc18eD4e075a23A66505744A353eeFE91340F924d\` |\n\nVerify any address at [chainscan.0g.ai](https://chainscan.0g.ai). All 9 are live and verified. ReceiptBook is the most active — browse its \`ReceiptMinted\` events for live proof.\n\nAll addresses are also listed on the [Proofs](/proofs) → Contracts tab.`;

    // ── Network / chain info ─────────────────────────────────────────────────────
    } else if (lower.match(/which network|what network|which chain|what chain|chain id|aristotle|testnet.*mainnet|mainnet.*testnet|0g network/)) {
      response = `Apogee runs on **Aristotle mainnet** — the 0G EVM layer:\n\n- **Chain ID**: 16661\n- **RPC**: \`https://evmrpc-testnet.0g.ai\`\n- **Explorer**: [chainscan.0g.ai](https://chainscan.0g.ai)\n- **Faucet**: [faucet.0g.ai](https://faucet.0g.ai) — 1 0G per request\n- **Token**: 0G (native gas token)\n\nDespite the "testnet" in the RPC hostname, Aristotle is the production mainnet for the 0G buildathon. All 9 Apogee contracts are deployed here and all demo agent receipts are minted here.\n\nA deployment on Galileo (the other 0G testnet) is separate — Apogee targets Aristotle exclusively.`;

    // ── Deploy agent ─────────────────────────────────────────────────────────────
    } else if (lower.match(/deploy|create agent|new agent|how.*agent|agent.*create|get.*agent|start.*agent/)) {
      response = `**How to deploy an agent on Apogee:**\n\n1. Connect your Ethereum wallet (MetaMask, Coinbase Wallet, etc.)\n2. Sign the SIWE message to authenticate — no tokens needed for sign-in\n3. Go to [Agents](/agents) and click **Deploy new agent** (or [/agents/new](/agents/new))\n4. Fill in name, description, and select skills (e.g. memory.write, chain.query)\n5. Sign the **EIP-712 authorization** message — this proves you own the wallet\n6. Wait ~30–60 seconds for Aristotle confirmation\n\n**What happens on-chain:**\n- \`AgentIdentity.mint()\` creates your agent's NFT\n- \`AccountFactory.createAccount()\` deploys the ERC-4337 smart wallet\n- Onboarding receipts are minted for each selected skill\n- A \`system/init\` bootstrap memory entry is written\n\n**Cost:** ~0.01 0G gas. Get tokens from [faucet.0g.ai](https://faucet.0g.ai) — free, 1 0G per request.`;

    // ── Deployment failure ───────────────────────────────────────────────────────
    } else if (lower.match(/deploy.*fail|fail.*deploy|why.*fail|transaction.*fail|fail.*transaction|what.*wrong|error.*deploy/)) {
      response = `**Common deployment failure causes:**\n\n1. **Insufficient balance** — the signing wallet needs 0G for gas. Get tokens from [faucet.0g.ai](https://faucet.0g.ai).\n\n2. **Replacement fee too low** — a previous nonce transaction is pending. The edge API auto-retries with higher gas after ~90s. Wait 2–3 minutes.\n\n3. **Authorization expired** — the EIP-712 deploy nonce has a 10-minute deadline. Start a fresh deployment.\n\n4. **Network congestion** — Aristotle RPC latency. Wait 30s and retry.\n\n5. **Wallet rejected** — the user dismissed the wallet signature prompt. Restart the deploy flow.\n\nCheck the agent detail page at [Agents](/agents) for a specific error message. If the agent shows \`failed\` status, the error is displayed there.`;

    // ── Replacement fee / pending tx ─────────────────────────────────────────────
    } else if (lower.match(/replacement fee|replacement.*underpriced|pending.*transaction|transaction.*pending|stuck.*transaction|transaction.*stuck|nonce/)) {
      response = `**Replacement fee too low / pending transaction:**\n\nThis happens when a previous transaction from the same signing address is still pending with a lower gas price, and the new transaction can't replace it.\n\n**What Apogee does automatically:**\n- The edge API detects \`replacement_underpriced\` errors\n- It waits ~90 seconds then retries the deployment\n- On retry, it uses the same nonce with higher gas (replacement transaction)\n\n**What you should do:**\n1. Wait 2–3 minutes — the auto-retry usually clears it\n2. Check [chainscan.0g.ai](https://chainscan.0g.ai) with your signing address to see the pending tx\n3. Refresh the [Agents](/agents) page — the status updates automatically\n\nIf still stuck after 5 minutes, try the **Retry onboarding** button on the agent detail page.`;

    // ── Self-custodial / custodial ───────────────────────────────────────────────
    } else if (lower.match(/custodial|self.?custodial|non.?custodial|own.*key|private key|who.*control|control.*wallet/)) {
      response = `**Apogee is self-custodial.**\n\nHere's what that means:\n\n- Each agent's ERC-4337 smart wallet is **controlled by your EOA** (externally-owned account)\n- Your private key **never leaves your wallet** — you sign authorization messages in your browser\n- Apogee holds a **server-side operator key** to submit transactions within your policy limits\n- Your policy defines the hard limits the operator key can never exceed\n- You can revoke Apogee's operator role at any time by interacting with the smart contract directly\n\n**What Apogee cannot do:**\n- Move funds beyond your policy limits\n- Access your private key\n- Deploy contracts on your behalf without your signature\n\nThe EIP-712 deploy authorization you sign proves ownership and sets the parameters the operator can use.`;

    // ── Live vs demo / what is active ───────────────────────────────────────────
    } else if (lower.match(/live.*demo|demo.*live|what.*live|what.*real|what.*demo|what.*active|aurora|vesper|helix|demo agent|running.*agent/)) {
      response = `**What's live right now:**\n\n✅ **Demo agents minting real on-chain receipts:**\n- **Aurora** (#1) — every 10 min: news fetch → memory write → receipt\n- **Vesper** (#2) — every 15 min: memory search → image generate → 0G Storage upload → receipt\n- **Helix** (#3) — every 30 min: chain query → LLM summary → memory write → receipt\n\n✅ **9 Solidity contracts** on Aristotle mainnet\n✅ **User agent deployment** with onboarding receipts\n✅ **Bootstrap memory** (\`system/init\`) for new agents\n✅ **Receipt indexing** and proof pages\n✅ **Skill execution** via API\n\n**Roadmap (not yet live):**\n⏳ Full autonomous recurring runtime for arbitrary user agents (needs session-key delegation)\n⏳ Paid third-party marketplace purchase flow\n⏳ On-chain policy editing UI\n\n${totalAgents > 0 ? `Currently **${totalAgents} agents** and **${totalReceipts} receipts** indexed.` : ''} See [Proofs](/proofs) for live demo agent activity.`;

    // ── No runs / no activity ────────────────────────────────────────────────────
    } else if (lower.match(/no run|no activity|why.*no run|run.*empty|activity.*empty|why.*empty|nothing.*happen/)) {
      response = `**Empty runs/activity is expected for new agents.**\n\nRuns appear after:\n1. **A skill is invoked** via \`POST /v1/agents/:id/run\` with a \`skillId\`\n2. **An autonomous heartbeat** fires (currently only for demo agents Aurora, Vesper, Helix)\n\nFor user-deployed agents, full autonomous recurring runtime (session-key delegation that lets the edge API trigger runs on a schedule) is **roadmap**. Right now, you can trigger runs manually via the API.\n\nOnboarding receipts (minted at deployment) appear under Receipts, not Runs — they're a different record type. Check [Receipts](/receipts) to confirm the agent is indexed on-chain.`;

    // ── Cost / billing ───────────────────────────────────────────────────────────
    } else if (lower.match(/cost|price|how much|billing|estimate|fee|0g.*cost|cost.*0g/)) {
      response = `**Estimated costs on Aristotle mainnet:**\n\n| Operation | Approximate cost |\n|---|---|\n| Deploy agent (identity NFT + smart wallet) | ~0.01 0G |\n| Skill run (gas only) | ~0.001–0.005 0G |\n| \`memory.write\` (0G Storage upload) | ~0.0002 0G |\n| \`chat.completion\` (0G Compute) | Provider-dependent |\n| \`web.search\` | ~0.0005 0G |\n\nGet free test tokens from [faucet.0g.ai](https://faucet.0g.ai) — 1 0G per request, sufficient for deployment and several runs.\n\nSpending is capped by your agent's **policy limits** — set them during deployment to prevent unexpected costs.`;

    // ── Show me a demo run ───────────────────────────────────────────────────────
    } else if (lower.match(/demo run|show me|example run|how.*run work/)) {
      response = `Here's a typical **Aurora heartbeat run** (every 10 minutes on Aristotle):\n\n\`\`\`\n[00:00] Aurora (#1) heartbeat fires\n[00:01] chain.query — reads latest Aristotle block\n[00:03] web.search — "0G blockchain news"\n[00:08] chat.completion — summarises via 0G Compute\n[00:12] memory.write — stores summary to 0G Storage\n         storageRoot: 0xabc123… (Merkle root)\n[00:14] ReceiptBook.emitReceipt(agentId=1, tag=mem.writ, …)\n         txHash: 0xdef456… confirmed on Aristotle\n[00:15] ✓ Done — receipt minted\n\`\`\`\n\nEvery step that writes state produces a receipt. Filter \`ReceiptMinted\` events on [Chainscan](https://chainscan.0g.ai/address/0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53) to see live activity.`;

    // ── Faucet / getting 0G tokens ───────────────────────────────────────────────
    } else if (lower.match(/faucet|get.*token|0g.*token|request.*0g|need.*0g|get.*0g|how.*fund|fund.*agent|0g.*faucet|send.*0g/)) {
      response = `**How to get 0G tokens:**\n\n**Option 1 — In-app faucet** (quickest)\nOn the [Deploy Agent](/agents/new) page (Step 1 — Agent Identity), click **"Request 0.1 \$0G"** to receive a small amount of 0G directly to your connected wallet. One request per 24 hours.\n\n**Option 2 — Official 0G faucet**\nVisit [faucet.0g.ai](https://faucet.0g.ai) — 1 0G per request, no limit. Connect any Ethereum wallet on Aristotle mainnet (chainId 16661).\n\n**Why you need 0G:**\n- Agent deployment costs ~0.01 0G gas (identity NFT + smart wallet)\n- Skill runs cost 0.001–0.005 0G per call\n- 0G Storage uploads require small amounts for the storage market\n\n**Network:** Aristotle mainnet · RPC: \`https://evmrpc-testnet.0g.ai\` · Chain ID: 16661`;

    // ── Feedback / testing ───────────────────────────────────────────────────────
    } else if (lower.match(/feedback|testing|submit.*feedback|share.*feedback|user.*test|test.*user|response.*sheet|form/)) {
      response = `**User Testing & Feedback:**\n\nApogee collects user feedback through a public form. Testers are asked to:\n1. Deploy a demo agent on Apogee\n2. Submit a dashboard screenshot\n3. Share testing notes (optionally link an X/Twitter post)\n\n**Links:**\n- [Feedback form](https://docs.google.com/forms/d/e/1FAIpQLSfGZKS0ZliSNTXH0bOpRc7GaILtPjSusiQE_UPvuz_GlhjBMg/viewform?usp=publish-editor) — submit your experience\n- [Judge response sheet](https://docs.google.com/spreadsheets/d/1Zu_tG6afAMV92juF4A7MLaUhYwMQ0OGtUUVBakjnjcw/edit?usp=sharing) — raw feedback evidence for judges\n\nAfter a successful agent deployment, a **"Share feedback"** button appears automatically in the wizard.`;

    // ── Technical write-up / article ─────────────────────────────────────────────
    } else if (lower.match(/write.?up|article|medium|technical.*blog|blog.*technical|engineering.*deep|deep.*dive|how.*built|built.*how/)) {
      response = `**Technical Write-up:**\n\n[Building an Autonomous Agent Runtime on 0G — Engineering Deep Dive into Apogee](https://medium.com/@chatwithnonso01/building-an-autonomous-agent-runtime-on-0g-an-engineering-deep-dive-into-apogee-6af3dfedac94)\n\nThe article covers:\n- Why 0G Chain, Storage, and Compute were chosen for the agent runtime\n- How ERC-4337 smart wallets + ERC-7857 identity NFTs compose the agent model\n- The receipt accountability layer (ReceiptBook.emitReceipt)\n- BullMQ heartbeat loop, isolated-vm skill sandboxes, and 0G Storage integration\n- Architecture decisions and trade-offs\n\nAlso available from the [Docs](/docs) page under "Engineering Deep Dive".`;

    // ── GitHub / source code ─────────────────────────────────────────────────────
    } else if (lower.match(/github|source.*code|code.*source|repo|repository|open.*source/)) {
      response = `**Apogee GitHub Repository:**\n\n[github.com/Franlinozz/APOGEE](https://github.com/Franlinozz/APOGEE)\n\nMonorepo structure:\n\`\`\`\nAPOGEE/\n├── apps/web/        Next.js 14 frontend (Vercel)\n├── apps/edge/       Fastify API + WebSocket (Railway)\n├── apps/runtime/    BullMQ heartbeat workers (Railway)\n├── packages/\n│   ├── contracts/   9 Solidity contracts\n│   ├── billing/     Receipt minting + settlement\n│   ├── chain-client/ ethers v6 0G Chain wrapper\n│   ├── storage-client/ 0G Storage SDK wrapper\n│   ├── compute-client/ 0G Compute broker wrapper\n│   ├── memory/      Encrypted agent memory\n│   └── skills-runtime/ isolated-vm sandbox\n└── skills/\n    ├── core/        12 free skills\n    └── premium/     10 paid skills\n\`\`\`\n\nAll source code, contracts, and deployment scripts are open-source under MIT license.`;

    // ── Demo video / YouTube ─────────────────────────────────────────────────────
    } else if (lower.match(/demo video|youtube|video|watch|demo.*link/)) {
      response = `**Apogee Demo Video:**\n\n[youtu.be/3XEJRv1ZkLo](https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb)\n\nThe demo shows:\n- Deploying an agent on 0G Aristotle mainnet\n- Viewing live receipts on the Proofs page\n- The skill marketplace and memory interface\n- Aurora, Vesper, and Helix demo agents running autonomously\n\nAlso see the [X/Twitter announcement](https://x.com/ApogeeProtocol/status/2055641847821664765?s=20) for highlights.`;

    // ── Agent greeting (has agents) ──────────────────────────────────────────────
    } else if (agentList.length > 0) {
      const a = agentList[0]!;
      const bal = (Number(BigInt(a.balanceWei ?? '0')) / 1e18).toFixed(6);
      response = `You have **${agentList.length}** agent${agentList.length > 1 ? 's' : ''}. Your first agent (\`${String(a.id ?? '').slice(0, 8)}…\`) has a balance of **${bal} 0G** and status **${a.status ?? 'unknown'}**.\n\nTry asking me:\n- *"Why does my agent have no memory?"*\n- *"What does '${a.status ?? 'activating'}' mean?"*\n- *"Where can judges verify live receipts?"*\n- *"How do I get 0G tokens?"*\n- *"Where is the feedback form?"*`;

    // ── Default / fallback ───────────────────────────────────────────────────────
    } else {
      response = `I'm **Apogee Pilot** — your guide to the Apogee Protocol on 0G Aristotle mainnet.\n\n${totalAgents > 0 ? `**${totalAgents}** agents and **${totalReceipts}** on-chain receipts are indexed right now.\n\n` : ''}Try asking me:\n- *"What is Apogee?"*\n- *"How does Apogee use 0G?"*\n- *"How do I get 0G tokens?"*\n- *"How do I deploy an agent?"*\n- *"What are receipts / skills / memory?"*\n- *"Where can judges verify live receipts?"*\n- *"Where is the feedback form?"*\n- *"Where is the technical write-up?"*\n\nOr explore the app:\n- [Dashboard](/dashboard) · [Proofs](/proofs) · [Agents](/agents) · [Marketplace](/marketplace) · [Docs](/docs)`;
    }

    for (const token of response.split(/(?<= )/)) {
      yield token;
      await new Promise<void>(r => setTimeout(r, 12 + Math.random() * 20));
    }
  }

  app.post('/v1/pilot/chat', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['pilot'], body: pilotChatBody },
  }, async (request, reply) => {
    let user: AuthUser | null = null;
    try { user = await requireAuth(request); } catch {}
    const address = user?.address;

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

    const computeDisabled = process.env.APOGEE_PILOT_USE_COMPUTE === 'false';
    const initialTier: PilotInferenceTier = computeDisabled ? (process.env.PILOT_LLM_BASE_URL && process.env.PILOT_LLM_API_KEY ? 'http-llm' : 'simulate') : 'compute';
    request.log.info({ tier: initialTier, address }, 'pilot.chat.tier');

    void reply.hijack();
    const res = reply.raw;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientClosed = false;
    let streamCompleted = false;
    res.on('close', () => { if (!streamCompleted) clientClosed = true; });

    const emit = (event: string, data: unknown): boolean => {
      if (clientClosed || res.writableEnded) return false;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    };

    const toolsToRun: { name: string; args: Record<string, unknown> }[] = [
      { name: 'getProtocolStats', args: {} },
      ...(user
        ? [
            { name: 'getMyAgents', args: {} },
            ...(lower.includes('receipt') || lower.includes('spent') || lower.includes('cost')
              ? [{ name: 'listRecentReceipts', args: { limit: 5 } }]
              : []),
            ...(lower.includes('memory')
              ? [{ name: 'getMemorySummary', args: { agentId: '' } }]
              : []),
          ]
        : []),
    ];

    const toolResults: { name: string; result: unknown }[] = [];
    const chatId = newId('pilot');
    const receiptNonce = randomUUID();
    const assistantParts: string[] = [];
    let tokenCount = 0;
    let usedTier: PilotInferenceTier = initialTier;
    let computeMetadata: ComputeMetadata | undefined;
    let fallbackError: unknown;

    const appendToken = (token: string): void => {
      if (!token) return;
      if (emit('token', token)) {
        assistantParts.push(token);
        tokenCount += 1;
      }
    };

    const mintPilotReceipt = (cancelled: boolean): void => {
      if (!address) return;
      if (cancelled && tokenCount === 0) return;
      const payload = {
        user: address,
        messageCount: body.messages.length,
        tier: usedTier,
        chatId: computeMetadata?.chatId ?? (usedTier === 'compute' ? undefined : chatId),
        tokensUsed: computeMetadata?.tokenUsage ?? tokenCount,
        model: computeMetadata?.model,
        provider: computeMetadata?.provider,
        providerSig: computeMetadata?.providerSig,
        cancelled,
      };
      void (async () => {
        let pilotStorageRoot: string | undefined;
        let pilotStorageTxHash: string | undefined;
        try {
          const payloadBytes = new TextEncoder().encode(bigintSafeJson(payload));
          const storageClient = options.storageClient as StorageClientWithBytes;
          if (typeof storageClient.uploadBytes !== 'function') throw new Error('storage client does not expose uploadBytes');
          const upload = await storageClient.uploadBytes(payloadBytes);
          pilotStorageRoot = upload.rootHash;
          pilotStorageTxHash = upload.txHash || undefined;
          request.log.info({ phase: 'pilot-storage.success', rootHash: pilotStorageRoot, txHash: pilotStorageTxHash, bytes: payloadBytes.byteLength }, 'pilot.chat.storage.uploaded');
        } catch (error) {
          request.log.warn({ err: logErrorFields(error), phase: 'pilot-storage.failed' }, 'pilot.chat.storage.upload_failed');
        }
        await stack.receiptMinter.mint({
          // ReceiptBook does not validate agentId and existing EscrowVault receipts use 0,
          // so Pilot uses 0 as a documented system/sentinel id rather than a real agent iNFT.
          agentId: 0n,
          actionTag: PILOT_CHAT_ACTION_TAG,
          payload,
          storageRoot: pilotStorageRoot,
          valueWei: 0n,
          clientReceiptId: `pilot-${address}-${receiptNonce}`,
        });
      })().catch((error) => request.log.error({ err: logErrorFields(error), address, tier: usedTier }, 'pilot.chat.receipt_mint_failed'));
    };

    async function runComputeTier(): Promise<void> {
      usedTier = 'compute';
      request.log.info({ tier: 'compute', address }, 'pilot.chat.tier');
      const compute = getPilotComputeClient();
      if (!compute) throw new Error('0G compute client is not configured');
      const stream = await compute.chat({
        messages: [{ role: 'system', content: PILOT_SYSTEM_PROMPT }, ...body.messages],
        stream: true,
      });
      for await (const chunk of stream as AsyncIterable<ChatStreamChunk>) {
        if (clientClosed) break;
        if (chunk.delta) appendToken(chunk.delta);
        if (chunk.done && chunk.metadata) computeMetadata = chunk.metadata;
      }
    }

    async function runHttpTier(): Promise<void> {
      usedTier = 'http-llm';
      request.log.info({ tier: 'http-llm', address }, 'pilot.chat.tier');
      const llmBase = process.env.PILOT_LLM_BASE_URL;
      const llmKey = process.env.PILOT_LLM_API_KEY;
      if (!llmBase || !llmKey) throw new Error('PILOT_LLM_BASE_URL/PILOT_LLM_API_KEY are not configured');
      const llmRes = await fetch(`${llmBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmKey}` },
        body: JSON.stringify({
          model: process.env.PILOT_LLM_MODEL ?? 'gpt-4o-mini',
          messages: [{ role: 'system', content: PILOT_SYSTEM_PROMPT }, ...body.messages],
          stream: true,
          max_tokens: 800,
        }),
      });
      if (!llmRes.ok || !llmRes.body) throw new Error(`Pilot HTTP LLM failed: ${llmRes.status} ${llmRes.statusText}`);
      const reader = llmRes.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      streamLoop: while (!clientClosed) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line === 'data: [DONE]') break streamLoop;
          if (!line.startsWith('data: ')) continue;
          try {
            const c = JSON.parse(line.slice(6)) as { choices?: [{ delta?: { content?: string } }]; usage?: unknown; model?: string };
            if (c.usage !== undefined || c.model) {
              computeMetadata = {
                provider: '0x0000000000000000000000000000000000000000',
                model: c.model ?? process.env.PILOT_LLM_MODEL ?? 'gpt-4o-mini',
                tokenUsage: c.usage,
                receiptPayload: { serviceType: 'chatbot', provider: '0x0000000000000000000000000000000000000000', usage: c.usage },
              };
            }
            appendToken(c.choices?.[0]?.delta?.content ?? '');
          } catch { /* malformed chunk */ }
        }
      }
      reader.releaseLock();
    }

    async function runSimulateTier(): Promise<void> {
      usedTier = 'simulate';
      request.log.info({ tier: 'simulate', address }, 'pilot.chat.tier');
      for await (const tok of simulatePilotTokens(userMsg, toolResults)) {
        if (clientClosed) break;
        appendToken(tok);
      }
    }

    try {
      for (const tool of toolsToRun) {
        if (clientClosed) break;
        emit('tool_call', { name: tool.name, args: tool.args });
        const result = await executePilotTool(tool.name, tool.args, address);
        emit('tool_result', { name: tool.name, result });
        toolResults.push({ name: tool.name, result });
      }

      if (!computeDisabled) {
        try {
          await runComputeTier();
        } catch (error) {
          fallbackError = error;
          request.log.warn({ error, address, tier: 'compute' }, 'pilot.chat.tier_failed');
          if (tokenCount > 0 || clientClosed) throw error;
        }
      } else {
        request.log.warn({ address, tier: 'compute' }, 'pilot.chat.compute_disabled');
      }

      if ((computeDisabled || fallbackError) && tokenCount === 0 && !clientClosed) {
        try {
          await runHttpTier();
          fallbackError = undefined;
        } catch (error) {
          fallbackError = error;
          request.log.warn({ error, address, tier: 'http-llm' }, 'pilot.chat.tier_failed');
          if (tokenCount > 0 || clientClosed) throw error;
        }
      }

      if (fallbackError && tokenCount === 0 && !clientClosed) await runSimulateTier();

      if (!clientClosed) emit('done', { chatId: computeMetadata?.chatId ?? chatId, tokensUsed: computeMetadata?.tokenUsage ?? tokenCount });
      streamCompleted = !clientClosed;

      if (user) {
        const key = address!.toLowerCase();
        const prev = store.pilotConversations.get(key) ?? { id: chatId, userAddress: address!, messages: [] as PilotMsg[], createdAt: nowIso() };
        prev.messages.push(
          { role: 'user', content: userMsg, createdAt: nowIso() },
          { role: 'assistant', content: assistantParts.join(''), createdAt: nowIso() },
        );
        store.pilotConversations.delete(key);
        store.pilotConversations.set(key, prev);
        while (store.pilotConversations.size > 100) {
          const oldest = store.pilotConversations.keys().next().value as string | undefined;
          if (!oldest) break;
          store.pilotConversations.delete(oldest);
        }
      }

      mintPilotReceipt(clientClosed);
    } catch (err) {
      if (tokenCount > 0) mintPilotReceipt(true);
      emit('error', { message: err instanceof Error ? err.message : 'Pilot error' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // ── End pilot ──────────────────────────────────────────────────────────────

  // ── Faucet ─────────────────────────────────────────────────────────────────

  const FAUCET_AMOUNT_WEI = BigInt(Math.round(Number(process.env.FAUCET_AMOUNT_OG ?? '0.1') * 1e18));
  const FAUCET_COOLDOWN_MS = (Number(process.env.FAUCET_COOLDOWN_HOURS ?? '24')) * 60 * 60 * 1_000;
  const FAUCET_KEY = process.env.FAUCET_PRIVATE_KEY ?? '';

  const faucetCooldownKey = (addr: string) => `faucet-cooldown:${addr.toLowerCase()}`;
  type FaucetRecord = { address: string; txHash: string; amount: string; sentAt: string; cooldownUntil: string };

  const faucetCooldowns = new Map<string, FaucetRecord>();
  let faucetNonce: number | null = null;
  const faucetMutex = new Mutex();

  async function getFaucetRecord(address: string): Promise<FaucetRecord | null> {
    if (redis) {
      const raw = await redis.get(faucetCooldownKey(address));
      if (!raw) return null;
      return JSON.parse(raw) as FaucetRecord;
    }
    return faucetCooldowns.get(address.toLowerCase()) ?? null;
  }

  async function setFaucetRecord(record: FaucetRecord): Promise<void> {
    if (redis) {
      await redis.set(faucetCooldownKey(record.address), JSON.stringify(record), 'PX', FAUCET_COOLDOWN_MS + 60_000);
    } else {
      faucetCooldowns.set(record.address.toLowerCase(), record);
    }
  }

  app.get('/v1/faucet/status', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { tags: ['faucet'], querystring: z.object({ address: addressSchema }) },
  }, async (request, reply) => {
    if (!FAUCET_KEY) return reply.send({ enabled: false, eligible: false });
    const { address } = request.query as { address: string };
    const record = await getFaucetRecord(address);
    if (!record) return reply.send({ enabled: true, eligible: true });
    const cooldownUntil = new Date(record.cooldownUntil).getTime();
    if (Date.now() >= cooldownUntil) return reply.send({ enabled: true, eligible: true });
    return reply.send({ enabled: true, eligible: false, cooldownUntil: record.cooldownUntil, txHash: record.txHash });
  });

  app.post('/v1/faucet/request', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['faucet'], body: z.object({ address: addressSchema }) },
  }, async (request, reply) => {
    if (!FAUCET_KEY) return problem(reply, 503, 'Faucet disabled', 'FAUCET_PRIVATE_KEY is not configured.');
    const body = request.body as { address: string };
    const recipient = getAddress(body.address);

    const existing = await getFaucetRecord(recipient);
    if (existing) {
      const cooldownUntil = new Date(existing.cooldownUntil).getTime();
      if (Date.now() < cooldownUntil) {
        return problem(reply, 429, 'Cooldown active', `Already sent to ${recipient}. Try again after ${existing.cooldownUntil}.`);
      }
    }

    return faucetMutex.runExclusive(async () => {
      const re_existing = await getFaucetRecord(recipient);
      if (re_existing) {
        const cooldownUntil = new Date(re_existing.cooldownUntil).getTime();
        if (Date.now() < cooldownUntil) {
          return problem(reply, 429, 'Cooldown active', `Already sent to ${recipient}. Try again after ${re_existing.cooldownUntil}.`);
        }
      }

      const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
      const provider = new JsonRpcProvider(rpcUrl, 16661, { staticNetwork: true });
      const { Wallet: EthersWallet } = await import('ethers');
      const wallet = new EthersWallet(FAUCET_KEY, provider);
      const faucetAddress = wallet.address;

      const [balance, currentNonce, feeData] = await Promise.all([
        provider.getBalance(faucetAddress),
        provider.getTransactionCount(faucetAddress, 'latest'),
        provider.getFeeData(),
      ]);

      if (balance < FAUCET_AMOUNT_WEI + 1_000_000_000_000_000n) {
        app.log.warn({ faucetAddress, balance: balance.toString() }, 'faucet balance too low');
        return problem(reply, 503, 'Faucet empty', 'Faucet balance is too low. Try the official faucet at faucet.0g.ai.');
      }

      if (faucetNonce === null || currentNonce > faucetNonce) faucetNonce = currentNonce;
      const nonce = faucetNonce++;

      const gasPrice = (feeData.gasPrice ?? 1_000_000_000n) * 12n / 10n;
      const tx = await wallet.sendTransaction({ to: recipient, value: FAUCET_AMOUNT_WEI, nonce, gasPrice, gasLimit: 21_000n });
      app.log.info({ recipient, nonce, txHash: tx.hash, amount: FAUCET_AMOUNT_WEI.toString() }, 'faucet: sent');

      const cooldownUntil = new Date(Date.now() + FAUCET_COOLDOWN_MS).toISOString();
      const record: FaucetRecord = { address: recipient, txHash: tx.hash, amount: FAUCET_AMOUNT_WEI.toString(), sentAt: nowIso(), cooldownUntil };
      await setFaucetRecord(record);

      return reply.status(200).send({ txHash: tx.hash, amount: FAUCET_AMOUNT_WEI.toString(), cooldownUntil });
    });
  });

  // ── End faucet ──────────────────────────────────────────────────────────────

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
  const storageIndexerUrl = process.env.ZERO_G_STORAGE_INDEXER_URL ?? 'https://indexer-storage-turbo.0g.ai';

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
  const storageClient = new StorageClient({ rpcUrl, indexerUrl: storageIndexerUrl, signerKey }) as StorageClientWithBytes;
  const app = buildEdgeServer({ chainClient, storageClient, signerKey, chainId: 16661, paymentRouterAddress, receiptBookAddress, accountFactoryAddress, agentIdentityAddress, agentDeployerKey, jwtSecret: process.env.EDGE_JWT_SECRET });
  await app.listen({ port: Number(process.env.PORT ?? 8080), host: '0.0.0.0' });
  return app;
}

if (process.env.APOGEE_EDGE_AUTOSTART === '1') void startFromEnv();
