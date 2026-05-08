import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { Wallet, JsonRpcProvider } from 'ethers';
import { LRUCache } from 'lru-cache';
import type { ZodSchema } from 'zod';

export interface StorageClientOptions {
  rpcUrl: string;
  indexerUrl: string;
  signerKey: string;
  agentId?: string;
}

export interface UploadOptions {
  encrypt?: boolean;
  agentPubKey?: string;
}

export interface DownloadOptions {
  decryptKey?: string;
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

const CACHE_BYTES = 64 * 1024 * 1024;
const CHUNK_HELPER_THRESHOLD_BYTES = 256 * 1024;
const MEM_KEY_PREFIX = 'apogee-mem-key-v1';

export class StorageClient {
  private readonly rpcUrl: string;
  private readonly signer: Wallet;
  private readonly indexer: Indexer;
  private readonly agentId: string;
  private readonly cache = new LRUCache<string, CachedBlob>({
    maxSize: CACHE_BYTES,
    sizeCalculation: (value) => value.bytes.byteLength,
  });

  constructor(options: StorageClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.signer = new Wallet(options.signerKey, new JsonRpcProvider(options.rpcUrl));
    this.indexer = new Indexer(options.indexerUrl);
    this.agentId = options.agentId ?? this.signer.address;
  }

  async uploadBytes(data: Uint8Array, opts: UploadOptions = {}): Promise<UploadResult> {
    const payload = opts.encrypt
      ? await this.encrypt(data, opts.agentPubKey ?? this.agentId)
      : data;
    const result = await this.uploadPayload(payload);
    this.cache.set(result.rootHash, { bytes: payload, encrypted: Boolean(opts.encrypt) });
    return { ...result, size: data.byteLength };
  }

  async uploadJson(value: unknown, opts: UploadOptions = {}): Promise<UploadResult> {
    return this.uploadBytes(new TextEncoder().encode(JSON.stringify(value)), opts);
  }

  async downloadBytes(rootHash: string, opts: DownloadOptions = {}): Promise<Uint8Array> {
    const cached = this.cache.get(rootHash);
    if (cached) {
      return cached.encrypted
        ? await this.decrypt(cached.bytes, opts.decryptKey ?? this.agentId)
        : cached.bytes;
    }

    const dir = await mkdtemp(join(tmpdir(), 'apogee-0g-download-'));
    const outputPath = join(dir, 'blob');
    try {
      const err = await this.indexer.download(rootHash, outputPath, true);
      if (err) throw err;
      const downloaded = new Uint8Array(await readFile(outputPath));
      this.cache.set(rootHash, { bytes: downloaded, encrypted: Boolean(opts.decryptKey) });
      return opts.decryptKey ? await this.decrypt(downloaded, opts.decryptKey) : downloaded;
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
    return this.cache.has(rootHash);
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
      const rootHash = tree.rootHash();
      const sdkSigner = this.signer as unknown as Parameters<Indexer['upload']>[2];
      const [upload, uploadErr] = await this.indexer.upload(file, this.rpcUrl, sdkSigner);
      if (uploadErr) throw uploadErr;
      return {
        rootHash: upload.rootHash ?? rootHash,
        txHash: upload.txHash,
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
