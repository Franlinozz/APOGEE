/**
 * One-shot heartbeat smoke test.
 * Usage: pnpm -F @apogee/runtime heartbeat:once aurora|vesper|helix
 *
 * Runs exactly one heartbeat, prints the receipt result or blocker, then exits.
 * Does NOT start any repeat loops or BullMQ workers.
 */

import { join } from 'node:path';
import pino from 'pino';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ChainClient } from '@apogee/chain-client';
import { ComputeClient } from '@apogee/compute-client';
import { StorageClient } from '@apogee/storage-client';
import { ReceiptMinter, InMemoryReceiptIndex, type StorageBoundary, type ChainBoundary } from '@apogee/billing';
import { SkillRegistry, SkillRunner } from '@apogee/skills-runtime';
import { registerCoreSkills } from '@apogee/skills-core';
import { registerPremiumSkills } from '@apogee/skills-premium';
import { runHeartbeatOnce } from './heartbeats.js';

const AGENTS = ['aurora', 'vesper', 'helix'] as const;
type AgentSlug = (typeof AGENTS)[number];

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main(): Promise<void> {
  const slugArg = process.argv[2]?.toLowerCase() as AgentSlug | undefined;
  if (!slugArg || !AGENTS.includes(slugArg)) {
    console.error(`Usage: heartbeat:once <${AGENTS.join('|')}>`);
    process.exit(1);
  }

  const agentName = (slugArg.charAt(0).toUpperCase() + slugArg.slice(1)) as 'Aurora' | 'Vesper' | 'Helix';
  const log = pino({ name: `heartbeat-once:${slugArg}` });

  log.info({ agentName }, 'Starting one-shot heartbeat smoke test');

  // Validate agent token ID before doing anything else
  const tokenIdEnv = `${slugArg.toUpperCase()}_AGENT_ID`;
  const tokenId = process.env[tokenIdEnv];
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    log.error({ tokenIdEnv, got: tokenId }, `BLOCKER: ${tokenIdEnv} must be a numeric tokenId`);
    process.exit(1);
  }

  const rpcUrl = process.env['ZERO_G_GALILEO_RPC_URL'] ?? 'https://evmrpc.0g.ai';
  const chainId = Number(process.env['ZERO_G_GALILEO_CHAIN_ID'] ?? 16661);
  const signerKey = requiredEnv('EDGE_SERVICE_PRIVATE_KEY');

  log.info({ rpcUrl, chainId }, 'Connecting to chain');

  const chainClient = new ChainClient({ rpcUrl, chainId, signerKey });
  const storageClient = new StorageClient({
    rpcUrl,
    indexerUrl: process.env['ZERO_G_STORAGE_INDEXER_URL'] ?? 'https://indexer-storage-testnet-turbo.0g.ai',
    signerKey,
  });
  const computeClient = new ComputeClient({ rpcUrl, signerKey });

  const registry = registerPremiumSkills(registerCoreSkills(new SkillRegistry()));
  const skillRunner = new SkillRunner(registry, log);

  const fallbackDir = process.env['RECEIPT_FALLBACK_DIR'] ?? join(process.cwd(), '.receipt-fallback');
  const receiptMinter = new ReceiptMinter({
    storageClient: storageClient as unknown as StorageBoundary,
    chainClient: chainClient as unknown as ChainBoundary,
    receiptBookAddress: requiredEnv('RECEIPT_BOOK_ADDRESS'),
    index: new InMemoryReceiptIndex(),
    fallbackDir,
    logger: log,
  });

  // Smoke test runs Redis connection for context but doesn't need it for one-shot
  // (SkillRunner and ReceiptMinter work without Redis)

  try {
    await runHeartbeatOnce(agentName, {
      skillRunner,
      receiptMinter,
      chainClient,
      storageClient,
      computeClient,
      logger: log,
    });
    log.info({ agentName }, '✓ Heartbeat:once completed successfully');
  } catch (err) {
    log.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
      '✗ Heartbeat:once FAILED — see error above for the blocker');
    process.exit(1);
  }

  // Prisma / Redis not started in smoke-test mode — just exit
  process.exit(0);
}

void main();
