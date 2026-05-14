import http from 'node:http';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Prisma, PrismaClient } from '@prisma/client';
import pino from 'pino';
import { ChainClient } from '@apogee/chain-client';
import { ComputeClient } from '@apogee/compute-client';
import { StorageClient } from '@apogee/storage-client';
import { ReceiptMinter, InMemoryReceiptIndex, type StorageBoundary, type ChainBoundary } from '@apogee/billing';
import { SkillRegistry, SkillRunner, type SkillManifest } from '@apogee/skills-runtime';
import { registerCoreSkills } from '@apogee/skills-core';
import { registerPremiumSkills } from '@apogee/skills-premium';
import { z } from 'zod';
import { createHeartbeatWorker, scheduleHeartbeats, lastHeartbeat, type HeartbeatJobData } from './heartbeats.js';
import { createReconcilerWorker, scheduleReconciler } from './reconciler.js';

const logger = pino({ name: 'apogee-runtime' });

export const agentRunJobSchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().min(1),
  goal: z.string().min(1),
  inputs: z.unknown().optional(),
  mode: z.enum(['plan-act', 'fixed']).default('plan-act'),
});

export type AgentRunJob = z.infer<typeof agentRunJobSchema>;
export type PlanStep = { skillId: string; input: unknown };

type JsonRecord = Record<string, unknown>;
type RuntimeClients = { chainClient: ChainClient; storageClient: StorageClient; computeClient: ComputeClient };

class AgentMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(agentId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.tails.set(agentId, previous.then(() => next, () => next));
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(agentId) === next) this.tails.delete(agentId);
    }
  }
}

class PolicyMirror {
  constructor(private readonly registry: SkillRegistry) {}

  check(policy: { active?: boolean | null; maxPerTxWei?: unknown } | null | undefined, skillId: string): void {
    if (policy && policy.active === false) throw new Error('Agent policy is paused/inactive');
    const manifest = this.registry.get(skillId).manifest;
    const max = policy?.maxPerTxWei === null || policy?.maxPerTxWei === undefined ? undefined : BigInt(String(policy.maxPerTxWei));
    if (max !== undefined && manifest.pricePerCallWei > max) throw new Error(`Skill ${skillId} exceeds maxPerTxWei`);
  }
}

const json = (value: unknown): JsonRecord => JSON.parse(JSON.stringify(value ?? {})) as JsonRecord;
const prismaJson = (value: unknown): Prisma.InputJsonValue => json(value) as Prisma.InputJsonValue;

export class RuntimeOrchestrator {
  private readonly runner: SkillRunner;
  private readonly policy: PolicyMirror;
  private readonly receiptMinter: ReceiptMinter;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: SkillRegistry,
    private readonly clients: RuntimeClients,
  ) {
    this.runner = new SkillRunner(registry, logger);
    this.policy = new PolicyMirror(registry);
    this.receiptMinter = new ReceiptMinter({
      storageClient: clients.storageClient,
      chainClient: clients.chainClient as never,
      receiptBookAddress: requiredEnv('RECEIPT_BOOK_ADDRESS'),
    });
  }

  async execute(job: AgentRunJob): Promise<void> {
    await this.prisma.run.update({ where: { id: job.runId }, data: { status: 'running', input: prismaJson({ goal: job.goal, inputs: job.inputs, mode: job.mode }) } });
    try {
      const agent = await this.loadAgent(job.agentId);
      if (Boolean((agent as { paused?: boolean }).paused)) throw new Error('Agent is paused');
      const plan = job.mode === 'fixed' ? this.fixedPlan(job.inputs) : await this.plan(agent, job.goal);
      const stepOutputs: Array<{ step: PlanStep; output: unknown; receiptId?: string }> = [];
      for (const step of plan) {
        await this.throwIfPaused(job.agentId);
        this.policy.check(agent.policy, step.skillId);
        const runStep = await this.prisma.runStep.create({ data: { runId: job.runId, name: step.skillId, status: 'running', payload: prismaJson(step.input) } });
        try {
          const result = await this.runner.execute(step.skillId, step.input, {
            agentId: job.agentId,
            chainClient: this.clients.chainClient,
            storageClient: this.clients.storageClient,
            computeClient: this.clients.computeClient,
            memory: this.memoryClient(job.agentId),
            allowStorageWrite: true,
            env: process.env,
          });
          const manifest = this.registry.get(step.skillId).manifest;
          const receipt = await this.mintStepReceipt(job.runId, job.agentId, manifest, step, result.output);
          await this.prisma.runStep.update({ where: { id: runStep.id }, data: { status: 'succeeded', payload: prismaJson({ input: step.input, output: result.output, provenance: result.provenance, receiptId: receipt.receiptId }) } });
          stepOutputs.push({ step, output: result.output, receiptId: receipt.receiptId });
        } catch (error) {
          await this.prisma.runStep.update({ where: { id: runStep.id }, data: { status: 'failed', payload: prismaJson({ input: step.input, error: error instanceof Error ? error.message : String(error) }) } });
          throw error;
        }
      }
      const finalResult = await this.aggregate(agent, job.goal, stepOutputs);
      await this.prisma.run.update({ where: { id: job.runId }, data: { status: 'succeeded', output: prismaJson(finalResult) } });
    } catch (error) {
      await this.prisma.run.update({ where: { id: job.runId }, data: { status: 'failed', error: prismaJson({ message: error instanceof Error ? error.message : String(error) }) } });
      throw error;
    }
  }

  private async loadAgent(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { policy: true, skills: true, memory: { take: 50, orderBy: { updatedAt: 'desc' } } },
    });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    return agent;
  }

  private async throwIfPaused(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, paused: true } });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (agent.paused) throw new Error('Agent paused; stopping run within one iteration');
  }

  private fixedPlan(inputs: unknown): PlanStep[] {
    if (Array.isArray(inputs)) return inputs as PlanStep[];
    if (typeof inputs === 'object' && inputs !== null && Array.isArray((inputs as { steps?: unknown }).steps)) return (inputs as { steps: PlanStep[] }).steps;
    throw new Error('fixed mode requires inputs.steps');
  }

  private async plan(agent: Awaited<ReturnType<RuntimeOrchestrator['loadAgent']>>, goal: string): Promise<PlanStep[]> {
    const installed = new Set(agent.skills.map((skill) => skill.skillId));
    const manifests = this.registry.list().filter((manifest) => installed.has(manifest.id) || manifest.id === 'chat.completion').map((manifest) => this.publicManifest(manifest));
    const description = String((agent as { description?: string | null }).description ?? `Agent ${agent.id}`);
    const response = await this.clients.computeClient.chat({
      messages: [
        { role: 'system', content: `${description}\nReturn strict JSON: {"steps":[{"skillId":"...","input":{}}]} using only installed skill manifests.\n${JSON.stringify(manifests)}` },
        { role: 'user', content: goal },
      ],
    });
    const content = typeof response === 'object' && response !== null && 'content' in response ? String((response as { content?: string }).content ?? '') : JSON.stringify(response);
    const parsed = JSON.parse(content) as { steps?: PlanStep[] };
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) throw new Error('Planner returned no steps');
    return parsed.steps;
  }

  private async aggregate(agent: Awaited<ReturnType<RuntimeOrchestrator['loadAgent']>>, goal: string, steps: Array<{ step: PlanStep; output: unknown; receiptId?: string }>): Promise<unknown> {
    const response = await this.clients.computeClient.chat({
      messages: [
        { role: 'system', content: 'Summarise autonomous agent run steps into a final result JSON with summary, outputs, and receiptIds.' },
        { role: 'user', content: JSON.stringify({ agentId: agent.id, goal, steps }) },
      ],
    });
    return typeof response === 'object' && response !== null && 'content' in response ? { summary: (response as { content?: string }).content, steps } : { response, steps };
  }

  private async mintStepReceipt(runId: string, agentId: string, manifest: SkillManifest, step: PlanStep, output: unknown): Promise<{ receiptId: string }> {
    const receipt = await this.receiptMinter.mint({
      agentId,
      actionTag: 'STEP',
      payload: { runId, skillId: step.skillId, input: step.input, output },
      valueWei: manifest.pricePerCallWei,
      clientReceiptId: `run:${runId}:step:${step.skillId}:${Date.now()}`,
    });
    const receiptData: Prisma.ReceiptUncheckedCreateInput = {
        id: receipt.receiptId,
        clientReceiptId: `run:${runId}:receipt:${receipt.receiptId}`,
        agentId,
        actionTag: 'STEP',
        payloadHash: `0x${createHash('sha256').update(JSON.stringify({ runId, step, output })).digest('hex')}`,
        storageRoot: receipt.storageRoot,
        valueWei: manifest.pricePerCallWei.toString(),
        status: 'minted',
        runId,
    };
    if (receipt.txHash) receiptData.txHash = receipt.txHash;
    await this.prisma.receipt.create({ data: receiptData });
    return { receiptId: receipt.receiptId };
  }

  private memoryClient(agentId: string): { read(key: string): Promise<unknown>; write(key: string, value: unknown): Promise<unknown>; search(query: string): Promise<unknown[]> } {
    return {
      read: async (key: string) => this.prisma.memoryIndex.findUnique({ where: { agentId_key: { agentId, key } } }),
      write: async (key: string, value: unknown) => this.prisma.memoryIndex.upsert({ where: { agentId_key: { agentId, key } }, create: { agentId, key, embedding: prismaJson(value) }, update: { embedding: prismaJson(value) } }),
      search: async (query: string) => this.prisma.memoryIndex.findMany({ where: { agentId, OR: [{ key: { contains: query } }, { tags: { has: query } }] }, take: 10 }),
    };
  }

  private publicManifest(manifest: SkillManifest): JsonRecord {
    return { id: manifest.id, version: manifest.version, description: manifest.description, pricePerCallWei: manifest.pricePerCallWei.toString(), declaredEgress: [...manifest.declaredEgress], sideEffects: [...manifest.sideEffects] };
  }
}

export function createRegistry(): SkillRegistry {
  return registerPremiumSkills(registerCoreSkills(new SkillRegistry()));
}

export function createQueues(connection: Redis): { agentRuns: Queue<AgentRunJob>; heartbeats: Queue<HeartbeatJobData>; reconciler: Queue } {
  return {
    agentRuns:  new Queue<AgentRunJob>('agent-runs', { connection, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 20 } }),
    heartbeats: new Queue<HeartbeatJobData>('heartbeats', { connection }),
    reconciler: new Queue('reconcile-pending-receipts', { connection }),
  };
}

export function startMetricsServer(port = 9100): http.Server {
  const started = Date.now();
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        uptimeSec: Math.floor((Date.now() - started) / 1000),
        lastHeartbeat,
      }));
      return;
    }
    if (req.url !== '/metrics') { res.writeHead(404).end(); return; }
    const uptime = Math.floor((Date.now() - started) / 1000);
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    res.end(`# HELP apogee_runtime_uptime_seconds Runtime uptime in seconds\n# TYPE apogee_runtime_uptime_seconds gauge\napogee_runtime_uptime_seconds ${uptime}\n`);
  });
  server.listen(port, '0.0.0.0');
  return server;
}


type DiscoveredAgent = { tokenId: string; owner: string; accountAddress?: string | undefined };

function uint256Arg(value: bigint): string { return value.toString(16).padStart(64, '0'); }
function decodeAddress(result: string): string | null {
  if (!/^0x[a-fA-F0-9]{64}$/.test(result)) return null;
  const addr = `0x${result.slice(-40)}`;
  return /^0x0{40}$/.test(addr) ? null : addr;
}

async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }), signal: AbortSignal.timeout(5000) });
  const body = await res.json() as { result?: string; error?: { message?: string } };
  if (!body.result) throw new Error(body.error?.message ?? 'eth_call failed');
  return body.result;
}

async function discoverAgentsFromChain(): Promise<DiscoveredAgent[]> {
  const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc.0g.ai';
  const identity = process.env.AGENT_IDENTITY_ADDRESS;
  const router = process.env.PAYMENT_ROUTER_ADDRESS;
  if (!identity || !router) return [];
  const nextRaw = await rpcCall(rpcUrl, identity, '0x75794a3c'); // nextTokenId()
  const next = BigInt(nextRaw);
  const max = next > 200n ? 200n : next;
  const out: DiscoveredAgent[] = [];
  for (let tokenId = 1n; tokenId < max; tokenId += 1n) {
    try {
      const [ownerRaw, accountRaw] = await Promise.all([
        rpcCall(rpcUrl, identity, `0x6352211e${uint256Arg(tokenId)}`), // ownerOf(uint256)
        rpcCall(rpcUrl, router, `0xb682f13c${uint256Arg(tokenId)}`).catch(() => '0x'), // agentAccounts(uint256)
      ]);
      const owner = decodeAddress(ownerRaw);
      if (!owner) continue;
      const accountAddress = decodeAddress(accountRaw) ?? undefined;
      out.push({ tokenId: tokenId.toString(), owner, accountAddress });
    } catch {
      // Nonexistent/burned token IDs are skipped.
    }
  }
  return out;
}

async function notifyDiscoveredAgents(log = logger): Promise<void> {
  const base = process.env.EDGE_API_URL;
  const secret = process.env.INTERNAL_SECRET;
  if (!base || !secret) return;
  const agents = await discoverAgentsFromChain();
  for (const agent of agents) {
    const res = await fetch(`${base}/internal/agent-discovered`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-secret': secret }, body: JSON.stringify({ chainId: 16661, ...agent }) });
    if (!res.ok) log.warn({ tokenId: agent.tokenId, status: res.status, body: await res.text().catch(() => '') }, 'agent discovery push failed');
  }
  log.info({ discovered: agents.length }, 'agent identity indexer tick complete');
}

function startAgentIdentityIndexer(): () => void {
  if (process.env.AGENT_INDEXER_DISABLED === 'true') return () => undefined;
  void notifyDiscoveredAgents().catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'agent identity indexer failed'));
  const timer = setInterval(() => void notifyDiscoveredAgents().catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'agent identity indexer failed')), 60_000);
  return () => clearInterval(timer);
}

export async function startRuntime(): Promise<{ worker: Worker<AgentRunJob>; queues: ReturnType<typeof createQueues>; metrics: http.Server }> {
  const connection = new Redis(requiredEnv('REDIS_URL'), { maxRetriesPerRequest: null });
  const prisma = new PrismaClient();
  const registry = createRegistry();
  const clients = createClients();
  const skillRunner = new SkillRunner(registry, logger);
  const orchestrator = new RuntimeOrchestrator(prisma, registry, clients);
  const mutex = new AgentMutex();
  const queues = createQueues(connection);

  const fallbackDir = process.env.RECEIPT_FALLBACK_DIR ?? join(process.cwd(), '.receipt-fallback');
  const receiptMinter = new ReceiptMinter({
    storageClient: clients.storageClient as unknown as StorageBoundary,
    chainClient: clients.chainClient as unknown as ChainBoundary,
    receiptBookAddress: requiredEnv('RECEIPT_BOOK_ADDRESS'),
    index: new InMemoryReceiptIndex(),
    fallbackDir,
    logger,
  });

  // Schedule repeating heartbeat jobs (HEARTBEATS_PAUSED=true until smoke-tested)
  await scheduleHeartbeats(queues.heartbeats);
  await scheduleReconciler(queues.reconciler);

  const concurrency = Number(process.env.RUNTIME_WORKER_CONCURRENCY ?? 5);
  const worker = new Worker<AgentRunJob>('agent-runs', async (job: Job<AgentRunJob>) => {
    const data = agentRunJobSchema.parse(job.data);
    await mutex.run(data.agentId, () => orchestrator.execute(data));
  }, { connection, concurrency });
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'agent run failed'));

  const heartbeatWorker = createHeartbeatWorker(connection, {
    skillRunner, receiptMinter,
    chainClient: clients.chainClient,
    storageClient: clients.storageClient,
    computeClient: clients.computeClient,
    logger,
  });
  heartbeatWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'heartbeat failed'));

  const reconcilerWorker = createReconcilerWorker(connection, { receiptMinter, fallbackDir, logger });
  reconcilerWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'reconciler failed'));

  const stopAgentIdentityIndexer = startAgentIdentityIndexer();
  worker.on('closed', stopAgentIdentityIndexer);
  const metrics = startMetricsServer(Number(process.env.METRICS_PORT ?? 9100));
  logger.info({ heartbeatsPaused: process.env.HEARTBEATS_PAUSED !== 'false' }, 'apogee runtime started');
  return { worker, queues, metrics };
}

function createClients(): RuntimeClients {
  const chainRpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc.0g.ai';
  const storageRpcUrl = process.env.ZERO_G_STORAGE_RPC_URL ?? 'https://evmrpc.0g.ai';
  const signerKey = requiredEnv('EDGE_SERVICE_PRIVATE_KEY');
  return {
    chainClient: new ChainClient({ rpcUrl: chainRpcUrl, chainId: Number(process.env.ZERO_G_GALILEO_CHAIN_ID ?? 16661), signerKey }),
    storageClient: new StorageClient({ rpcUrl: storageRpcUrl, indexerUrl: process.env.ZERO_G_STORAGE_INDEXER_URL ?? 'https://indexer-storage-turbo.0g.ai', signerKey }),
    computeClient: new ComputeClient({ rpcUrl: chainRpcUrl, signerKey }),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

if (process.argv[1]?.endsWith('/index.js')) {
  void startRuntime().then(() => logger.info('apogee runtime started'));
}
