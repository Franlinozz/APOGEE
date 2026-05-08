import { describe, expect, it } from 'vitest';
import { ChainClient } from './index.js';

const rpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
const run = signerKey ? describe : describe.skip;

run('ChainClient integration', () => {
  const client = (): ChainClient => new ChainClient({ rpcUrl, chainId: 16602, signerKey: signerKey! });

  it('returns a reused JsonRpcProvider', () => {
    const instance = client();
    expect(instance.getProvider()).toBe(instance.getProvider());
  });

  it('returns a connected signer', async () => {
    await expect(client().getSigner().getAddress()).resolves.toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('creates typed contract handles', () => {
    const contract = client().contract('0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53', ['function nextReceiptId() view returns (uint256)']);
    expect(contract.target).toBe('0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53');
  });

  it('waits for an existing receipt', async () => {
    const receipt = await client().waitForReceipt('0x0670c6f451720ee080c67127fdbf20f7d7e1759b247d1b99cd085b6f102556b9');
    expect(receipt.blockNumber).toBeGreaterThan(0);
  });

  it('sends a zero-value self transaction', async () => {
    const instance = client();
    const address = await instance.getSigner().getAddress();
    const receipt = await instance.send({ to: address, value: 0n });
    expect(receipt.hash).toMatch(/^0x/);
  });

  it('batches sequential transactions', async () => {
    const instance = client();
    const address = await instance.getSigner().getAddress();
    const receipts = await instance.batch([{ to: address, value: 0n }]);
    expect(receipts).toHaveLength(1);
  });
});
