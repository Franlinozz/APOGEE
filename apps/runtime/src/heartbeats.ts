/**
 * Demo-agent heartbeat loops.
 *
 * Aurora  (every 10 min): pull headlines → aggregate → summarise → embed → memory → receipt
 * Vesper  (every 15 min): memory.search aurora → image.generate → storage.upload → nft.mint → receipt
 * Helix   (every 30 min): chain.query last receipts → chat.completion → memory.write → receipt
 *
 * All loops:
 *  - skip when HEARTBEATS_PAUSED=true (checked at job-execution time, not schedule time)
 *  - capture errors, mint an error receipt, and continue
 *  - push every minted receipt to the edge store via /internal/receipt
 */

import { createHash } from 'node:crypto';
import pino, { type Logger } from 'pino';
import { Worker, type Queue, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { SkillRunner, SkillRunnerContext } from '@apogee/skills-runtime';
import type { ReceiptMinter, ReceiptIndexRow } from '@apogee/billing';
import type { ChainClient } from '@apogee/chain-client';
import type { StorageClient } from '@apogee/storage-client';

export type HeartbeatJobData = {
  agentName: 'Aurora' | 'Vesper' | 'Helix';
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
  computeClient?: unknown;
  logger?: Logger;
}

export const lastHeartbeat: LastHeartbeat = { aurora: null, vesper: null, helix: null };

const TAGS = {
  heartbeatAnalyze: 'agent.heartbeat.analyze',
  heartbeatMedia:   'agent.heartbeat.media',
  heartbeatReport:  'agent.heartbeat.report',
  heartbeatError:   'agent.heartbeat.error',
} as const;

function shortHash(s: string): string {
  return '0x' + createHash('sha256').update(s).digest('hex').slice(0, 8);
}

/**
 * Returns the numeric on-chain tokenId for a demo agent.
 * Requires AURORA_AGENT_ID / VESPER_AGENT_ID / HELIX_AGENT_ID to be set.
 * Throws early with a clear message if the env var is missing or non-numeric.
 */
function agentTokenId(slug: string): string {
  const envKey = `${slug.toUpperCase()}_AGENT_ID`;
  const val = process.env[envKey];
  if (!val || !/^\d+$/.test(val)) {
    throw new Error(
      `${envKey} must be set to the numeric on-chain tokenId (got: ${val ?? 'undefined'}). ` +
      `Check demo-agents-aristotle.json for the correct value.`,
    );
  }
  return val;
}

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
    log.warn({ skillId, err: err instanceof Error ? err.message : String(err) },
      'Skill failed — heartbeat continues with fallback');
    return null;
  }
}

// ── Edge push ─────────────────────────────────────────────────────────────────
// After minting, push the receipt row + lastHeartbeat update to the edge store
// so /v1/proofs shows data immediately (event-driven, no polling lag).

async function notifyEdge(
  row: ReceiptIndexRow,
  slug: string,
  ts: string,
  log: Logger,
): Promise<void> {
  const base = process.env['EDGE_API_URL'];
  const secret = process.env['INTERNAL_SECRET'];
  if (!base || !secret) {
    log.debug('EDGE_API_URL or INTERNAL_SECRET not set — skipping edge push');
    return;
  }
  const headers = { 'content-type': 'application/json', 'x-internal-secret': secret };
  try {
    await fetch(`${base}/internal/receipt`, {
      method: 'POST', headers, body: JSON.stringify(row),
    });
    const hbPatch: Record<string, string> = {};
    hbPatch[slug] = ts;
    await fetch(`${base}/internal/heartbeat`, {
      method: 'POST', headers, body: JSON.stringify(hbPatch),
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) },
      'Edge push failed — /proofs may lag until next poll');
  }
}

// ── Aurora ────────────────────────────────────────────────────────────────────

async function auroraHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const tokenId = agentTokenId('aurora');
  const slug = 'aurora';
  const ctx: SkillRunnerContext = {
    agentId: tokenId,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    computeClient: deps.computeClient,
    logger: log,
    allowStorageWrite: true,
  };

  log.info({ slug, tokenId }, 'Aurora heartbeat: starting skill chain');

  const searchResult = await safeSkill(deps.skillRunner, 'web.search',
    { query: 'latest 0G blockchain AI agent news', limit: 3 }, ctx, log);

  const aggregated = await safeSkill(deps.skillRunner, 'news.aggregate',
    { items: searchResult ?? [] }, ctx, log);

  const summary = await safeSkill(deps.skillRunner, 'summarize.long',
    { text: JSON.stringify(aggregated ?? searchResult ?? 'no news'), maxWords: 200 }, ctx, log);

  const embedding = await safeSkill(deps.skillRunner, 'chat.embed',
    { text: String(summary ?? 'Apogee Protocol heartbeat') }, ctx, log);

  const memKey = `aurora/news/${Date.now()}`;
  await safeSkill(deps.skillRunner, 'memory.write',
    { key: memKey, value: { summary, embedding, fetchedAt: new Date().toISOString() }, tags: ['news', 'heartbeat'] },
    ctx, log);

  const ts = new Date().toISOString();
  const payload = { summary, memKey, ts };
  const result = await deps.receiptMinter.mint({
    agentId: tokenId,
    actionTag: TAGS.heartbeatAnalyze,
    payload,
    valueWei: 500_000_000_000_000n,
  });

  log.info({ slug, tokenId, receiptId: result.receiptId, txHash: result.txHash, status: result.status, memKey },
    'Aurora heartbeat complete');

  lastHeartbeat.aurora = ts;
  await notifyEdge({
    receiptId: result.receiptId,
    agentId: slug,
    actionTag: TAGS.heartbeatAnalyze,
    payloadHash: result.payloadHash,
    storageRoot: result.storageRoot,
    storageTxHash: result.storageTxHash,
    valueWei: '500000000000000',
    txHash: result.txHash,
    status: result.status,
    createdAt: ts,
  }, slug, ts, log);
}

// ── Vesper ────────────────────────────────────────────────────────────────────

async function vesperHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const tokenId = agentTokenId('vesper');
  const auroraTokenId = agentTokenId('aurora');
  const slug = 'vesper';
  const ctx: SkillRunnerContext = {
    agentId: tokenId,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    computeClient: deps.computeClient,
    logger: log,
    allowStorageWrite: true,
  };

  log.info({ slug, tokenId }, 'Vesper heartbeat: starting skill chain');

  const memResult = await safeSkill(deps.skillRunner, 'memory.search',
    { query: 'aurora news headline', agentId: auroraTokenId, limit: 1 }, ctx, log);

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
    { to: tokenId, metadataRoot: storageRoot || shortHash(headline), description: headline }, ctx, log);

  const ts = new Date().toISOString();
  const payload = { headline, storageRoot, nft: nftResult, ts };
  const result = await deps.receiptMinter.mint({
    agentId: tokenId,
    actionTag: TAGS.heartbeatMedia,
    payload,
    storageRoot: storageRoot || undefined,
    valueWei: 200_000_000_000_000n,
  });

  log.info({ slug, tokenId, receiptId: result.receiptId, txHash: result.txHash, status: result.status, storageRoot },
    'Vesper heartbeat complete');

  lastHeartbeat.vesper = ts;
  await notifyEdge({
    receiptId: result.receiptId,
    agentId: slug,
    actionTag: TAGS.heartbeatMedia,
    payloadHash: result.payloadHash,
    storageRoot: result.storageRoot,
    storageTxHash: result.storageTxHash,
    valueWei: '200000000000000',
    txHash: result.txHash,
    status: result.status,
    createdAt: ts,
  }, slug, ts, log);
}

// ── Helix ─────────────────────────────────────────────────────────────────────

async function helixHeartbeat(deps: HeartbeatWorkerDeps, log: Logger): Promise<void> {
  const tokenId = agentTokenId('helix');
  const slug = 'helix';
  const ctx: SkillRunnerContext = {
    agentId: tokenId,
    chainClient: deps.chainClient,
    storageClient: deps.storageClient,
    computeClient: deps.computeClient,
    logger: log,
    allowStorageWrite: true,
  };

  log.info({ slug, tokenId }, 'Helix heartbeat: starting skill chain');

  const receiptQueryResult = await safeSkill(deps.skillRunner, 'chain.query',
    {
      contract: 'ReceiptBook',
      method: 'getRecentReceipts',
      args: [30],
      abiFragment: 'function getRecentReceipts(uint256 limit) view returns (bytes32[])',
    }, ctx, log);

  const reportText = await safeSkill(deps.skillRunner, 'chat.completion',
    {
      messages: [
        { role: 'system', content: 'Summarise the following on-chain receipt data in 3 sentences.' },
        { role: 'user', content: JSON.stringify(receiptQueryResult ?? []) },
      ],
    }, ctx, log);

  const memKey = `helix/daily-report/${new Date().toISOString().slice(0, 10)}`;
  await safeSkill(deps.skillRunner, 'memory.write',
    { key: memKey, value: { report: reportText, generatedAt: new Date().toISOString() }, tags: ['report', 'heartbeat'] },
    ctx, log);

  const ts = new Date().toISOString();
  const payload = { memKey, ts };
  const result = await deps.receiptMinter.mint({
    agentId: tokenId,
    actionTag: TAGS.heartbeatReport,
    payload,
  });

  log.info({ slug, tokenId, receiptId: result.receiptId, txHash: result.txHash, status: result.status, memKey },
    'Helix heartbeat complete');

  lastHeartbeat.helix = ts;
  await notifyEdge({
    receiptId: result.receiptId,
    agentId: slug,
    actionTag: TAGS.heartbeatReport,
    payloadHash: result.payloadHash,
    storageRoot: result.storageRoot,
    storageTxHash: result.storageTxHash,
    valueWei: '0',
    txHash: result.txHash,
    status: result.status,
    createdAt: ts,
  }, slug, ts, log);
}

// ── Error receipt ─────────────────────────────────────────────────────────────

async function mintErrorReceipt(
  minter: ReceiptMinter,
  tokenId: string,
  err: unknown,
  log: Logger,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await minter.mint({
      agentId: tokenId,
      actionTag: TAGS.heartbeatError,
      payload: { error: message, ts: new Date().toISOString() },
    });
  } catch (mintErr) {
    log.error({ mintErr: mintErr instanceof Error ? mintErr.message : String(mintErr) },
      'Failed to mint error receipt');
  }
}

// ── Public: run a single heartbeat (for heartbeat:once smoke command) ─────────

export async function runHeartbeatOnce(
  agentName: 'Aurora' | 'Vesper' | 'Helix',
  deps: HeartbeatWorkerDeps,
): Promise<void> {
  const log = deps.logger ?? pino({ name: 'apogee-heartbeat-once' });
  switch (agentName) {
    case 'Aurora': return auroraHeartbeat(deps, log);
    case 'Vesper': return vesperHeartbeat(deps, log);
    case 'Helix':  return helixHeartbeat(deps, log);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createHeartbeatWorker(
  connection: Redis,
  deps: HeartbeatWorkerDeps,
): Worker<HeartbeatJobData> {
  const log = deps.logger ?? pino({ name: 'apogee-heartbeats' });

  return new Worker<HeartbeatJobData>(
    'heartbeats',
    async (job: Job<HeartbeatJobData>) => {
      const { agentName } = job.data;

      if (skipContext()) {
        log.debug({ agentName }, 'Heartbeat skipped (HEARTBEATS_PAUSED=true)');
        return;
      }

      let tokenId = '<unknown>';
      try {
        tokenId = agentTokenId(agentName.toLowerCase());
      } catch (err) {
        log.error({ agentName, err: err instanceof Error ? err.message : String(err) },
          'Agent tokenId env var missing — heartbeat aborted');
        return;
      }

      log.info({ agentName, tokenId, jobId: job.id }, 'Heartbeat start');
      try {
        switch (agentName) {
          case 'Aurora': await auroraHeartbeat(deps, log); break;
          case 'Vesper': await vesperHeartbeat(deps, log); break;
          case 'Helix':  await helixHeartbeat(deps, log);  break;
          default: log.warn({ agentName }, 'Unknown agent in heartbeat job');
        }
      } catch (err) {
        log.error({ agentName, tokenId, err: err instanceof Error ? err.message : String(err) },
          'Heartbeat failed — minting error receipt');
        await mintErrorReceipt(deps.receiptMinter, tokenId, err, log);
      }
    },
    { connection, concurrency: 1 },
  );
}

// ── Schedule repeating heartbeat jobs ─────────────────────────────────────────
// Clears stale repeat entries first so job data is always fresh on startup.

export async function scheduleHeartbeats(queue: Queue<HeartbeatJobData>): Promise<void> {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  const jobs: Array<{ name: string; data: HeartbeatJobData; every: number }> = [
    { name: 'heartbeat:aurora', data: { agentName: 'Aurora' }, every: 10 * 60_000 },
    { name: 'heartbeat:vesper', data: { agentName: 'Vesper' }, every: 15 * 60_000 },
    { name: 'heartbeat:helix',  data: { agentName: 'Helix'  }, every: 30 * 60_000 },
  ];

  for (const j of jobs) {
    await queue.add(j.name, j.data, {
      repeat: { every: j.every },
      removeOnComplete: 50,
      removeOnFail: 20,
    });
  }
}
