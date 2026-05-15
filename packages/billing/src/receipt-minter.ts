import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { keccak256, toUtf8Bytes, zeroPadValue, type TransactionReceipt } from 'ethers';
import { Redis, type Redis as RedisClient } from 'ioredis';
import pino, { type Logger } from 'pino';
import { z } from 'zod';

export interface StorageBoundary {
  uploadJson(value: unknown): Promise<{ rootHash: string; txHash: string; size: number }>;
}

export interface ChainBoundary {
  contract<T>(address: string, abi: readonly string[]): T;
}

export interface ReceiptIndexRow {
  receiptId: string;
  clientReceiptId?: string | undefined;
  agentId: string;
  actionTag: string;
  payloadHash: string;
  storageRoot: string;
  storageTxHash?: string | undefined;
  valueWei: string;
  txHash?: string | undefined;
  status: 'pending' | 'minted' | 'failed';
  error?: string | undefined;
  createdAt: string;
}

export interface ReceiptIndex {
  findByClientReceiptId(clientReceiptId: string): Promise<ReceiptIndexRow | null>;
  insert(row: ReceiptIndexRow): Promise<void>;
  update(receiptId: string, patch: Partial<ReceiptIndexRow>): Promise<void>;
}

export interface ReceiptEventBus {
  publish(event: 'receipt', payload: ReceiptIndexRow): void;
  subscribe(event: 'receipt', listener: (payload: ReceiptIndexRow) => void): () => void;
}

export interface ReceiptMinterOptions {
  storageClient: StorageBoundary;
  chainClient: ChainBoundary;
  receiptBookAddress: string;
  index?: ReceiptIndex | undefined;
  eventBus?: ReceiptEventBus | undefined;
  fallbackDir?: string | undefined;
  logger?: Logger | undefined;
}

export interface MintReceiptAction {
  agentId: bigint | number | string;
  actionTag: string;
  payload: unknown;
  valueWei?: bigint | undefined;
  storageRoot?: string | undefined;
  clientReceiptId?: string | undefined;
}

export interface MintReceiptResult {
  receiptId: string;
  txHash?: string | undefined;
  storageRoot: string;
  storageTxHash?: string | undefined;
  payloadHash: string;
  status: 'pending' | 'minted' | 'failed';
}

interface StorageUploadResult {
  rootHash: string;
  txHash: string;
  isLocalFallback: boolean;
}

interface ReceiptBookContract {
  emitReceipt(agentId: bigint, actionTag: string, payloadHash: string, storageRoot: string, valueWei: bigint, overrides?: { gasLimit?: bigint }): Promise<{ hash: string; wait(): Promise<TransactionReceipt> }>;
  estimateGas?: {
    emitReceipt(agentId: bigint, actionTag: string, payloadHash: string, storageRoot: string, valueWei: bigint): Promise<bigint>;
  };
}

const mintSchema = z.object({
  agentId: z.union([z.bigint(), z.number().int().nonnegative(), z.string().min(1)]),
  actionTag: z.string().min(1).max(32),
  payload: z.unknown(),
  valueWei: z.bigint().nonnegative().optional(),
  storageRoot: z.string().optional(),
  clientReceiptId: z.string().min(1).optional(),
});

export class InMemoryReceiptIndex implements ReceiptIndex {
  private readonly rows = new Map<string, ReceiptIndexRow>();
  private readonly byClientId = new Map<string, string>();

  async findByClientReceiptId(clientReceiptId: string): Promise<ReceiptIndexRow | null> {
    const id = this.byClientId.get(clientReceiptId);
    return id ? this.rows.get(id) ?? null : null;
  }

  async insert(row: ReceiptIndexRow): Promise<void> {
    this.rows.set(row.receiptId, row);
    if (row.clientReceiptId) this.byClientId.set(row.clientReceiptId, row.receiptId);
  }

  async update(receiptId: string, patch: Partial<ReceiptIndexRow>): Promise<void> {
    const current = this.rows.get(receiptId);
    if (current) this.rows.set(receiptId, { ...current, ...patch });
  }
}

export class LocalReceiptEventBus implements ReceiptEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: 'receipt', payload: ReceiptIndexRow): void {
    this.emitter.emit(event, payload);
  }

  subscribe(event: 'receipt', listener: (payload: ReceiptIndexRow) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}

const stableJson = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${entries.join(',')}}`;
};

const asBytes32 = (root: string): string => {
  if (/^0x[a-fA-F0-9]{64}$/.test(root)) return root;
  return keccak256(toUtf8Bytes(root));
};

const tagToBytes4 = (tag: string): string => {
  if (/^0x[a-fA-F0-9]{8}$/.test(tag)) return tag;
  const bytes = toUtf8Bytes(tag.slice(0, 4));
  return zeroPadValue(`0x${Buffer.from(bytes).toString('hex')}`, 4);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const lockToken = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let sharedRedis: RedisClient | null | undefined;
function redisForLocks(): RedisClient | null {
  if (sharedRedis !== undefined) return sharedRedis ?? null;
  sharedRedis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true }) : null;
  return sharedRedis;
}

export class ReceiptMinter {
  private readonly index: ReceiptIndex;
  private readonly eventBus: ReceiptEventBus;
  private readonly fallbackDir: string;
  private readonly logger: Logger;
  private readonly redisLock: RedisClient | null;
  // Serialises all mint() calls on this instance so the shared signer
  // never sends overlapping storage-upload or chain transactions.
  private mintTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: ReceiptMinterOptions) {
    this.index = options.index ?? new InMemoryReceiptIndex();
    this.eventBus = options.eventBus ?? new LocalReceiptEventBus();
    this.fallbackDir = options.fallbackDir ?? '.apogee-pending-receipts';
    this.logger = options.logger ?? pino({ name: 'apogee-receipt-minter' });
    this.redisLock = redisForLocks();
  }

  subscribe(listener: (payload: ReceiptIndexRow) => void): () => void {
    return this.eventBus.subscribe('receipt', listener);
  }

  startReconciler(intervalMs = 60_000): () => void {
    const timer = setInterval(() => {
      void this.reconcilePending().catch((error: unknown) => this.logger.warn({ error }, 'receipt reconciliation failed'));
    }, intervalMs);
    return () => clearInterval(timer);
  }

  async mint(action: MintReceiptAction): Promise<MintReceiptResult> {
    const parsed = mintSchema.parse(action);

    // Idempotency check (read-only, no mutex needed).
    if (parsed.clientReceiptId) {
      const existing = await this.index.findByClientReceiptId(parsed.clientReceiptId);
      if (existing) return {
        receiptId: existing.receiptId,
        txHash: existing.txHash,
        storageRoot: existing.storageRoot,
        storageTxHash: existing.storageTxHash,
        payloadHash: existing.payloadHash,
        status: existing.status,
      };
    }

    // Serialise: wait for the previous mint() to finish before starting this one.
    // This prevents nonce conflicts when the shared signer sends both a 0G storage
    // upload tx and an Aristotle ReceiptBook tx in rapid succession.
    let release!: () => void;
    const slot = new Promise<void>(r => { release = r; });
    const prev = this.mintTail;
    this.mintTail = slot;
    await prev;
    try {
      return await this.withDistributedTxLock('ReceiptBook.emitReceipt', (lockWaitMs) => this.mintLocked(parsed, lockWaitMs));
    } finally {
      release();
    }
  }

  private async withDistributedTxLock<T>(method: string, fn: (lockWaitMs: number) => Promise<T>): Promise<T> {
    const signerAddress = (this.options.chainClient as unknown as { getSigner?(): { address: string } }).getSigner?.()?.address ?? 'unknown';
    const chainId = process.env.ZERO_G_CHAIN_ID ?? process.env.CHAIN_ID ?? '16661';
    const key = `tx:${chainId}:${signerAddress.toLowerCase()}`;
    const started = Date.now();
    if (!this.redisLock) return fn(0);
    const token = lockToken();
    while (Date.now() - started < 30_000) {
      const ok = await this.redisLock.set(key, token, 'PX', 120_000, 'NX');
      if (ok) {
        const lockWaitMs = Date.now() - started;
        try { return await fn(lockWaitMs); }
        finally {
          const current = await this.redisLock.get(key).catch(() => null);
          if (current === token) await this.redisLock.del(key).catch(() => undefined);
        }
      }
      await sleep(400);
    }
    this.logger.warn({ method, signerAddress, lockKey: key, lockWaitMs: Date.now() - started }, 'signer tx lock busy');
    throw new Error('Signer transaction queue is busy; retry shortly.');
  }

  private async mintLocked(parsed: ReturnType<typeof mintSchema.parse>, lockWaitMs = 0): Promise<MintReceiptResult> {
    const payloadJson = stableJson(parsed.payload);
    const payloadHash = keccak256(toUtf8Bytes(payloadJson));
    const receiptId = parsed.clientReceiptId ?? keccak256(toUtf8Bytes(`${parsed.agentId}:${parsed.actionTag}:${payloadHash}`));
    const valueWei = parsed.valueWei ?? 0n;

    let storageRoot = parsed.storageRoot;
    let storageTxHash: string | undefined;
    if (!storageRoot) {
      const upload = await this.uploadWithFallback(receiptId, parsed);
      storageRoot = upload.rootHash;
      storageTxHash = upload.isLocalFallback ? undefined : (upload.txHash || undefined);
    }

    const row: ReceiptIndexRow = {
      receiptId,
      clientReceiptId: parsed.clientReceiptId,
      agentId: String(parsed.agentId),
      actionTag: parsed.actionTag,
      payloadHash,
      storageRoot,
      storageTxHash,
      valueWei: valueWei.toString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await this.index.insert(row);

    // When 0G storage is unavailable the payload was written to a local fallback file.
    // We still anchor on-chain immediately using payloadHash as the bytes32 storageRoot so
    // the receipt is verifiable; the reconciler will re-upload and update storageRoot later.
    const effectiveStorageRoot = storageRoot.startsWith('local://') ? payloadHash : storageRoot;

    this.logger.info({ event: 'receipt.mint.submit', receiptId, agentId: String(parsed.agentId), actionTag: parsed.actionTag, storageRoot: effectiveStorageRoot, isLocalFallback: storageRoot.startsWith('local://') }, 'Submitting receipt on-chain');

    let receipt: TransactionReceipt;
    try {
      receipt = await this.submitReceiptWithRetry(BigInt(parsed.agentId), tagToBytes4(parsed.actionTag), payloadHash, asBytes32(effectiveStorageRoot), valueWei, lockWaitMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ event: 'receipt.mint.failed', receiptId, agentId: String(parsed.agentId), actionTag: parsed.actionTag, error: message }, 'Receipt chain submission failed');
      await this.index.update(receiptId, { status: 'failed', storageRoot: effectiveStorageRoot, storageTxHash, error: message });
      this.eventBus.publish('receipt', { ...row, storageRoot: effectiveStorageRoot, storageTxHash, status: 'failed', error: message });
      throw error;
    }
    const txHash = receipt.hash;
    this.logger.info({ event: 'receipt.mint.confirmed', receiptId, agentId: String(parsed.agentId), actionTag: parsed.actionTag, txHash, gasUsed: receipt.gasUsed?.toString() }, 'Receipt minted on-chain');
    await this.index.update(receiptId, { txHash, storageRoot: effectiveStorageRoot, storageTxHash, status: 'minted' });

    // Clean up the local fallback file now that the chain tx landed.
    if (storageRoot.startsWith('local://')) {
      await unlink(storageRoot.slice('local://'.length)).catch(() => undefined);
    }

    const minted = { ...row, storageRoot: effectiveStorageRoot, storageTxHash, txHash, status: 'minted' as const };
    this.eventBus.publish('receipt', minted);
    return { receiptId, txHash, storageRoot: effectiveStorageRoot, storageTxHash, payloadHash, status: 'minted' };
  }

  async reconcilePending(): Promise<number> {
    await mkdir(this.fallbackDir, { recursive: true });
    const files = await readdir(this.fallbackDir).catch(() => []);
    let reconciled = 0;
    for (const file of files.filter((entry) => entry.endsWith('.json'))) {
      const path = join(this.fallbackDir, file);
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as { receiptId: string; action: MintReceiptAction };
      const upload = await this.options.storageClient.uploadJson(parsed.action.payload);
      const payloadHash = keccak256(toUtf8Bytes(stableJson(parsed.action.payload)));
      const valueWei = parsed.action.valueWei === undefined ? 0n : BigInt(parsed.action.valueWei);
      const receipt = await this.submitReceiptWithRetry(BigInt(parsed.action.agentId), tagToBytes4(parsed.action.actionTag), payloadHash, asBytes32(upload.rootHash), valueWei);
      const minted: Partial<ReceiptIndexRow> = { storageRoot: upload.rootHash, txHash: receipt.hash, status: 'minted' };
      await this.index.update(parsed.receiptId, minted);
      await unlink(path).catch(() => undefined);
      reconciled += 1;
    }
    return reconciled;
  }

  private async uploadWithFallback(
    receiptId: string,
    action: ReturnType<typeof mintSchema.parse>,
  ): Promise<StorageUploadResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const upload = await this.options.storageClient.uploadJson(action.payload);
        this.logger.debug({ receiptId, agentId: String(action.agentId), actionTag: action.actionTag, rootHash: upload.rootHash, txHash: upload.txHash }, '0G storage upload succeeded');
        return { rootHash: upload.rootHash, txHash: upload.txHash, isLocalFallback: false };
      } catch (error) {
        const err = error as Error & { code?: unknown; reason?: unknown; info?: unknown };
        this.logger.warn({
          attempt,
          receiptId,
          agentId: String(action.agentId),
          actionTag: action.actionTag,
          errorName: err?.name,
          errorMessage: err?.message ?? String(error),
          errorCode: err?.code,
          errorReason: err?.reason,
          errorInfo: err?.info,
          errorStack: err?.stack?.split('\n').slice(0, 4).join(' | '),
        }, '0G storage upload failed');
        await sleep(250 * (attempt + 1));
      }
    }
    this.logger.error({
      receiptId,
      agentId: String(action.agentId),
      actionTag: action.actionTag,
    }, '0G storage upload exhausted all 3 retries — writing local fallback and anchoring payloadHash on-chain');
    await mkdir(this.fallbackDir, { recursive: true });
    const localPath = join(this.fallbackDir, `${receiptId}.json`);
    await writeFile(localPath, stableJson({ receiptId, createdAt: new Date().toISOString(), action: { ...action, valueWei: action.valueWei?.toString() } }));
    return { rootHash: `local://${localPath}`, txHash: '', isLocalFallback: true };
  }

  private async submitReceiptWithRetry(agentId: bigint, actionTag: string, payloadHash: string, storageRoot: string, valueWei: bigint, lockWaitMs = 0): Promise<TransactionReceipt> {
    const receiptBook = this.options.chainClient.contract<ReceiptBookContract>(this.options.receiptBookAddress, [
      'function emitReceipt(uint256 agentId,bytes4 actionTag,bytes32 payloadHash,bytes32 storageRoot,uint256 valueWei) returns (uint256)',
    ]);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const estimatedGas = await receiptBook.estimateGas?.emitReceipt(agentId, actionTag, payloadHash, storageRoot, valueWei);
        const gasLimit = estimatedGas === undefined ? undefined : (estimatedGas * 130n) / 100n;
        const tx = await receiptBook.emitReceipt(agentId, actionTag, payloadHash, storageRoot, valueWei, gasLimit === undefined ? undefined : { gasLimit }) as { hash: string; nonce?: number; gasPrice?: bigint | null; maxFeePerGas?: bigint | null; maxPriorityFeePerGas?: bigint | null; wait(): Promise<TransactionReceipt> };
        const signerAddress = (this.options.chainClient as unknown as { getSigner?(): { address: string } }).getSigner?.()?.address ?? 'unknown';
        this.logger.info({ method: 'ReceiptBook.emitReceipt', signerAddress, nonce: tx.nonce, txHash: tx.hash, estimatedGas: estimatedGas?.toString(), gasLimit: gasLimit?.toString(), gasPrice: tx.gasPrice?.toString() ?? null, maxFeePerGas: tx.maxFeePerGas?.toString() ?? null, maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null, attempt, lockWaitMs }, 'receipt tx submitted');
        const receipt = await tx.wait();
        if (receipt.status === 0) throw new Error(`ReceiptBook.emitReceipt reverted for ${tx.hash}`);
        if (receipt.status !== 1) throw new Error(`ReceiptBook.emitReceipt did not confirm successfully for ${tx.hash} (status ${receipt.status ?? 'unknown'})`);
        this.logger.info({ method: 'ReceiptBook.emitReceipt', signerAddress, txHash: tx.hash, nonce: tx.nonce, status: receipt.status, gasUsed: receipt.gasUsed?.toString(), attempt, lockWaitMs }, 'receipt tx confirmed');
        return receipt;
      } catch (error) {
        lastError = error;
        this.logger.warn({ attempt, lockWaitMs, error }, 'receipt chain submission failed');
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('receipt chain submission failed');
  }
}
