/**
 * Demo-agent heartbeat loops.
 *
 * Aurora  (every 10 min): pull headlines → aggregate → summarise → embed → memory → receipt → self-pay
 * Vesper  (every 15 min): memory.search aurora → image.generate → storage.upload → nft.mint → pay aurora
 * Helix   (every 30 min): chain.query last receipts → chat.completion → memory.write
 *
 * All loops:
 *  - exit early when job.data.enabled === false or HEARTBEATS_PAUSED=true
 *  - capture errors, mint an error receipt, and continue
 */

import { createHash } from 'node:crypto';
import pino, { type Logger } from 'pino';
import type { Worker, Queue, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { SkillRunner, SkillRunnerContext } from '@apogee/skills-runtime';
import type { ReceiptMinter } from '@apogee/billing';
import type { ChainClient } from '@apogee/chain-client';
import type { StorageClient } from '@apogee/storage-client';

export type HeartbeatJobData = {
  agentName: 'Aurora' | 'Vesper' | 'Helix';
  enabled: boolean;
};

export type LastHeartbeat = {
  aurora: string | null;
  vesper: string | null;
  helix: string | null;
};

export interface HeartbeatWorkerDeps {
  skillRunner: SkillRunner;
  receiptMinter: ReceiptMinter;
  chainClient: ChainClient;
  storageClient: StorageClient;
  logger?: Logger;
}

// Shared mutable state so the health endpoint can report last run times
export const lastHeartbeat: LastHeartbeat = { aurora: null, vesper: null, helix: null };

// Keccak-256 isn't in Node's crypto. Pass the label string; ReceiptMinter converts to bytes4 internally.
const TAGS = {
  heartbeatAnalyze: 'agent.heartbeat.analyze',
  heartbeatMedia:   'agent.heartbeat.media',
  heartbeatReport:  'agent.heartbeat.report',
  heartbeatError:   'agent.heartbeat.error',
} as const;

function shortHash(s: string): string {
  return '0x' + createHash('sha256').update(s).digest('hex').slice(0, 8);
}

const agentId = (name: string): string =>
  process.env[`${name.toUpperCase()}_AGENT_ID`] ?? name.toLowerCase();

function skipContext(): boolean {
  return process.env['HEARTBEATS_PAUSED'] === 'true';
}

async function safeSkill(
  runner: SkillRunner,
  skillId: string,
  input: unknown,
  ctx: SkillRunnerContext,
  log: Logger,
): Promise<unknown> {
  try {
    const result = await runner.execute(skillId, input, ctx);
    return result.output;
  } catch (err) {
    log.warn({ skillId, err }, 'Skill call failed — continuing heartbeat with fallback');
    return null;
  }
}

// ── Aurora heartbeat ──────────────────────────────────────────────────────────

async function auroraHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const id = agentId('aurora');
  const ctx: SkillRunnerContext = {
    agentId: id,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    logger: log,
    allowStorageWrite: true,
  };

  const searchResult = await safeSkill(deps.skillRunner, 'web.search',
    { query: 'latest 0G blockchain AI agent news', limit: 3 }, ctx, log);

  const aggregated = await safeSkill(deps.skillRunner, 'news.aggregate',
    { items: searchResult ?? [] }, ctx, log);

  const summary = await safeSkill(deps.skillRunner, 'summarize.long',
    { text: JSON.stringify(aggregated ?? searchResult ?? 'no news'), maxWords: 200 }, ctx, log);

  const embedding = await safeSkill(deps.skillRunner, 'chat.embed',
    { text: String(summary ?? '') }, ctx, log);

  const memKey = `aurora/news/${Date.now()}`;
  await safeSkill(deps.skillRunner, 'memory.write',
    { key: memKey, value: { summary, embedding, fetchedAt: new Date().toISOString() }, tags: ['news', 'heartbeat'] }, ctx, log);

  await deps.receiptMinter.mint({
    agentId: id,
    actionTag: TAGS.heartbeatAnalyze,
    payload: { summary, memKey, ts: new Date().toISOString() },
    valueWei: 500_000_000_000_000n,
  });

  log.info({ agentId: id, memKey }, 'Aurora heartbeat complete');
  lastHeartbeat.aurora = new Date().toISOString();
}

// ── Vesper heartbeat ──────────────────────────────────────────────────────────

async function vesperHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const id = agentId('vesper');
  const auroraId = agentId('aurora');
  const ctx: SkillRunnerContext = {
    agentId: id,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    logger: log,
    allowStorageWrite: true,
  };

  const memResult = await safeSkill(deps.skillRunner, 'memory.search',
    { query: 'aurora news headline', agentId: auroraId, limit: 1 }, ctx, log);

  const headline = (() => {
    try { return (memResult as Array<{ value: { summary?: string } }>)[0]?.value?.summary ?? 'Apogee Protocol'; }
    catch { return 'Apogee Protocol'; }
  })();

  const imageResult = await safeSkill(deps.skillRunner, 'image.generate',
    { prompt: `Futuristic digital art representing: ${String(headline).slice(0, 120)}`, size: '512x512' }, ctx, log);

  const storageResult = await safeSkill(deps.skillRunner, 'storage.upload',
    { data: imageResult ?? { headline }, contentType: 'application/json' }, ctx, log);

  const storageRoot = (storageResult as { rootHash?: string } | null)?.rootHash ?? '';

  const nftResult = await safeSkill(deps.skillRunner, 'nft.mint',
    { to: id, metadataRoot: storageRoot || shortHash(headline), description: headline }, ctx, log);

  await deps.receiptMinter.mint({
    agentId: id,
    actionTag: TAGS.heartbeatMedia,
    payload: { headline, storageRoot, nft: nftResult, ts: new Date().toISOString() },
    storageRoot: storageRoot || undefined,
    valueWei: 200_000_000_000_000n,
  });

  log.info({ agentId: id, storageRoot }, 'Vesper heartbeat complete');
  lastHeartbeat.vesper = new Date().toISOString();
}


// ── Helix heartbeat ───────────────────────────────────────────────────────────

async function helixHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const id = agentId('helix');
  const ctx: SkillRunnerContext = {
    agentId: id,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    logger: log,
    allowStorageWrite: true,
  };

  const receiptQueryResult = await safeSkill(deps.skillRunner, 'chain.query',
    { contract: 'ReceiptBook', method: 'getRecentReceipts', args: [30], abiFragment: 'function getRecentReceipts(uint256 limit) view returns (bytes32[])' }, ctx, log);

  const reportText = await safeSkill(deps.skillRunner, 'chat.completion',
    { messages: [{ role: 'system', content: 'Summarise the following on-chain receipt data in 3 sentences.' }, { role: 'user', content: JSON.stringify(receiptQueryResult ?? []) }] }, ctx, log);

  const memKey = `helix/daily-report/${new Date().toISOString().slice(0, 10)}`;
  await safeSkill(deps.skillRunner, 'memory.write',
    { key: memKey, value: { report: reportText, generatedAt: new Date().toISOString() }, tags: ['report', 'heartbeat'] }, ctx, log);

  await deps.receiptMinter.mint({
    agentId: id,
    actionTag: TAGS.heartbeatReport,
    payload: { memKey, ts: new Date().toISOString() },
  });

  log.info({ agentId: id, memKey }, 'Helix heartbeat complete');
  lastHeartbeat.helix = new Date().toISOString();
}

// ── Error receipt helper ──────────────────────────────────────────────────────

async function mintErrorReceipt(
  minter: ReceiptMinter,
  id: string,
  err: unknown,
  log: Logger,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await minter.mint({
      agentId: id,
      actionTag: TAGS.heartbeatError,
      payload: { error: message, ts: new Date().toISOString() },
    });
  } catch (mintErr) {
    log.error({ mintErr }, 'Failed to mint error receipt');
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createHeartbeatWorker(
  connection: Redis,
  deps: HeartbeatWorkerDeps,
): Worker<HeartbeatJobData> {
  const log = deps.logger ?? pino({ name: 'apogee-heartbeats' });

  // Lazy import to avoid circular dep; bullmq Worker is instantiated at runtime
  const { Worker } = require('bullmq') as typeof import('bullmq');

  return new Worker<HeartbeatJobData>(
    'heartbeats',
    async (job: Job<HeartbeatJobData>) => {
      const { agentName, enabled } = job.data;
      if (!enabled || skipContext()) {
        log.debug({ agentName }, 'Heartbeat skipped (disabled or paused)');
        return;
      }

      const id = agentId(agentName.toLowerCase());
      log.info({ agentName, jobId: job.id }, 'Heartbeat start');
      try {
        switch (agentName) {
          case 'Aurora': await auroraHeartbeat(deps, log); break;
          case 'Vesper': await vesperHeartbeat(deps, log); break;
          case 'Helix':  await helixHeartbeat(deps, log);  break;
          default: log.warn({ agentName }, 'Unknown agent in heartbeat job');
        }
      } catch (err) {
        log.error({ agentName, err }, 'Heartbeat failed — minting error receipt');
        await mintErrorReceipt(deps.receiptMinter, id, err, log);
      }
    },
    { connection, concurrency: 1 },
  );
}

// ── Schedule repeating heartbeat jobs ────────────────────────────────────────

export async function scheduleHeartbeats(queue: Queue<HeartbeatJobData>): Promise<void> {
  const paused = process.env['HEARTBEATS_PAUSED'] !== 'false';

  const jobs: Array<{ name: string; data: HeartbeatJobData; every: number }> = [
    { name: 'heartbeat:aurora', data: { agentName: 'Aurora', enabled: !paused }, every: 10 * 60_000 },
    { name: 'heartbeat:vesper', data: { agentName: 'Vesper', enabled: !paused }, every: 15 * 60_000 },
    { name: 'heartbeat:helix',  data: { agentName: 'Helix',  enabled: !paused }, every: 30 * 60_000 },
  ];

  for (const j of jobs) {
    await queue.add(j.name, j.data, {
      jobId: j.name,
      repeat: { every: j.every },
      removeOnComplete: 50,
      removeOnFail: 20,
    });
  }
}
