/**
 * Reconciler — retries receipts that failed on-chain submission.
 *
 * Runs every 60 s as a BullMQ repeating job.
 * Reads pending receipts from the ReceiptMinter's fallback directory,
 * re-submits each one, and emits a Pino warning when any receipt has
 * been pending for more than 10 minutes.
 *
 * File format written by ReceiptMinter.uploadWithFallback:
 *   { receiptId, createdAt?, action: { agentId, actionTag, payload, valueWei? } }
 */

import { rename, readdir, readFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';
import { Worker, type Queue, type Job } from 'bullmq';
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

          // File format: { receiptId, createdAt?, action: { agentId, actionTag, payload, valueWei? } }
          let data: { receiptId: string; createdAt?: string; action: { agentId: string; actionTag: string; payload: unknown; valueWei?: string } };
          try {
            data = JSON.parse(raw) as typeof data;
          } catch (parseErr) {
            // Unparseable (invalid JSON from old stableJson bug) — quarantine so it stops looping.
            const corrupt = filePath.replace(/\.json$/, '.corrupt.json');
            await rename(filePath, corrupt).catch(() => undefined);
            log.warn({ file, parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr) },
              'Reconciler: corrupt fallback file (invalid JSON) — quarantined to .corrupt.json; manual review needed');
            continue;
          }

          const { receiptId, action } = data;

          // Validate required fields before attempting mint.
          if (!action?.agentId || !action?.actionTag) {
            const corrupt = filePath.replace(/\.json$/, '.corrupt.json');
            await rename(filePath, corrupt).catch(() => undefined);
            log.warn({ file, receiptId, agentId: action?.agentId, actionTag: action?.actionTag },
              'Reconciler: fallback file missing agentId or actionTag — quarantined');
            continue;
          }

          // Age check: warn if pending too long.
          let createdAt = data.createdAt;
          if (!createdAt) {
            // Fall back to file mtime if createdAt not in file (old format).
            const s = await stat(filePath).catch(() => null);
            createdAt = s?.mtime.toISOString();
          }
          const ageMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
          if (ageMs > PENDING_WARN_MS) {
            log.warn({ receiptId, agentId: action.agentId, actionTag: action.actionTag, ageMinutes: Math.floor(ageMs / 60_000) },
              'Reconciler: receipt pending > 10 min — retrying now');
          }

          await deps.receiptMinter.mint({
            agentId: action.agentId,
            actionTag: action.actionTag,
            payload: action.payload,
            valueWei: action.valueWei !== undefined ? BigInt(action.valueWei) : 0n,
            clientReceiptId: receiptId,
          });

          // mint() with the billing fix will delete the fallback file after chain success.
          // Attempt unlink anyway as belt-and-suspenders (idempotent).
          await unlink(filePath).catch(() => undefined);
          log.info({ receiptId, agentId: action.agentId, actionTag: action.actionTag },
            'Reconciler: receipt resubmitted and cleared');
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errCode = (err as { code?: string }).code ?? 'UNKNOWN';
          log.error({ file, errCode, errMsg },
            'Reconciler: failed to resubmit receipt — will retry next cycle');
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
