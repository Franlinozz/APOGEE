/**
 * Reconciler — retries receipts that failed on-chain submission.
 *
 * Runs every 60 s as a BullMQ repeating job.
 * Reads pending receipts from the ReceiptMinter's fallback directory,
 * re-submits each one, and emits a Pino warning when any receipt has
 * been pending for more than 10 minutes.
 */

import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import type { Worker, Queue, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ReceiptMinter } from '@apogee/billing';

const PENDING_WARN_MS = 10 * 60_000;
const RECONCILE_EVERY_MS = 60_000;

export interface ReconcilerDeps {
  receiptMinter: ReceiptMinter;
  fallbackDir: string;
  logger?: Logger;
}

export function createReconcilerWorker(
  connection: Redis,
  deps: ReconcilerDeps,
): Worker {
  const log = deps.logger ?? pino({ name: 'apogee-reconciler' });

  const { Worker } = require('bullmq') as typeof import('bullmq');

  return new Worker(
    'reconcile-pending-receipts',
    async (_job: Job) => {
      let files: string[];
      try {
        files = await readdir(deps.fallbackDir);
      } catch {
        return; // dir doesn't exist yet — nothing to reconcile
      }

      const pending = files.filter(f => f.endsWith('.json'));
      if (pending.length === 0) return;

      log.info({ count: pending.length }, 'Reconciler: processing pending receipts');

      for (const file of pending) {
        const filePath = join(deps.fallbackDir, file);
        try {
          const raw = await readFile(filePath, 'utf8');
          const row = JSON.parse(raw) as {
            receiptId: string;
            agentId: string;
            actionTag: string;
            payloadHash: string;
            storageRoot: string;
            valueWei: string;
            createdAt: string;
          };

          const ageMs = Date.now() - new Date(row.createdAt).getTime();
          if (ageMs > PENDING_WARN_MS) {
            log.warn({ receiptId: row.receiptId, ageMs }, 'Receipt pending > 10 min — retrying now');
          }

          // Re-mint: actionTag is already stored as bytes4 hex; payload from stored hash
          await deps.receiptMinter.mint({
            agentId: row.agentId,
            actionTag: row.actionTag,
            payload: { recovered: true, payloadHash: row.payloadHash, storageRoot: row.storageRoot },
            valueWei: BigInt(row.valueWei),
            clientReceiptId: row.receiptId,
          });

          await unlink(filePath);
          log.info({ receiptId: row.receiptId }, 'Reconciler: receipt resubmitted and cleared');
        } catch (err) {
          log.error({ file, err }, 'Reconciler: failed to resubmit receipt — will retry next cycle');
        }
      }
    },
    { connection, concurrency: 1 },
  );
}

export async function scheduleReconciler(queue: Queue): Promise<void> {
  await queue.add(
    'reconcile',
    {},
    {
      jobId: 'reconcile-loop',
      repeat: { every: RECONCILE_EVERY_MS },
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  );
}
