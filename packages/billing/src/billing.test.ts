import { describe, expect, it } from 'vitest';
import { Interface, Wallet, type Log } from 'ethers';
import { InMemoryQuoteStore, QuoteIssuer, ReceiptMinter, SettlementHandler, RefundManager, LocalReceiptEventBus, type BillingChainClient, type StorageBoundary } from './index.js';

const address = '0x0000000000000000000000000000000000000001';
const txHash = '0x'.padEnd(66, '1');
const routerInterface = new Interface(['event PaymentSettled(uint256 indexed payerAgent,uint256 indexed payeeAgent,bytes32 indexed serviceId,uint256 amount,uint256 txReceiptId)']);
const paymentEvent = routerInterface.getEvent('PaymentSettled');
if (!paymentEvent) throw new Error('missing PaymentSettled ABI');
const paymentLog = routerInterface.encodeEventLog(paymentEvent, [1n, 2n, '0x'.padEnd(66, '4'), 1n, 1n]);

class FakeChain implements BillingChainClient {
  public sent = 0;
  contract<T>(): T {
    return {
      emitReceipt: async () => ({ hash: txHash, wait: async () => ({ hash: txHash }) }),
    } as T;
  }
  async send(): Promise<{ hash: string } & Record<string, unknown>> {
    this.sent += 1;
    return { hash: txHash };
  }
  async waitForReceipt(): Promise<{ hash: string; logs: Log[] }> {
    return { hash: txHash, logs: [{ topics: paymentLog.topics, data: paymentLog.data } as unknown as Log] };
  }
}

class FakeStorage implements StorageBoundary {
  async uploadJson(): Promise<{ rootHash: string; txHash: string; size: number }> {
    return { rootHash: '0x'.padEnd(66, '2'), txHash, size: 1 };
  }
}

describe('billing prompt 4', () => {
  it('issues signed quotes and stores them with TTL', async () => {
    const store = new InMemoryQuoteStore();
    const issuer = new QuoteIssuer({ signerKey: Wallet.createRandom().privateKey, chainId: 16602, paymentRouterAddress: address, quoteStore: store });
    const quote = await issuer.issue({ payeeAgentId: '2', payerAgentId: '1', serviceId: 'chat.completion', requestedAmount: 10n });
    expect(quote.amount).toBe(10n);
    await expect(store.get(quote.quoteHash)).resolves.toMatchObject({ quoteHash: quote.quoteHash });
  });

  it('returns unsigned tx when no txHash or permit is provided', async () => {
    const store = new InMemoryQuoteStore();
    const issuer = new QuoteIssuer({ signerKey: Wallet.createRandom().privateKey, chainId: 16602, paymentRouterAddress: address, quoteStore: store });
    const quote = await issuer.issue({ payeeAgentId: '2', payerAgentId: '1', serviceId: 'svc', requestedAmount: 1n });
    const minter = new ReceiptMinter({ storageClient: new FakeStorage(), chainClient: new FakeChain(), receiptBookAddress: address });
    const settlement = new SettlementHandler({ chainClient: new FakeChain(), paymentRouterAddress: address, receiptMinter: minter, quoteStore: store, chainId: 16602 });
    await expect(settlement.settle({ quoteHash: quote.quoteHash })).resolves.toMatchObject({ status: 'unsigned_tx' });
  });

  it('mints receipt after txHash settlement', async () => {
    const store = new InMemoryQuoteStore();
    const issuer = new QuoteIssuer({ signerKey: Wallet.createRandom().privateKey, chainId: 16602, paymentRouterAddress: address, quoteStore: store });
    const quote = await issuer.issue({ payeeAgentId: '2', payerAgentId: '1', serviceId: 'svc', requestedAmount: 1n });
    const minter = new ReceiptMinter({ storageClient: new FakeStorage(), chainClient: new FakeChain(), receiptBookAddress: address });
    const settlement = new SettlementHandler({ chainClient: new FakeChain(), paymentRouterAddress: address, receiptMinter: minter, quoteStore: store, chainId: 16602 });
    await expect(settlement.settle({ quoteHash: quote.quoteHash, txHash })).resolves.toMatchObject({ status: 'settled' });
  });

  it('falls back to local pending receipts after storage failures', async () => {
    const storage = { uploadJson: async () => { throw new Error('offline'); } } satisfies StorageBoundary;
    const minter = new ReceiptMinter({ storageClient: storage, chainClient: new FakeChain(), receiptBookAddress: address, fallbackDir: '.tmp-test-receipts' });
    await expect(minter.mint({ agentId: '1', actionTag: 'TEST', payload: { ok: true } })).resolves.toMatchObject({ status: 'pending' });
  });

  it('publishes receipt events', async () => {
    const bus = new LocalReceiptEventBus();
    let seen = false;
    bus.subscribe('receipt', () => { seen = true; });
    const minter = new ReceiptMinter({ storageClient: new FakeStorage(), chainClient: new FakeChain(), receiptBookAddress: address, eventBus: bus });
    await minter.mint({ agentId: '1', actionTag: 'TEST', payload: { ok: true } });
    expect(seen).toBe(true);
  });

  it('refund manager calls router and mints refund receipt', async () => {
    const chain = new FakeChain();
    const minter = new ReceiptMinter({ storageClient: new FakeStorage(), chainClient: chain, receiptBookAddress: address });
    const refund = new RefundManager({ chainClient: chain, paymentRouterAddress: address, receiptMinter: minter });
    await expect(refund.refund({ paymentId: '0x'.padEnd(66, '3'), reason: 'test', agentId: '1' })).resolves.toMatchObject({ status: 'minted' });
    expect(chain.sent).toBe(1);
  });
});
