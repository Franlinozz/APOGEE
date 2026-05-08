import { describe, expect, it } from 'vitest';
import { buildEdgeServer } from './index.js';
import type { BillingChainClient, StorageBoundary } from '@apogee/billing';

const address = '0x0000000000000000000000000000000000000001';
const txHash = '0x'.padEnd(66, '1');
const signerKey = `0x${'1'.repeat(64)}`;

class FakeChain implements BillingChainClient {
  contract<T>(): T {
    return { emitReceipt: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }) } as T;
  }
  async send(): Promise<{ hash: string }> { return { hash: txHash }; }
  async waitForReceipt(): Promise<{ hash: string }> { return { hash: txHash }; }
  verifyMessage(): string { return address; }
}

class FakeStorage implements StorageBoundary {
  async uploadJson(): Promise<{ rootHash: string; txHash: string; size: number }> {
    return { rootHash: '0x'.padEnd(66, '2'), txHash, size: 1 };
  }
}

describe('edge API', () => {
  it('serves health, docs, quote, settle, auth-gated agent, memory, receipt, and refund routes', async () => {
    const app = buildEdgeServer({ chainClient: new FakeChain(), storageClient: new FakeStorage(), signerKey, chainId: 16602, paymentRouterAddress: address, receiptBookAddress: address, jwtSecret: 'test-secret' });
    await app.ready();
    const token = app.jwt.sign({ address });
    const auth = { authorization: `Bearer ${token}` };

    const healthStarted = Date.now();
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(Date.now() - healthStarted).toBeLessThan(50);

    const docs = await app.inject({ method: 'GET', url: '/docs/api' });
    expect(docs.statusCode).toBe(200);

    const quote = await app.inject({ method: 'POST', url: '/v1/quote', payload: { payeeAgentId: '2', payerAgentId: '1', serviceId: 'svc', requestedAmount: '1' } });
    expect(quote.statusCode).toBe(200);
    const body = quote.json<{ quoteHash: string }>();

    const settle = await app.inject({ method: 'POST', url: '/v1/settle', payload: { quoteHash: body.quoteHash } });
    expect(settle.statusCode).toBe(200);
    expect(settle.json<{ status: string }>().status).toBe('unsigned_tx');

    const created = await app.inject({ method: 'POST', url: '/v1/agents', headers: auth, payload: { metadataRoot: 'root' } });
    expect(created.statusCode).toBe(200);
    const agent = created.json<{ id: string }>();

    const run = await app.inject({ method: 'POST', url: `/v1/agents/${agent.id}/run`, headers: auth, payload: { skillId: 'chat.completion', input: { prompt: 'hi' } } });
    expect(run.statusCode).toBe(200);

    const memory = await app.inject({ method: 'PUT', url: `/v1/memory/${agent.id}/greeting`, headers: auth, payload: { value: { text: 'hello' }, tags: ['demo'] } });
    expect(memory.statusCode).toBe(200);

    const receipts = await app.inject({ method: 'GET', url: '/v1/receipts', headers: auth });
    expect(receipts.statusCode).toBe(200);

    const refund = await app.inject({ method: 'POST', url: `/v1/refund/${body.quoteHash}`, headers: auth, payload: { reason: 'test', agentId: '1' } });
    expect(refund.statusCode).toBe(200);
    await app.close();
  });
});
