import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ethers } from 'ethers';
import { z } from 'zod';

const rootHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export type StorageUploadResult = { rootHash: string; transactionHash?: string };

export async function uploadBufferToZeroG(input: {
  buffer: Buffer;
  fileName?: string;
  rpcUrl: string;
  privateKey: string;
  indexerUrl: string;
}): Promise<StorageUploadResult> {
  if (input.buffer.length === 0) throw new Error('Cannot upload an empty buffer to 0G Storage');

  const tempPath = join(tmpdir(), `apogee-0g-upload-${randomUUID()}-${input.fileName ?? 'memory.bin'}`);
  await writeFile(tempPath, input.buffer, { mode: 0o600 });

  const sdk = (await import('@0glabs/0g-ts-sdk')) as any;
  const provider = new ethers.JsonRpcProvider(input.rpcUrl);
  const wallet = new ethers.Wallet(input.privateKey, provider);
  const indexer = new sdk.Indexer(input.indexerUrl);
  const file = await sdk.ZgFile.fromFilePath(tempPath);

  try {
    const [tree, treeError] = await file.merkleTree();
    if (treeError) throw treeError;
    const rootHash = rootHashSchema.parse(tree.rootHash());

    const [tx, uploadError] = await indexer.upload(file, input.rpcUrl, wallet);
    if (uploadError) throw new Error(`0G Storage upload failed: ${uploadError.message ?? String(uploadError)}`);

    return { rootHash, transactionHash: typeof tx === 'string' ? tx : tx?.hash };
  } finally {
    await file.close().catch(() => undefined);
    await rm(tempPath, { force: true });
  }
}

export async function downloadFromZeroG(input: { rootHash: string; outputPath: string; indexerUrl: string }): Promise<void> {
  const rootHash = rootHashSchema.parse(input.rootHash);
  const sdk = (await import('@0glabs/0g-ts-sdk')) as any;
  const indexer = new sdk.Indexer(input.indexerUrl);

  try {
    const error = await indexer.download(rootHash, input.outputPath, true);
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`0G Storage download failed: ${message}`);
  }
}
