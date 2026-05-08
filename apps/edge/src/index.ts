import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { ChainClient } from '@apogee/chain-client';
import { StorageClient } from '@apogee/storage-client';
import { createBillingStack, InMemoryQuoteStore, type BillingChainClient, type StorageBoundary } from '@apogee/billing';
import { z } from 'zod';

const quoteBodySchema = z.object({ payeeAgentId: z.string().min(1), payerAgentId: z.string().optional(), serviceId: z.string().min(1), requestedAmount: z.union([z.string(), z.number(), z.bigint()]).optional(), ttlSec: z.number().int().positive().optional() });
const settleBodySchema = z.object({ quoteHash: z.string(), payerSignature: z.string().optional(), txHash: z.string().optional(), permitSignature: z.string().optional(), clientReceiptId: z.string().optional() });
const refundBodySchema = z.object({ paymentId: z.string(), reason: z.string(), agentId: z.string().optional(), clientReceiptId: z.string().optional() });

const bigintFrom = (value: string | number | bigint | undefined): bigint | undefined => {
  if (value === undefined) return undefined;
  return typeof value === 'bigint' ? value : BigInt(value);
};

export interface EdgeServerOptions {
  chainClient: BillingChainClient;
  storageClient: StorageBoundary;
  signerKey: string;
  chainId: number;
  paymentRouterAddress: string;
  receiptBookAddress: string;
}

export function buildEdgeServer(options: EdgeServerOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });
  void app.register(websocket);

  const stack = createBillingStack({ ...options, quoteStore: new InMemoryQuoteStore() });

  app.get('/health', async () => ({ ok: true }));

  app.post('/v1/quote', async (request) => {
    const body = quoteBodySchema.parse(request.body);
    const quote = await stack.quoteIssuer.issue({ ...body, requestedAmount: bigintFrom(body.requestedAmount) });
    return { ...quote, amount: quote.amount.toString(), nonce: quote.nonce.toString() };
  });

  app.post('/v1/settle', async (request) => {
    const body = settleBodySchema.parse(request.body);
    return stack.settlementHandler.settle(body);
  });

  app.post('/v1/refund', async (request) => {
    const body = refundBodySchema.parse(request.body);
    return stack.refundManager.refund(body);
  });

  app.get('/v1/ws', { websocket: true }, (socket) => {
    const unsubscribe = stack.eventBus.subscribe('receipt', (payload) => socket.send(JSON.stringify({ event: 'receipt', payload })));
    socket.on('close', unsubscribe);
  });

  return app;
}

export async function startFromEnv(): Promise<FastifyInstance> {
  const rpcUrl = process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
  const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const storageIndexerUrl = process.env.ZERO_G_STORAGE_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';
  const paymentRouterAddress = process.env.PAYMENT_ROUTER_ADDRESS;
  const receiptBookAddress = process.env.RECEIPT_BOOK_ADDRESS;
  if (!signerKey || !paymentRouterAddress || !receiptBookAddress) throw new Error('Missing edge API environment');
  const chainClient = new ChainClient({ rpcUrl, chainId: 16602, signerKey }) as unknown as BillingChainClient;
  const storageClient = new StorageClient({ rpcUrl, indexerUrl: storageIndexerUrl, signerKey }) as StorageBoundary;
  const app = buildEdgeServer({ chainClient, storageClient, signerKey, chainId: 16602, paymentRouterAddress, receiptBookAddress });
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
  return app;
}

if (process.env.APOGEE_EDGE_AUTOSTART === '1') void startFromEnv();
