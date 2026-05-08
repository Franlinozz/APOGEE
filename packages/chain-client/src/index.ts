import {
  BaseContract,
  Contract,
  Interface,
  JsonRpcProvider,
  type InterfaceAbi,
  type TransactionReceipt,
  type TransactionRequest,
  Wallet,
} from 'ethers';
import pino, { type Logger } from 'pino';
import { z } from 'zod';

export type TxReceipt = TransactionReceipt;

export interface ChainClientOptions {
  rpcUrl: string;
  chainId: number;
  signerKey: string;
  logger?: Logger | undefined;
}

export class ChainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

export interface DecodedError {
  code: string;
  name: string;
  args: readonly unknown[];
  raw: unknown;
}

const constructorSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.number().int().positive(),
  signerKey: z.string().min(32),
  logger: z.custom<Logger>().optional(),
});
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const txSchema = z.custom<TransactionRequest>((value) => typeof value === 'object' && value !== null);
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const SEND_BACKOFF_MS = [250, 750, 2_000] as const;
const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export class ChainClient {
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly chainId: number;
  private readonly logger: Logger;
  private readonly errorInterfaces: Interface[] = [];

  constructor(options: ChainClientOptions) {
    const parsed = constructorSchema.parse(options);
    this.chainId = parsed.chainId;
    this.provider = new JsonRpcProvider(parsed.rpcUrl, parsed.chainId, { staticNetwork: true });
    this.signer = new Wallet(parsed.signerKey, this.provider);
    this.logger = parsed.logger ?? pino({ name: 'apogee-chain-client' });
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getSigner(): Wallet {
    return this.signer;
  }

  contract<T extends BaseContract = Contract>(address: string, abi: InterfaceAbi): T {
    const parsedAddress = addressSchema.parse(address);
    const iface = new Interface(abi);
    this.errorInterfaces.push(iface);
    return new Contract(parsedAddress, abi, this.signer) as unknown as T;
  }

  async send(tx: TransactionRequest): Promise<TxReceipt> {
    const parsedTx = txSchema.parse(tx);
    let lastError: unknown;

    for (let attempt = 0; attempt < SEND_BACKOFF_MS.length; attempt += 1) {
      const started = Date.now();
      try {
        const pricedTx = await this.withGasPricing(parsedTx);
        const response = await this.signer.sendTransaction(pricedTx);
        const receipt = await this.waitForReceipt(response.hash);
        this.logger.info({
          hash: response.hash,
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: receipt.gasPrice?.toString() ?? response.gasPrice?.toString() ?? null,
          ms: Date.now() - started,
        });
        return receipt;
      } catch (error: unknown) {
        lastError = error;
        if (attempt < SEND_BACKOFF_MS.length - 1) {
          await sleep(SEND_BACKOFF_MS[attempt] ?? 250);
        }
      }
    }

    throw new ChainError('SEND_FAILED', 'Transaction send failed after retries', lastError);
  }

  async batch(txs: TransactionRequest[]): Promise<TxReceipt[]> {
    const parsedTxs = z.array(txSchema).parse(txs);
    const receipts: TxReceipt[] = [];
    for (const tx of parsedTxs) {
      receipts.push(await this.send(tx));
    }
    return receipts;
  }

  async waitForReceipt(
    hash: string,
    confirmations = 1,
    timeoutMs = DEFAULT_RECEIPT_TIMEOUT_MS,
  ): Promise<TxReceipt> {
    const parsedHash = hashSchema.parse(hash);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new ChainError('RECEIPT_TIMEOUT', `Timed out waiting for ${parsedHash}`)),
        timeoutMs,
      );
    });
    const receipt = await Promise.race([
      this.provider.waitForTransaction(parsedHash, confirmations, timeoutMs),
      timeout,
    ]);
    if (!receipt) throw new ChainError('RECEIPT_MISSING', `Transaction ${parsedHash} was not mined`);
    return receipt;
  }

  decodeError(err: unknown): DecodedError {
    const data = this.extractErrorData(err);
    if (data) {
      for (const iface of this.errorInterfaces) {
        try {
          const parsed = iface.parseError(data);
          if (parsed) {
            return { code: 'CUSTOM_ERROR', name: parsed.name, args: [...parsed.args], raw: err };
          }
        } catch {
          // Try the next interface.
        }
      }
    }

    if (isRecord(err)) {
      const code = typeof err.code === 'string' ? err.code : 'UNKNOWN';
      const name = typeof err.name === 'string' ? err.name : code;
      return { code, name, args: [], raw: err };
    }

    return { code: 'UNKNOWN', name: 'UnknownError', args: [], raw: err };
  }

  private async withGasPricing(tx: TransactionRequest): Promise<TransactionRequest> {
    const gasLimit = tx.gasLimit ?? (await this.signer.estimateGas(tx));
    const pricing = await this.suggestGasPricing();
    return { ...tx, gasLimit, ...pricing, chainId: tx.chainId ?? this.chainId };
  }

  private async suggestGasPricing(): Promise<
    Pick<TransactionRequest, 'maxFeePerGas' | 'maxPriorityFeePerGas'>
  > {
    const latestBlock = await this.provider.getBlock('latest');
    const baseFee = latestBlock?.baseFeePerGas ?? 0n;
    let tip = 1_000_000_000n;

    try {
      const history = await this.provider.send('eth_feeHistory', [5, 'latest', [50]]);
      if (isRecord(history) && Array.isArray(history.reward)) {
        const rewards = history.reward
          .flatMap((row) => (Array.isArray(row) ? row : []))
          .map((value) => (typeof value === 'string' ? BigInt(value) : 0n))
          .filter((value) => value > 0n);
        if (rewards.length > 0) {
          tip = rewards.reduce((sum, value) => sum + value, 0n) / BigInt(rewards.length);
        }
      }
    } catch {
      // 0G RPCs may omit feeHistory during incidents. Use the conservative default tip.
    }

    const cappedMaxFee = (baseFee * 3n) / 2n + tip;
    return { maxPriorityFeePerGas: tip, maxFeePerGas: cappedMaxFee };
  }

  private extractErrorData(err: unknown): string | null {
    if (!isRecord(err)) return null;
    if (typeof err.data === 'string') return err.data;
    if (isRecord(err.error) && typeof err.error.data === 'string') return err.error.data;
    if (isRecord(err.info)) return this.extractErrorData(err.info);
    return null;
  }
}
