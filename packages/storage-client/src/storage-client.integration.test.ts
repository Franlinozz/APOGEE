import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StorageClient } from './index.js';

const rpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const indexerUrl = process.env.ZERO_G_STORAGE_INDEXER_URL;
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
const run = signerKey && indexerUrl ? describe : describe.skip;

run('StorageClient integration', () => {
  const client = (): StorageClient => new StorageClient({ rpcUrl, indexerUrl: indexerUrl!, signerKey: signerKey!, agentId: '1' });
  let rootHash = '';
  let jsonRoot = '';

  it('uploads bytes to 0G storage', async () => {
    const result = await client().uploadBytes(new TextEncoder().encode('apogee-storage-test'));
    rootHash = result.rootHash;
    expect(result.txHash).toMatch(/^0x/);
  });

  it('checks local cache presence', () => {
    expect(client().existsLocally(rootHash)).toBe(false);
  });

  it('downloads verified bytes', async () => {
    const bytes = await client().downloadBytes(rootHash);
    expect(new TextDecoder().decode(bytes)).toContain('apogee');
  });

  it('uploads JSON values', async () => {
    const result = await client().uploadJson({ ok: true, name: 'apogee' });
    jsonRoot = result.rootHash;
    expect(result.size).toBeGreaterThan(0);
  });

  it('downloads and validates JSON values', async () => {
    const value = await client().downloadJson(jsonRoot, z.object({ ok: z.boolean(), name: z.string() }));
    expect(value.ok).toBe(true);
  });

  it('uploads encrypted bytes', async () => {
    const instance = client();
    const result = await instance.uploadBytes(new TextEncoder().encode('secret'), { encrypt: true, agentPubKey: '1' });
    expect(instance.existsLocally(result.rootHash)).toBe(true);
  });
});
