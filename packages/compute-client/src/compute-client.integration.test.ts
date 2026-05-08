import { describe, expect, it } from 'vitest';
import { parseEther } from 'ethers';
import { ComputeClient } from './index.js';

const rpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
const provider = process.env.ZERO_G_COMPUTE_PROVIDER as `0x${string}` | undefined;
const run = signerKey && provider ? describe : describe.skip;

run('ComputeClient integration', () => {
  const client = (): ComputeClient => new ComputeClient({ rpcUrl, signerKey: signerKey!, defaultProvider: provider, sealedMode: false });

  it('lists providers from 0G testnet', async () => {
    const providers = await client().listProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('ensures provider acknowledgement', async () => {
    await expect(client().ensureProvider(provider!)).resolves.toBeUndefined();
  });

  it('reads ledger balances', async () => {
    const balance = await client().balance();
    expect(typeof balance.user).toBe('bigint');
    expect(typeof balance.sub).toBe('bigint');
  });

  it('deposits a tiny amount into compute ledger', async () => {
    const receipt = await client().deposit(parseEther('0.000000000000000001'));
    expect(receipt.confirmed).toBe(true);
  });

  it('refunds a tiny amount from compute ledger', async () => {
    const receipt = await client().refund(parseEther('0.000000000000000001'));
    expect(receipt.operation).toBe('refund');
  });

  it('withdraws provider sub-account funds', async () => {
    const receipt = await client().withdraw(1n);
    expect(receipt.operation).toBe('withdraw');
  });
});
