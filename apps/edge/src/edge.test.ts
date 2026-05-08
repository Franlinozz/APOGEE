import { describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { buildEdgeServer } from './index.js';
import type { BillingChainClient, StorageBoundary } from '@apogee/billing';

const address = '0x0000000000000000000000000000000000000001';
const txHash = '0x'.padEnd(66, '1');

class FakeChain implements BillingChainClient {
  contract<T>(): T {
    return { emitReceipt: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }) } as T;
  }
  async send(): Promise<{ hash: string }> { return { hash: txHash }; }
  async waitForReceipt(): Promise<{ hash: string }> { return { hash: txHash }; }
}

class FakeStorage implements StorageBoundary {
  async uploadJson(): Promise<{ rootHash: string; txHash: string; size: number }> {
    return { rootHash: '0x'.padEnd(66, '2'), txHash, size: 1 };
  }
}

describe('edge API', () => {
  it('serves health, quote, settle, and refund routes', async () => {
    const app = buildEdgeServer({ chainClient: new FakeChain(), storageClient: new FakeStorage(), signerKey: Wallet.createRandom().privateKey, chainId: 16602, paymentRouterAddress: address, receiptBookAddress: address });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const quote = await app.inject({ method: 'POST', url: '/v1/quote', payload: { payeeAgentId: '2', payerAgentId: '1', serviceId: 'svc', requestedAmount: '1' } });
    expect(quote.statusCode).toBe(200);
    const body = quote.json<{ quoteHash: string }>();

    const settle = await app.inject({ method: 'POST', url: '/v1/settle', payload: { quoteHash: body.quoteHash } });
    expect(settle.statusCode).toBe(200);
    expect(settle.json<{ status: string }>().status).toBe('unsigned_tx');

    const refund = await app.inject({ method: 'POST', url: '/v1/refund', payload: { paymentId: body.quoteHash, reason: 'test', agentId: '1' } });
    expect(refund.statusCode).toBe(200);
    await app.close();
  });
});
