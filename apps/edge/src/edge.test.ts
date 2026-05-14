import { describe, expect, it } from 'vitest';
import { buildEdgeServer } from './index.js';
import type { BillingChainClient, StorageBoundary } from '@apogee/billing';

const address = '0x0000000000000000000000000000000000000001';
const txHash = '0x'.padEnd(66, '1');
const signerKey = `0x${'1'.repeat(64)}`;

class FakeChain implements BillingChainClient {
  contract<T>(): T {
    return {
      emitReceipt: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }),
      nextTokenId: async () => 7n,
      predict: async () => '0x0000000000000000000000000000000000000007',
      createAccount: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }),
      mint: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }),
      setAgentAccount: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }),
    } as T;
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
    expect(Date.now() - healthStarted).toBeLessThan(200);

    const stats = await app.inject({ method: 'GET', url: '/v1/stats' });
    expect(stats.statusCode).toBe(200);
    expect(stats.json<{ receipts: number; agents: number; totalFlowedWei: string; totalReceipts: number }>().receipts).toBe(0);

    const docs = await app.inject({ method: 'GET', url: '/docs/api' });
    expect(docs.statusCode).toBe(200);

    const created = await app.inject({ method: 'POST', url: '/v1/agents', headers: auth, payload: { metadataRoot: 'root' } });
    expect(created.statusCode).toBe(200);
    const agent = created.json<{ id: string }>();

    const service = await app.inject({ method: 'POST', url: '/v1/services', headers: auth, payload: { agentId: agent.id, serviceId: 'svc', priceWei: '1', tags: ['demo'] } });
    expect(service.statusCode).toBe(200);

    const quote = await app.inject({ method: 'POST', url: '/v1/quote', payload: { payeeAgentId: agent.id, payerAgentId: agent.id, serviceId: 'svc' } });
    expect(quote.statusCode).toBe(402);
    const body = quote.json<{ quoteHash: string }>();

    const settle = await app.inject({ method: 'POST', url: '/v1/settle', payload: { quoteHash: body.quoteHash } });
    expect(settle.statusCode).toBe(200);
    expect(settle.json<{ status: string }>().status).toBe('unsigned_tx');

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

  it('enforces owner scope on agent subresources', async () => {
    const app = buildEdgeServer({ chainClient: new FakeChain(), storageClient: new FakeStorage(), signerKey, chainId: 16602, paymentRouterAddress: address, receiptBookAddress: address, jwtSecret: 'test-secret' });
    await app.ready();
    const ownerAuth = { authorization: `Bearer ${app.jwt.sign({ address })}` };
    const otherAuth = { authorization: `Bearer ${app.jwt.sign({ address: '0x0000000000000000000000000000000000000002' })}` };
    const created = await app.inject({ method: 'POST', url: '/v1/agents', headers: ownerAuth, payload: {} });
    const agent = created.json<{ id: string }>();

    const read = await app.inject({ method: 'GET', url: `/v1/agents/${agent.id}`, headers: otherAuth });
    expect(read.statusCode).toBe(403);
    const hideOther = await app.inject({ method: 'POST', url: `/v1/agents/${agent.id}/hide`, headers: otherAuth });
    expect(hideOther.statusCode).toBe(403);
    const hideOwner = await app.inject({ method: 'POST', url: `/v1/agents/${agent.id}/hide`, headers: ownerAuth });
    expect(hideOwner.statusCode).toBe(200);
    const defaultList = await app.inject({ method: 'GET', url: '/v1/agents', headers: ownerAuth });
    expect(defaultList.json<unknown[]>()).toHaveLength(0);
    const hiddenList = await app.inject({ method: 'GET', url: '/v1/agents?includeHidden=true', headers: ownerAuth });
    expect(hiddenList.json<Array<{ hidden?: boolean }>>()[0]?.hidden).toBe(true);
    const hiddenDirect = await app.inject({ method: 'GET', url: `/v1/agents/${agent.id}`, headers: ownerAuth });
    expect(hiddenDirect.statusCode).toBe(404);
    const hiddenDirectIncluded = await app.inject({ method: 'GET', url: `/v1/agents/${agent.id}?includeHidden=true`, headers: ownerAuth });
    expect(hiddenDirectIncluded.json<{ hidden?: boolean }>().hidden).toBe(true);
    const unhideOwner = await app.inject({ method: 'POST', url: `/v1/agents/${agent.id}/unhide`, headers: ownerAuth });
    expect(unhideOwner.statusCode).toBe(200);
    const memory = await app.inject({ method: 'PUT', url: `/v1/memory/${agent.id}/private`, headers: otherAuth, payload: { value: 'nope', tags: [] } });
    expect(memory.statusCode).toBe(403);
    await app.close();
  });

  it('provisions agents through factory, iNFT mint, and payment router mapping when contract env is provided', async () => {
    const app = buildEdgeServer({ chainClient: new FakeChain(), storageClient: new FakeStorage(), signerKey, chainId: 16602, paymentRouterAddress: address, receiptBookAddress: address, accountFactoryAddress: address, agentIdentityAddress: address, jwtSecret: 'test-secret' });
    await app.ready();
    const auth = { authorization: `Bearer ${app.jwt.sign({ address })}` };
    const created = await app.inject({ method: 'POST', url: '/v1/agents', headers: auth, payload: { metadataRoot: 'root' } });
    expect(created.statusCode).toBe(200);
    const agent = created.json<{ id: string; accountAddress: string; metadataRoot: string }>();
    expect(agent.id).toBe('7');
    expect(agent.accountAddress).toBe('0x0000000000000000000000000000000000000007');
    expect(agent.metadataRoot).toMatch(/^0x[a-f0-9]{64}$/);
    await app.close();
  });
});
