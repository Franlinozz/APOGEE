import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Indexer, ZgFile } from '@0gfoundation/0g-ts-sdk';
import { Wallet, JsonRpcProvider } from 'ethers';
import { LRUCache } from 'lru-cache';
import pino, { type Logger } from 'pino';
import { z, type ZodSchema } from 'zod';

export interface StorageClientOptions {
  rpcUrl: string;
  indexerUrl: string;
  signerKey: string;
  agentId?: string | undefined;
  logger?: Logger | undefined;
}

export interface UploadOptions {
  encrypt?: boolean | undefined;
  agentPubKey?: string | undefined;
}

export interface DownloadOptions {
  decryptKey?: string | undefined;
}

export interface UploadResult {
  rootHash: string;
  txHash: string;
  size: number;
}

interface CachedBlob {
  bytes: Uint8Array;
  encrypted: boolean;
}

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

const constructorSchema = z.object({
  rpcUrl: z.string().url(),
  indexerUrl: z.string().url(),
  signerKey: z.string().min(32),
  agentId: z.string().optional(),
  logger: z.custom<Logger>().optional(),
});
const bytesSchema = z.instanceof(Uint8Array);
const rootHashSchema = z.string().min(1);
const uploadOptionsSchema = z.object({ encrypt: z.boolean().optional(), agentPubKey: z.string().optional() });
const downloadOptionsSchema = z.object({ decryptKey: z.string().optional() });
const CACHE_BYTES = 64 * 1024 * 1024;
const CHUNK_HELPER_THRESHOLD_BYTES = 256 * 1024;
const MEM_KEY_PREFIX = 'apogee-mem-key-v1';

export class StorageClient {
  private readonly rpcUrl: string;
  private readonly signer: Wallet;
  private readonly indexer: Indexer;
  private readonly agentId: string;
  private readonly logger: Logger;
  private readonly cache = new LRUCache<string, CachedBlob>({
    maxSize: CACHE_BYTES,
    sizeCalculation: (value) => value.bytes.byteLength,
  });

  constructor(options: StorageClientOptions) {
    const parsed = constructorSchema.parse(options);
    this.rpcUrl = parsed.rpcUrl;
    this.signer = new Wallet(parsed.signerKey, new JsonRpcProvider(parsed.rpcUrl));
    this.indexer = new Indexer(parsed.indexerUrl);
    this.agentId = parsed.agentId ?? this.signer.address;
    this.logger = parsed.logger ?? pino({ name: 'apogee-storage-client' });
  }

  async uploadBytes(data: Uint8Array, opts: UploadOptions = {}): Promise<UploadResult> {
    const parsedData = bytesSchema.parse(data);
    const parsedOpts = uploadOptionsSchema.parse(opts);
    const payload = parsedOpts.encrypt
      ? await this.encrypt(parsedData, parsedOpts.agentPubKey ?? this.agentId)
      : parsedData;
    const result = await this.uploadPayload(payload);
    this.logger.info({ rootHash: result.rootHash, txHash: result.txHash, size: parsedData.byteLength }, '0G storage upload');
    this.cache.set(result.rootHash, { bytes: payload, encrypted: Boolean(parsedOpts.encrypt) });
    return { ...result, size: parsedData.byteLength };
  }

  async uploadJson(value: unknown, opts: UploadOptions = {}): Promise<UploadResult> {
    return this.uploadBytes(new TextEncoder().encode(JSON.stringify(value)), opts);
  }

  async downloadBytes(rootHash: string, opts: DownloadOptions = {}): Promise<Uint8Array> {
    const parsedRootHash = rootHashSchema.parse(rootHash);
    const parsedOpts = downloadOptionsSchema.parse(opts);
    const cached = this.cache.get(parsedRootHash);
    if (cached) {
      return cached.encrypted
        ? await this.decrypt(cached.bytes, parsedOpts.decryptKey ?? this.agentId)
        : cached.bytes;
    }

    const dir = await mkdtemp(join(tmpdir(), 'apogee-0g-download-'));
    const outputPath = join(dir, 'blob');
    try {
      const err = await this.indexer.download(parsedRootHash, outputPath, true);
      if (err) throw err;
      const downloaded = new Uint8Array(await readFile(outputPath));
      this.cache.set(parsedRootHash, { bytes: downloaded, encrypted: Boolean(parsedOpts.decryptKey) });
      return parsedOpts.decryptKey ? await this.decrypt(downloaded, parsedOpts.decryptKey) : downloaded;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async downloadJson<T>(rootHash: string, schema: ZodSchema<T>): Promise<T> {
    const bytes = await this.downloadBytes(rootHash);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return schema.parse(parsed);
  }

  existsLocally(rootHash: string): boolean {
    return this.cache.has(rootHashSchema.parse(rootHash));
  }

  private async uploadPayload(payload: Uint8Array): Promise<UploadResult> {
    const dir = await mkdtemp(join(tmpdir(), 'apogee-0g-upload-'));
    const filePath = join(
      dir,
      payload.byteLength > CHUNK_HELPER_THRESHOLD_BYTES ? 'chunked.bin' : 'blob.bin',
    );
    await writeFile(filePath, payload);

    const file = await ZgFile.fromFilePath(filePath);
    try {
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr) throw treeErr;
      if (!tree) throw new Error('0G SDK did not return a Merkle tree');
      const treeRoot = tree.rootHash();
      if (!treeRoot) throw new Error('0G SDK Merkle tree has no root hash');
      const rootHash: string = treeRoot;
      const sdkSigner = this.signer as unknown as Parameters<Indexer['upload']>[2];
      const [upload, uploadErr] = await this.indexer.upload(file, this.rpcUrl, sdkSigner);
      if (uploadErr) throw uploadErr;
      // upload is either single { txHash, rootHash, txSeq } or multi-fragment { txHashes[], rootHashes[], txSeqs[] }
      const singleRoot: string = ('rootHash' in upload && upload.rootHash) ? upload.rootHash : rootHash;
      const singleTx: string   = ('txHash'   in upload) ? upload.txHash : '';
      return {
        rootHash: singleRoot,
        txHash: singleTx,
        size: payload.byteLength,
      };
    } finally {
      await file.close();
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async encrypt(data: Uint8Array, agentId: string): Promise<Uint8Array> {
    const key = await this.deriveKey(agentId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return new Uint8Array(Buffer.concat([iv, ciphertext, tag]));
  }

  private async decrypt(payload: Uint8Array, agentId: string): Promise<Uint8Array> {
    if (payload.byteLength < 29) throw new Error('Encrypted payload is too short');
    const key = await this.deriveKey(agentId);
    const buffer = Buffer.from(payload);
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(buffer.byteLength - 16);
    const ciphertext = buffer.subarray(12, buffer.byteLength - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  }

  private async deriveKey(agentId: string): Promise<Buffer> {
    const signature = await this.signer.signMessage(`${MEM_KEY_PREFIX}:${agentId}`);
    return createHash('sha256').update(signature).digest();
  }
}
