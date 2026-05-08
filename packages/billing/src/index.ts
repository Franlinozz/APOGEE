import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Interface, TypedDataEncoder, Wallet, keccak256, toUtf8Bytes, verifyTypedData, type Log, type TypedDataField } from 'ethers';
import Redis, { type Redis as RedisClient } from 'ioredis';
import pino, { type Logger } from 'pino';
import { z } from 'zod';
import { ReceiptMinter, LocalReceiptEventBus, InMemoryReceiptIndex, type MintReceiptResult, type ReceiptEventBus, type ReceiptIndex, type StorageBoundary, type ChainBoundary } from './receipt-minter.js';

export { ReceiptMinter, LocalReceiptEventBus, InMemoryReceiptIndex } from './receipt-minter.js';
export type { MintReceiptAction, MintReceiptResult, ReceiptEventBus, ReceiptIndex, ReceiptIndexRow, StorageBoundary, ChainBoundary } from './receipt-minter.js';

export interface BillingChainClient extends ChainBoundary {
  send(tx: { to: string; value?: bigint; data?: string }): Promise<{ hash: string }>;
  waitForReceipt(hash: string): Promise<{ hash: string; logs?: readonly Log[] }>;
}

export interface QuoteStore {
  set(quote: StoredQuote, ttlSec: number): Promise<void>;
  get(quoteHash: string): Promise<StoredQuote | null>;
  delete(quoteHash: string): Promise<void>;
}

export interface StoredQuote {
  quoteHash: string;
  amount: string;
  nonce: string;
  deadline: number;
  payeeReceiver: string;
  payeeAgentId: string;
  payerAgentId: string;
  serviceId: string;
  signature: string;
}

export interface StoredQuoteMessage {
  amount: bigint;
  nonce: bigint;
  deadline: number;
  payeeReceiver: string;
  quoteHash: string;
  payerAgent: bigint;
  payeeAgent: bigint;
  serviceId: string;
}

export interface QuoteIssuerOptions {
  signerKey: string;
  chainId: number;
  paymentRouterAddress: string;
  quoteStore?: QuoteStore | undefined;
  payeeResolver?: ((payeeAgentId: string, serviceId: string) => Promise<{ receiver: string; amount: bigint }> | { receiver: string; amount: bigint }) | undefined;
  logger?: Logger | undefined;
}

export interface IssueQuoteInput {
  payeeAgentId: string;
  serviceId: string;
  requestedAmount?: bigint | undefined;
  ttlSec?: number | undefined;
  payerAgentId?: string | undefined;
}

export interface IssuedQuote {
  quoteHash: string;
  amount: bigint;
  deadline: number;
  payeeReceiver: string;
  signature: string;
  nonce: bigint;
}

export interface SettlementHandlerOptions {
  chainClient: BillingChainClient;
  paymentRouterAddress: string;
  receiptMinter: ReceiptMinter;
  quoteStore: QuoteStore;
  chainId: number;
  logger?: Logger | undefined;
}

export interface SettleInput {
  quoteHash: string;
  payerSignature?: string | undefined;
  txHash?: string | undefined;
  permitSignature?: string | undefined;
  clientReceiptId?: string | undefined;
}

export interface SettlementResult {
  status: 'settled' | 'unsigned_tx';
  receipt?: MintReceiptResult | undefined;
  unsignedTx?: { to: string; value: string; data: string } | undefined;
  payment?: { payerAgentId: string; payeeAgentId: string; serviceId: string; amount: string; txHash?: string | undefined } | undefined;
}

export interface RefundManagerOptions {
  chainClient: BillingChainClient;
  paymentRouterAddress: string;
  receiptMinter: ReceiptMinter;
  logger?: Logger | undefined;
}

export interface RefundInput {
  paymentId: string;
  reason: string;
  agentId?: string | undefined;
  clientReceiptId?: string | undefined;
}

export interface Subscription {
  id: string;
  payeeAgentId: string;
  payerAgentId: string;
  serviceId: string;
  amountWei: bigint;
  everyMs: number;
  dailyCapWei?: bigint | undefined;
}

const quoteInputSchema = z.object({
  payeeAgentId: z.string().min(1),
  payerAgentId: z.string().min(1).default('0'),
  serviceId: z.string().min(1),
  requestedAmount: z.bigint().positive().optional(),
  ttlSec: z.number().int().positive().max(3600).default(120),
});
const settleSchema = z.object({ quoteHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), payerSignature: z.string().optional(), txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(), permitSignature: z.string().optional(), clientReceiptId: z.string().optional() });
const refundSchema = z.object({ paymentId: z.string().min(1), reason: z.string().min(1), agentId: z.string().optional(), clientReceiptId: z.string().optional() });

const QUOTE_TYPES = {
  Quote: [
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
    { name: 'payeeReceiver', type: 'address' },
    { name: 'payerAgent', type: 'uint256' },
    { name: 'payeeAgent', type: 'uint256' },
    { name: 'serviceId', type: 'bytes32' },
  ],
} satisfies Record<string, TypedDataField[]>;
const PAYMENT_ROUTER_ABI = [
  'event PaymentSettled(uint256 indexed payerAgent,uint256 indexed payeeAgent,bytes32 indexed serviceId,uint256 amount,uint256 txReceiptId)',
  'function pay(bytes32 quoteHash,bytes signature) payable',
  'function paySignedQuote((uint256 amount,uint256 nonce,uint64 deadline,address payeeReceiver,bytes32 quoteHash,uint256 payerAgent,uint256 payeeAgent,bytes32 serviceId) quote,bytes payeeSignature) payable',
  'function refund(bytes32 quoteHash,string reason)',
];
const routerInterface = new Interface(PAYMENT_ROUTER_ABI);

const serviceIdBytes = (serviceId: string): string => /^0x[a-fA-F0-9]{64}$/.test(serviceId) ? serviceId : keccak256(toUtf8Bytes(serviceId));
const quoteDomain = (chainId: number, verifyingContract: string) => ({ name: 'ApogeePaymentRouter', version: '1', chainId, verifyingContract });

const quoteMessage = (quote: StoredQuote): StoredQuoteMessage => ({
  amount: BigInt(quote.amount),
  nonce: BigInt(quote.nonce),
  deadline: quote.deadline,
  payeeReceiver: quote.payeeReceiver,
  quoteHash: quote.quoteHash,
  payerAgent: BigInt(quote.payerAgentId),
  payeeAgent: BigInt(quote.payeeAgentId),
  serviceId: serviceIdBytes(quote.serviceId),
});

export class BillingError extends Error {
  constructor(public readonly code: string, message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'BillingError';
  }
}

export class InMemoryQuoteStore implements QuoteStore {
  private readonly quotes = new Map<string, { quote: StoredQuote; expiresAt: number }>();

  async set(quote: StoredQuote, ttlSec: number): Promise<void> {
    this.quotes.set(quote.quoteHash, { quote, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async get(quoteHash: string): Promise<StoredQuote | null> {
    const hit = this.quotes.get(quoteHash);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.quotes.delete(quoteHash);
      return null;
    }
    return hit.quote;
  }

  async delete(quoteHash: string): Promise<void> {
    this.quotes.delete(quoteHash);
  }
}

export class RedisQuoteStore implements QuoteStore {
  constructor(private readonly redis: RedisClient) {}

  async set(quote: StoredQuote, ttlSec: number): Promise<void> {
    await this.redis.set(`quote:${quote.quoteHash}`, JSON.stringify(quote), 'EX', ttlSec);
  }

  async get(quoteHash: string): Promise<StoredQuote | null> {
    const raw = await this.redis.get(`quote:${quoteHash}`);
    return raw ? JSON.parse(raw) as StoredQuote : null;
  }

  async delete(quoteHash: string): Promise<void> {
    await this.redis.del(`quote:${quoteHash}`);
  }
}

export class QuoteIssuer {
  private readonly signer: Wallet;
  private readonly store: QuoteStore;
  private readonly logger: Logger;

  constructor(private readonly options: QuoteIssuerOptions) {
    this.signer = new Wallet(options.signerKey);
    this.store = options.quoteStore ?? new InMemoryQuoteStore();
    this.logger = options.logger ?? pino({ name: 'apogee-quote-issuer' });
  }

  get quoteStore(): QuoteStore {
    return this.store;
  }

  async issue(input: IssueQuoteInput): Promise<IssuedQuote> {
    const parsed = quoteInputSchema.parse(input);
    const resolved = await this.resolvePayee(parsed.payeeAgentId, parsed.serviceId, parsed.requestedAmount);
    const deadline = Math.floor(Date.now() / 1000) + parsed.ttlSec;
    const nonce = BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
    const unsignedMessage = { amount: resolved.amount, nonce, deadline, payeeReceiver: resolved.receiver, payerAgent: BigInt(parsed.payerAgentId), payeeAgent: BigInt(parsed.payeeAgentId), serviceId: serviceIdBytes(parsed.serviceId) };
    const quoteHash = TypedDataEncoder.hash(quoteDomain(this.options.chainId, this.options.paymentRouterAddress), QUOTE_TYPES, unsignedMessage);
    const signature = await this.signer.signTypedData(quoteDomain(this.options.chainId, this.options.paymentRouterAddress), QUOTE_TYPES, unsignedMessage);
    await this.store.set({ quoteHash, amount: resolved.amount.toString(), nonce: nonce.toString(), deadline, payeeReceiver: resolved.receiver, payeeAgentId: parsed.payeeAgentId, payerAgentId: parsed.payerAgentId, serviceId: parsed.serviceId, signature }, parsed.ttlSec);
    this.logger.info({ quoteHash, serviceId: parsed.serviceId }, 'issued billing quote');
    return { quoteHash, amount: resolved.amount, deadline, payeeReceiver: resolved.receiver, signature, nonce };
  }

  private async resolvePayee(payeeAgentId: string, serviceId: string, requestedAmount?: bigint | undefined): Promise<{ receiver: string; amount: bigint }> {
    if (this.options.payeeResolver) {
      const resolved = await this.options.payeeResolver(payeeAgentId, serviceId);
      return { receiver: resolved.receiver, amount: requestedAmount ?? resolved.amount };
    }
    return { receiver: this.signer.address, amount: requestedAmount ?? 0n };
  }
}

export class SettlementHandler {
  private readonly logger: Logger;

  constructor(private readonly options: SettlementHandlerOptions) {
    this.logger = options.logger ?? pino({ name: 'apogee-settlement' });
  }

  async settle(input: SettleInput): Promise<SettlementResult> {
    const parsed = settleSchema.parse(input);
    const quote = await this.options.quoteStore.get(parsed.quoteHash);
    if (!quote) throw new BillingError('QUOTE_MISSING', 'Quote is missing or expired');
    if (quote.deadline <= Math.floor(Date.now() / 1000)) throw new BillingError('QUOTE_EXPIRED', 'Quote is expired');
    if (parsed.payerSignature) this.verifyPayerSignature(quote, parsed.payerSignature);

    let txHash = parsed.txHash;
    if (txHash) {
      const chainReceipt = await this.options.chainClient.waitForReceipt(txHash);
      this.decodeSettlement(chainReceipt.logs ?? []);
    } else if (parsed.permitSignature) {
      const data = routerInterface.encodeFunctionData('paySignedQuote', [quoteMessage(quote), quote.signature]);
      const receipt = await this.options.chainClient.send({ to: this.options.paymentRouterAddress, value: BigInt(quote.amount), data });
      txHash = receipt.hash;
    } else {
      const iface = routerInterface;
      return { status: 'unsigned_tx', unsignedTx: { to: this.options.paymentRouterAddress, value: quote.amount, data: iface.encodeFunctionData('paySignedQuote', [quoteMessage(quote), quote.signature]) } };
    }

    const receipt = await this.options.receiptMinter.mint({ agentId: quote.payerAgentId, actionTag: 'PAYM', payload: { quoteHash: parsed.quoteHash, payerAgentId: quote.payerAgentId, payeeAgentId: quote.payeeAgentId, serviceId: quote.serviceId, txHash }, valueWei: BigInt(quote.amount), clientReceiptId: parsed.clientReceiptId ?? `pay:${parsed.quoteHash}` });
    await this.options.quoteStore.delete(parsed.quoteHash);
    this.logger.info({ quoteHash: parsed.quoteHash, txHash }, 'settled billing quote');
    return { status: 'settled', receipt, payment: { payerAgentId: quote.payerAgentId, payeeAgentId: quote.payeeAgentId, serviceId: quote.serviceId, amount: quote.amount, txHash } };
  }

  private verifyPayerSignature(quote: StoredQuote, signature: string): void {
    const { quoteHash: _quoteHash, ...message } = quoteMessage(quote);
    const signer = verifyTypedData(quoteDomain(this.options.chainId, this.options.paymentRouterAddress), QUOTE_TYPES, message, signature);
    if (!signer) throw new BillingError('INVALID_PAYER_SIGNATURE', 'Payer signature is invalid');
  }

  private decodeSettlement(logs: readonly Log[]): void {
    const settled = logs.some((log) => {
      try {
        return routerInterface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'PaymentSettled';
      } catch {
        return false;
      }
    });
    if (!settled) throw new BillingError('PAYMENT_EVENT_MISSING', 'Confirmed transaction did not emit PaymentSettled');
  }
}

export class RefundManager {
  constructor(private readonly options: RefundManagerOptions) {}

  async refund(input: RefundInput): Promise<MintReceiptResult> {
    const parsed = refundSchema.parse(input);
    const data = routerInterface.encodeFunctionData('refund', [parsed.paymentId, parsed.reason]);
    const receipt = await this.options.chainClient.send({ to: this.options.paymentRouterAddress, data });
    return this.options.receiptMinter.mint({ agentId: parsed.agentId ?? '0', actionTag: 'REFU', payload: { paymentId: parsed.paymentId, reason: parsed.reason, txHash: receipt.hash }, clientReceiptId: parsed.clientReceiptId ?? `refund:${parsed.paymentId}` });
  }
}

export class SubscriptionScheduler {
  private readonly queue: Queue<Subscription>;

  constructor(
    private readonly issuer: QuoteIssuer,
    private readonly settlement: SettlementHandler,
    connection: RedisClient,
    private readonly logger: Logger = pino({ name: 'apogee-subscriptions' }),
  ) {
    this.queue = new Queue<Subscription>('subscriptions', { connection });
  }

  async add(subscription: Subscription): Promise<void> {
    const options: JobsOptions = { jobId: subscription.id, repeat: { every: subscription.everyMs } };
    await this.queue.add(subscription.id, subscription, options);
  }

  worker(connection: RedisClient): Worker<Subscription> {
    return new Worker<Subscription>('subscriptions', async (job) => {
      const sub = job.data;
      if (sub.dailyCapWei !== undefined && sub.amountWei > sub.dailyCapWei) throw new BillingError('DAILY_CAP_EXCEEDED', 'Subscription would exceed daily policy cap');
      const quote = await this.issuer.issue({ payeeAgentId: sub.payeeAgentId, payerAgentId: sub.payerAgentId, serviceId: sub.serviceId, requestedAmount: sub.amountWei });
      await this.settlement.settle({ quoteHash: quote.quoteHash, permitSignature: quote.signature });
      this.logger.info({ subscriptionId: sub.id }, 'subscription settled');
    }, { connection });
  }
}

export function createBillingStack(options: {
  signerKey: string;
  chainId: number;
  paymentRouterAddress: string;
  receiptBookAddress: string;
  chainClient: BillingChainClient;
  storageClient: StorageBoundary;
  quoteStore?: QuoteStore | undefined;
  receiptIndex?: ReceiptIndex | undefined;
  eventBus?: ReceiptEventBus | undefined;
}): { quoteIssuer: QuoteIssuer; settlementHandler: SettlementHandler; refundManager: RefundManager; receiptMinter: ReceiptMinter; eventBus: ReceiptEventBus } {
  const eventBus = options.eventBus ?? new LocalReceiptEventBus();
  const receiptMinter = new ReceiptMinter({ storageClient: options.storageClient, chainClient: options.chainClient, receiptBookAddress: options.receiptBookAddress, index: options.receiptIndex, eventBus });
  const quoteIssuer = new QuoteIssuer({ signerKey: options.signerKey, chainId: options.chainId, paymentRouterAddress: options.paymentRouterAddress, quoteStore: options.quoteStore });
  const settlementHandler = new SettlementHandler({ chainClient: options.chainClient, paymentRouterAddress: options.paymentRouterAddress, receiptMinter, quoteStore: quoteIssuer.quoteStore, chainId: options.chainId });
  const refundManager = new RefundManager({ chainClient: options.chainClient, paymentRouterAddress: options.paymentRouterAddress, receiptMinter });
  return { quoteIssuer, settlementHandler, refundManager, receiptMinter, eventBus };
}
