import { describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { z } from 'zod';
import { ChainClient } from '@apogee/chain-client';
import { StorageClient } from '@apogee/storage-client';
import { MemoryEngine } from './index.js';

const rpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const indexerUrl = process.env.ZERO_G_STORAGE_INDEXER_URL;
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
const run = signerKey && indexerUrl ? describe : describe.skip;

run('MemoryEngine integration', () => {
  const engine = (): MemoryEngine => {
    const storageClient = new StorageClient({ rpcUrl, indexerUrl: indexerUrl!, signerKey: signerKey!, agentId: '1' });
    const chainClient = new ChainClient({ rpcUrl, chainId: 16602, signerKey: signerKey! });
    return new MemoryEngine({ storageClient, chainClient, agentId: '1', ownerSigner: new Wallet(signerKey!, chainClient.getProvider()) });
  };

  it('sets encrypted values', async () => {
    const result = await engine().set('profile/name', 'apogee');
    expect(result.version).toBe(1);
  });

  it('gets values with schema validation', async () => {
    const instance = engine();
    await instance.set('profile/name', 'apogee');
    const value = await instance.get('profile/name', z.string());
    expect(value).toBe('apogee');
  });

  it('lists keys by prefix', async () => {
    const instance = engine();
    await instance.set('profile/name', 'apogee');
    const keys = await instance.list('profile/');
    expect(keys.some((key) => key.key === 'profile/name')).toBe(true);
  });

  it('searches semantic memory', async () => {
    const instance = engine();
    await instance.set('profile/name', 'apogee');
    const hits = await instance.search('apogee', 1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes keys', async () => {
    const instance = engine();
    await instance.set('profile/name', 'apogee');
    await instance.delete('profile/name');
    await expect(instance.get('profile/name')).resolves.toBeNull();
  });

  it('commits state to ReceiptBook', async () => {
    const instance = engine();
    await instance.set('state/value', { ok: true });
    const result = await instance.commitState();
    expect(result.txHash).toMatch(/^0x/);
  });
});
