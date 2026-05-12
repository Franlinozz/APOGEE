/**
 * One-shot 0G Storage upload smoke test.
 * Usage: pnpm -F @apogee/runtime storage:once
 *
 * Uploads a tiny JSON payload to 0G Storage and prints the rootHash + txHash.
 * Does NOT start any BullMQ workers or schedule any repeating jobs.
 *
 * Required env vars:
 *   EDGE_SERVICE_PRIVATE_KEY — signer key
 * Optional:
 *   ZERO_G_STORAGE_RPC_URL      — defaults to Aristotle mainnet https://evmrpc.0g.ai
 *   ZERO_G_STORAGE_INDEXER_URL  — defaults to https://indexer-storage-turbo.0g.ai
 */

import pino from 'pino';
import { StorageClient } from '@apogee/storage-client';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main(): Promise<void> {
  const log = pino({ name: 'storage-once' });

  const signerKey = requiredEnv('EDGE_SERVICE_PRIVATE_KEY');
  const rpcUrl = process.env['ZERO_G_STORAGE_RPC_URL'] ?? 'https://evmrpc.0g.ai';
  const indexerUrl = process.env['ZERO_G_STORAGE_INDEXER_URL'] ?? 'https://indexer-storage-turbo.0g.ai';

  log.info({ rpcUrl, indexerUrl }, 'storage:once — connecting to 0G Storage');

  const client = new StorageClient({ rpcUrl, indexerUrl, signerKey, logger: log });

  const payload = {
    test: 'apogee-storage-once',
    timestamp: new Date().toISOString(),
    network: 'aristotle-mainnet',
  };

  log.info({ payload }, 'Uploading test payload');

  try {
    const result = await client.uploadJson(payload);
    log.info({
      rootHash: result.rootHash,
      txHash: result.txHash,
      sizeBytes: result.size,
    }, '✓ Upload succeeded');
    console.log('\nSTORAGE_ROOT_HASH=' + result.rootHash);
    console.log('STORAGE_TX_HASH=' + result.txHash);
    console.log('STORAGE_NETWORK=' + rpcUrl);
  } catch (err) {
    log.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
      '✗ Upload FAILED — see error above');
    process.exit(1);
  }

  process.exit(0);
}

void main();
