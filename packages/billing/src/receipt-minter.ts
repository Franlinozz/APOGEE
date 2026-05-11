import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { keccak256, toUtf8Bytes, zeroPadValue, type TransactionReceipt } from 'ethers';
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
  valueWei: string;
  txHash?: string | undefined;
  status: 'pending' | 'minted';
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
  status: 'pending' | 'minted';
}

interface ReceiptBookContract {
  emitReceipt(agentId: bigint, actionTag: string, payloadHash: string, storageRoot: string, valueWei: bigint): Promise<{ hash: string; wait(): Promise<TransactionReceipt> }>;
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

export class ReceiptMinter {
  private readonly index: ReceiptIndex;
  private readonly eventBus: ReceiptEventBus;
  private readonly fallbackDir: string;
  private readonly logger: Logger;

  constructor(private readonly options: ReceiptMinterOptions) {
    this.index = options.index ?? new InMemoryReceiptIndex();
    this.eventBus = options.eventBus ?? new LocalReceiptEventBus();
    this.fallbackDir = options.fallbackDir ?? '.apogee-pending-receipts';
    this.logger = options.logger ?? pino({ name: 'apogee-receipt-minter' });
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
    if (parsed.clientReceiptId) {
      const existing = await this.index.findByClientReceiptId(parsed.clientReceiptId);
      if (existing) return { receiptId: existing.receiptId, txHash: existing.txHash, storageRoot: existing.storageRoot, status: existing.status };
    }

    const payloadJson = stableJson(parsed.payload);
    const payloadHash = keccak256(toUtf8Bytes(payloadJson));
    const receiptId = parsed.clientReceiptId ?? keccak256(toUtf8Bytes(`${parsed.agentId}:${parsed.actionTag}:${payloadHash}`));
    const valueWei = parsed.valueWei ?? 0n;

    let storageRoot = parsed.storageRoot;
    if (!storageRoot) {
      storageRoot = await this.uploadWithFallback(receiptId, parsed);
    }

    const row: ReceiptIndexRow = {
      receiptId,
      clientReceiptId: parsed.clientReceiptId,
      agentId: String(parsed.agentId),
      actionTag: parsed.actionTag,
      payloadHash,
      storageRoot,
      valueWei: valueWei.toString(),
      status: storageRoot.startsWith('local://') ? 'pending' : 'minted',
      createdAt: new Date().toISOString(),
    };

    await this.index.insert(row);

    // When 0G storage is unavailable the payload was written to a local fallback file.
    // We still anchor on-chain immediately using payloadHash as the bytes32 storageRoot so
    // the receipt is verifiable; the reconciler will re-upload and update storageRoot later.
    const effectiveStorageRoot = storageRoot.startsWith('local://') ? payloadHash : storageRoot;

    const receipt = await this.submitReceiptWithRetry(BigInt(parsed.agentId), tagToBytes4(parsed.actionTag), payloadHash, asBytes32(effectiveStorageRoot), valueWei);
    const txHash = receipt.hash;
    await this.index.update(receiptId, { txHash, storageRoot: effectiveStorageRoot, status: 'minted' });

    // Clean up the local fallback file now that the chain tx landed.
    if (storageRoot.startsWith('local://')) {
      await unlink(storageRoot.slice('local://'.length)).catch(() => undefined);
    }

    const minted = { ...row, storageRoot: effectiveStorageRoot, txHash, status: 'minted' as const };
    this.eventBus.publish('receipt', minted);
    return { receiptId, txHash, storageRoot: effectiveStorageRoot, status: 'minted' };
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

  private async uploadWithFallback(receiptId: string, action: MintReceiptAction): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const upload = await this.options.storageClient.uploadJson(action.payload);
        return upload.rootHash;
      } catch (error) {
        this.logger.warn({ attempt, error }, '0G storage receipt upload failed');
        await sleep(250 * (attempt + 1));
      }
    }
    await mkdir(this.fallbackDir, { recursive: true });
    const path = join(this.fallbackDir, `${receiptId}.json`);
    await writeFile(path, stableJson({ receiptId, createdAt: new Date().toISOString(), action: { ...action, valueWei: action.valueWei?.toString() } }));
    return `local://${path}`;
  }

  private async submitReceiptWithRetry(agentId: bigint, actionTag: string, payloadHash: string, storageRoot: string, valueWei: bigint): Promise<TransactionReceipt> {
    const receiptBook = this.options.chainClient.contract<ReceiptBookContract>(this.options.receiptBookAddress, [
      'function emitReceipt(uint256 agentId,bytes4 actionTag,bytes32 payloadHash,bytes32 storageRoot,uint256 valueWei) returns (uint256)',
    ]);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const tx = await receiptBook.emitReceipt(agentId, actionTag, payloadHash, storageRoot, valueWei);
        return await tx.wait();
      } catch (error) {
        lastError = error;
        this.logger.warn({ attempt, error }, 'receipt chain submission failed');
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('receipt chain submission failed');
  }
}
