import { describe, expect, it } from 'vitest';
import { Wallet, TypedDataEncoder } from 'ethers';
import { buildDeployAuthorizationTypedData } from '@apogee/core';
import { buildEdgeServer, buildReceiptHeatmapCells, skillInvokeBootstrapComplete, skillInvokeCanRunAfterBootstrap } from './index.js';
import type { BillingChainClient, ReceiptIndexRow, StorageBoundary } from '@apogee/billing';

const address = '0x0000000000000000000000000000000000000001';
const txHash = '0x'.padEnd(66, '1');
const signerKey = `0x${'1'.repeat(64)}`;

class FakeChain implements BillingChainClient {
  contract<T>(): T {
    return {
      emitReceipt: async () => ({ hash: txHash, wait: async () => ({ hash: txHash, status: 1 }) }),
      nextTokenId: async () => 7n,
      predict: async () => '0x0000000000000000000000000000000000000007',
      createAccount: async () => ({ hash: txHash, wait: async () => ({ hash: txHash, status: 1 }) }),
      mint: async () => ({ hash: txHash, wait: async () => ({ hash: txHash, status: 1 }) }),
      setAgentAccount: async () => ({ hash: txHash, wait: async () => ({ hash: txHash, status: 1 }) }),
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
  it('allows initialized agents when persistent onboarding is complete even if in-memory skills are empty', () => {
    const bootstrapComplete = skillInvokeBootstrapComplete(
      { status: 'complete' },
      ['text.summarize'],
      new Set<string>(),
    );

    expect(bootstrapComplete).toBe(true);
    expect(skillInvokeCanRunAfterBootstrap('initialized', bootstrapComplete)).toBe(true);
  });

  it('keeps the legacy installed-skills fallback when onboarding is missing', () => {
    const bootstrapComplete = skillInvokeBootstrapComplete(
      undefined,
      ['text.summarize'],
      new Set(['text.summarize']),
    );

    expect(bootstrapComplete).toBe(true);
    expect(skillInvokeCanRunAfterBootstrap('initialized', bootstrapComplete)).toBe(true);
  });

  it('allows agents whose persistent deployment is already active after Edge restart', () => {
    expect(skillInvokeCanRunAfterBootstrap('activating', false, 'active')).toBe(true);
  });

  it('buckets receipt heatmap by UTC calendar day and hour', () => {
    const now = Date.parse('2026-05-22T10:30:00.000Z');
    const rows: ReceiptIndexRow[] = [
      { receiptId: 'r1', agentId: '1', actionTag: 'text.summarize', payloadHash: '0x1', storageRoot: '0x2', valueWei: '0', txHash, status: 'minted', createdAt: '2026-05-21T23:15:00.000Z' },
      { receiptId: 'r2', agentId: '1', actionTag: 'text.summarize', payloadHash: '0x3', storageRoot: '0x4', valueWei: '0', txHash, status: 'minted', createdAt: '2026-05-22T09:00:00.000Z' },
      { receiptId: 'r3', agentId: '1', actionTag: 'text.summarize', payloadHash: '0x5', storageRoot: '0x6', valueWei: '0', txHash, status: 'minted', createdAt: '2026-05-15T23:59:00.000Z' },
    ];

    expect(buildReceiptHeatmapCells(rows, 7, now)).toEqual([
      { day: 5, hour: 23, count: 1 },
      { day: 6, hour: 9, count: 1 },
    ]);
  });

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

  it('requires EIP-712 wallet authorization for the authorized deploy endpoint', async () => {
    const wallet = Wallet.createRandom();
    const owner = wallet.address as `0x${string}`;
    const app = buildEdgeServer({ chainClient: new FakeChain(), storageClient: new FakeStorage(), signerKey, chainId: 16661, paymentRouterAddress: address, receiptBookAddress: address, accountFactoryAddress: address, agentIdentityAddress: address, jwtSecret: 'test-secret' });
    await app.ready();
    const auth = { authorization: `Bearer ${app.jwt.sign({ address: owner })}` };

    const nonceRes = await app.inject({ method: 'GET', url: '/v1/auth/deploy-nonce', headers: auth });
    expect(nonceRes.statusCode).toBe(200);
    const nonce = nonceRes.json<{ owner: string; nonce: string; deadline: number; chainId: number }>();
    const form = { name: 'Signed Agent', description: 'Wallet-authorized deployment', skills: ['memory.write'], policy: { allowedSkills: ['memory.write'], allowedActions: ['memory.write'] } };
    const typedData = buildDeployAuthorizationTypedData({ owner, ...form, nonce: nonce.nonce, deadline: nonce.deadline });
    const signature = await wallet.signTypedData(typedData.domain, typedData.types, typedData.message);
    const digest = TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message);

    const created = await app.inject({ method: 'POST', url: '/v1/agents/deploy-authorized', headers: auth, payload: { form, authorization: { owner, nonce: nonce.nonce, deadline: nonce.deadline, signature } } });
    expect(created.statusCode).toBe(200);
    const agent = created.json<{ id: string; authorizationProof?: { digest: string; signer: string }; deployment?: { authorizationProof?: { digest: string } } }>();
    expect(agent.authorizationProof?.digest ?? agent.deployment?.authorizationProof?.digest).toBe(digest);
    expect(agent.authorizationProof?.signer.toLowerCase()).toBe(owner.toLowerCase());

    const replay = await app.inject({ method: 'POST', url: '/v1/agents/deploy-authorized', headers: auth, payload: { form, authorization: { owner, nonce: nonce.nonce, deadline: nonce.deadline, signature } } });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ id: string }>().id).toBe(agent.id);
    await app.close();
  });
});
