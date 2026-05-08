import { Buffer } from 'node:buffer';
import { Interface, Wallet, getBytes, id, keccak256, toUtf8Bytes, zeroPadValue } from 'ethers';
import { Mutex } from 'async-mutex';
import { z, type ZodSchema } from 'zod';
import type { ChainClient, TxReceipt } from '@apogee/chain-client';
import type { ComputeClient } from '@apogee/compute-client';
import type { StorageClient, UploadResult } from '@apogee/storage-client';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface MemoryEngineOptions {
  storageClient: StorageClient;
  chainClient: ChainClient;
  agentId: string;
  ownerSigner: Wallet;
  embedFn?: ((text: string) => Promise<number[]>) | undefined;
  computeClient?: ComputeClient | undefined;
  receiptBookAddress?: string | undefined;
}

export class MemoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

export interface MemoryKey {
  key: string;
  version: number;
  blobRoot: string;
  deleted?: boolean;
}

export interface MemoryHit {
  key: string;
  score: number;
  version: number;
  value: JsonValue | null;
}

interface VersionEntry {
  version: number;
  blobRoot: string;
  createdAt: string;
}

interface IndexEntry {
  key: string;
  blobRoot: string;
  version: number;
  embeddingRef?: string;
  versions: VersionEntry[];
  deleted?: boolean;
}

interface MemoryIndex {
  agentId: string;
  updatedAt: string;
  keys: IndexEntry[];
}

const keySchema = z.string().min(1).max(512);
const prefixSchema = z.string();
const searchSchema = z.object({ query: z.string().min(1), k: z.number().int().positive().max(100) });
const stateRootSchema = z.string().min(1);
const GALILEO_RECEIPT_BOOK = '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53';
const MEMORY_COMMIT_TAG = id('memory.commit').slice(0, 10);
const RECEIPT_BOOK_ABI = [
  'function emitReceipt(uint256 agentId, bytes4 actionTag, bytes32 payloadHash, bytes32 storageRoot, uint256 valueWei) returns (uint256 receiptId)',
] as const;
const INDEX_SCHEMA_VERSION = 1;
const MAX_VERSIONS_PER_KEY = 10;
const DEFAULT_EMBEDDING_DIMS = 256;

const mutexes = new Map<string, Mutex>();

export class MemoryEngine {
  private readonly storageClient: StorageClient;
  private readonly chainClient: ChainClient;
  private readonly agentId: string;
  private readonly ownerSigner: Wallet;
  private readonly embedFn: ((text: string) => Promise<number[]>) | undefined;
  private readonly computeClient: ComputeClient | undefined;
  private readonly receiptBookAddress: string;
  private index: MemoryIndex;

  constructor(options: MemoryEngineOptions) {
    this.storageClient = options.storageClient;
    this.chainClient = options.chainClient;
    this.agentId = options.agentId;
    this.ownerSigner = options.ownerSigner;
    this.embedFn = options.embedFn;
    this.computeClient = options.computeClient;
    this.receiptBookAddress = options.receiptBookAddress ?? GALILEO_RECEIPT_BOOK;
    this.index = { agentId: options.agentId, updatedAt: new Date(0).toISOString(), keys: [] };
  }

  async set(key: string, value: JsonValue): Promise<{ rootHash: string; version: number }> {
    const parsedKey = keySchema.parse(key);
    return this.withLock(async () => {
      const encoded = new TextEncoder().encode(JSON.stringify(value));
      const blob = await this.storageClient.uploadBytes(encoded, {
        encrypt: true,
        agentPubKey: this.agentId,
      });
      const embedding = await this.embedText(JSON.stringify(value));
      const embeddingRef = await this.storeEmbedding(embedding);
      const existing = this.index.keys.find((entry) => entry.key === parsedKey);
      const version = (existing?.version ?? 0) + 1;
      const now = new Date().toISOString();
      const versions = [
        { version, blobRoot: blob.rootHash, createdAt: now },
        ...(existing?.versions ?? []),
      ].slice(0, MAX_VERSIONS_PER_KEY);

      const entry: IndexEntry = {
        key: parsedKey,
        blobRoot: blob.rootHash,
        version,
        embeddingRef,
        versions,
      };
      this.upsert(entry);
      this.touch();
      return { rootHash: blob.rootHash, version };
    });
  }

  async get<T>(key: string, schema?: ZodSchema<T>): Promise<T | JsonValue | null> {
    const parsedKey = keySchema.parse(key);
    const entry = this.index.keys.find((item) => item.key === parsedKey && !item.deleted);
    if (!entry) return null;
    const bytes = await this.storageClient.downloadBytes(entry.blobRoot, {
      decryptKey: this.agentId,
    });
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return schema ? schema.parse(parsed) : (parsed as JsonValue);
  }

  async delete(key: string): Promise<void> {
    const parsedKey = keySchema.parse(key);
    await this.withLock(async () => {
      const entry = this.index.keys.find((item) => item.key === parsedKey);
      if (entry) {
        entry.deleted = true;
        this.touch();
      }
    });
  }

  async list(prefix = ''): Promise<MemoryKey[]> {
    const parsedPrefix = prefixSchema.parse(prefix);
    return this.index.keys
      .filter((entry) => !entry.deleted && entry.key.startsWith(parsedPrefix))
      .map((entry) => ({ key: entry.key, version: entry.version, blobRoot: entry.blobRoot }));
  }

  async search(query: string, k = 5): Promise<MemoryHit[]> {
    const parsed = searchSchema.parse({ query, k });
    const queryVector = await this.embedText(parsed.query);
    const candidates = this.index.keys.filter((entry) => !entry.deleted && entry.embeddingRef);
    const scored: MemoryHit[] = [];

    for (const entry of candidates) {
      if (!entry.embeddingRef) continue;
      const embedding = await this.loadEmbedding(entry.embeddingRef);
      const value = await this.get(entry.key);
      scored.push({
        key: entry.key,
        version: entry.version,
        score: cosine(queryVector, embedding),
        value: value as JsonValue | null,
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, parsed.k);
  }

  async commitState(): Promise<{ stateRoot: string; txHash: string }> {
    return this.withLock(async () => {
      const state = {
        schemaVersion: INDEX_SCHEMA_VERSION,
        agentId: this.agentId,
        updatedAt: new Date().toISOString(),
        index: this.index,
      };
      const upload = await this.storageClient.uploadJson(state);
      const receipt = await this.writeReceipt(upload);
      return { stateRoot: upload.rootHash, txHash: receipt.hash };
    });
  }

  async restore(stateRoot: string): Promise<void> {
    const parsedStateRoot = stateRootSchema.parse(stateRoot);
    const bytes = await this.storageClient.downloadBytes(parsedStateRoot);
    const state = JSON.parse(new TextDecoder().decode(bytes)) as { index?: MemoryIndex };
    if (!state.index || state.index.agentId !== this.agentId) {
      throw new MemoryError('RESTORE_AGENT_MISMATCH', 'Stored memory state is missing or belongs to a different agent');
    }
    this.index = state.index;
  }

  private async writeReceipt(upload: UploadResult): Promise<TxReceipt> {
    const iface = new Interface(RECEIPT_BOOK_ABI);
    const agentId = BigInt(this.agentId);
    const payload = JSON.stringify({
      agentId: this.agentId,
      keyCount: this.index.keys.length,
      stateRoot: upload.rootHash,
    });
    const payloadHash = keccak256(toUtf8Bytes(payload));
    const storageRoot = toBytes32(upload.rootHash);
    const data = iface.encodeFunctionData('emitReceipt', [
      agentId,
      MEMORY_COMMIT_TAG,
      payloadHash,
      storageRoot,
      0n,
    ]);
    return this.chainClient.send({
      to: this.receiptBookAddress,
      data,
      from: this.ownerSigner.address,
    });
  }

  private async embedText(text: string): Promise<number[]> {
    if (this.embedFn) return this.normaliseEmbedding(await this.embedFn(text));
    if (this.computeClient) {
      const [embedding] = await this.computeClient.embed(text);
      return this.normaliseEmbedding(embedding ?? []);
    }
    return this.localEmbedding(text);
  }

  private async storeEmbedding(embedding: number[]): Promise<string> {
    const packed = new ArrayBuffer(embedding.length * 4);
    const view = new DataView(packed);
    embedding.forEach((value, index) => view.setFloat32(index * 4, value, true));
    const upload = await this.storageClient.uploadBytes(new Uint8Array(packed));
    return upload.rootHash;
  }

  private async loadEmbedding(rootHash: string): Promise<number[]> {
    const bytes = await this.storageClient.downloadBytes(rootHash);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values: number[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += 4) {
      values.push(view.getFloat32(offset, true));
    }
    return values;
  }

  private upsert(entry: IndexEntry): void {
    const index = this.index.keys.findIndex((item) => item.key === entry.key);
    if (index === -1) this.index.keys.push(entry);
    else this.index.keys[index] = entry;
  }

  private touch(): void {
    this.index.updatedAt = new Date().toISOString();
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const mutex = getMutex(this.agentId);
    return mutex.runExclusive(fn);
  }

  private localEmbedding(text: string): number[] {
    const vector = new Array<number>(DEFAULT_EMBEDDING_DIMS).fill(0);
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    for (const token of tokens) {
      const hash = getBytes(id(token));
      const bucket = (hash[0] ?? 0) % DEFAULT_EMBEDDING_DIMS;
      vector[bucket] = (vector[bucket] ?? 0) + 1;
    }
    return this.normaliseEmbedding(vector);
  }

  private normaliseEmbedding(vector: number[]): number[] {
    const resized = vector.slice(0, DEFAULT_EMBEDDING_DIMS);
    while (resized.length < DEFAULT_EMBEDDING_DIMS) resized.push(0);
    const norm = Math.hypot(...resized) || 1;
    return resized.map((value) => value / norm);
  }
}

const getMutex = (agentId: string): Mutex => {
  const existing = mutexes.get(agentId);
  if (existing) return existing;
  const mutex = new Mutex();
  mutexes.set(agentId, mutex);
  return mutex;
};

const cosine = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMag += a * a;
    rightMag += b * b;
  }
  return dot / ((Math.sqrt(leftMag) || 1) * (Math.sqrt(rightMag) || 1));
};

const toBytes32 = (value: string): string => {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  return zeroPadValue(keccak256(Buffer.from(value)), 32);
};
