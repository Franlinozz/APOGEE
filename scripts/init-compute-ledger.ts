import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPUTE_CLIENT_PACKAGE = resolve(process.cwd(), 'packages/compute-client/package.json');
const requireFromComputeClient = createRequire(COMPUTE_CLIENT_PACKAGE);
const { createZGComputeNetworkBroker } = requireFromComputeClient('@0glabs/0g-serving-broker') as {
  createZGComputeNetworkBroker: (signer: unknown) => Promise<Broker>;
};
const ethers = requireFromComputeClient('ethers') as {
  JsonRpcProvider: new (url: string) => {
    getBalance: (address: string) => Promise<bigint>;
  };
  Wallet: new (privateKey: string, provider: unknown) => { address: string };
  parseEther: (value: string) => bigint;
  formatEther: (value: bigint) => string;
};

type Broker = {
  ledger: {
    getLedger: () => Promise<unknown>;
    addLedger: (amount: number, gasPrice?: number) => Promise<unknown>;
    depositFund: (amount: number, gasPrice?: number) => Promise<unknown>;
    ledger?: {
      getLedgerWithDetail?: () => Promise<unknown>;
    };
  };
  inference: {
    acknowledged?: (providerAddress: string) => Promise<boolean>;
    acknowledgeProviderSigner: (providerAddress: string, gasPrice?: number) => Promise<unknown>;
  };
};

const DEFAULT_COMPUTE_PROVIDER = '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C';
const MIN_WALLET_BALANCE = ethers.parseEther('0.06');
const TARGET_LEDGER_BALANCE_OG = 0.05;
const MIN_EXISTING_LEDGER_BALANCE = ethers.parseEther('0.01');

function loadDotEnv(path = resolve(process.cwd(), '.env')): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const equalIndex = trimmed.indexOf('=');
    const key = trimmed
      .slice(0, equalIndex)
      .trim()
      .replace(/^export\s+/, '');
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(equalIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
    if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLedgerNotFound(error: unknown): boolean {
  const haystack = JSON.stringify(error, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  ).toLowerCase();
  return (
    haystack.includes('ledgernotexists') ||
    haystack.includes('ledger not') ||
    haystack.includes('not found') ||
    haystack.includes('0x7d2d536b')
  );
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function getLedgerBalance(ledger: unknown): bigint {
  if (!isRecord(ledger)) return 0n;
  return (
    toBigInt(ledger.availableBalance) ??
    toBigInt(ledger.totalBalance) ??
    toBigInt(ledger.balance) ??
    0n
  );
}

function format0g(value: unknown): string {
  const bigint = toBigInt(value);
  if (bigint === null) return String(value);
  return ethers.formatEther(bigint);
}

function collectNumericFields(
  value: unknown,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  if (
    typeof value === 'bigint' ||
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d+$/.test(value))
  ) {
    out[prefix || 'value'] = format0g(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumericFields(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value))
      collectNumericFields(item, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function summarizeLedger(ledger: unknown): Record<string, string> {
  if (!isRecord(ledger)) return { raw: String(ledger) };
  return {
    user: typeof ledger.user === 'string' ? ledger.user : '',
    totalBalance: format0g(ledger.totalBalance ?? ledger.balance ?? 0n),
    availableBalance: format0g(ledger.availableBalance ?? ledger.balance ?? 0n),
    totalLocked: format0g(ledger.totalLocked ?? 0n),
    ...collectNumericFields(ledger),
  };
}

async function waitIfTransaction(tx: unknown, label: string): Promise<void> {
  if (isRecord(tx) && typeof tx.hash === 'string') console.log(`${label} tx submitted:`, tx.hash);
  else console.log(`${label} submitted:`, tx ?? 'SDK returned void');

  const wait = isRecord(tx) ? tx.wait : undefined;
  if (typeof wait === 'function') {
    const receipt = await wait.call(tx);
    if (isRecord(receipt))
      console.log(`${label} confirmed in block`, receipt.blockNumber ?? 'unknown');
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const privateKey = requireEnv('EDGE_SERVICE_PRIVATE_KEY');
  const rpcUrl = requireEnv('ZERO_G_ARISTOTLE_RPC_URL');
  const providerAddress = process.env.ZERO_G_COMPUTE_PROVIDER?.trim() || DEFAULT_COMPUTE_PROVIDER;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const walletBalance = await provider.getBalance(signer.address);

  console.log('Signer:', signer.address);
  console.log('Wallet balance:', `${ethers.formatEther(walletBalance)} $0G`);

  if (walletBalance < MIN_WALLET_BALANCE) {
    throw new Error(
      `Wallet balance is too low. Need at least 0.06 $0G, found ${ethers.formatEther(walletBalance)} $0G.`,
    );
  }

  const broker = await createZGComputeNetworkBroker(signer);

  let existingLedger: unknown | null = null;
  try {
    existingLedger = await broker.ledger.getLedger();
    console.log('Existing ledger:', summarizeLedger(existingLedger));
  } catch (error) {
    if (!isLedgerNotFound(error)) throw error;
    console.log('No existing 0G Compute ledger found; creating one.');
  }

  const existingAvailable = existingLedger ? getLedgerBalance(existingLedger) : 0n;
  if (!existingLedger) {
    const tx = await broker.ledger.addLedger(TARGET_LEDGER_BALANCE_OG);
    await waitIfTransaction(tx, 'addLedger');
  } else if (existingAvailable <= MIN_EXISTING_LEDGER_BALANCE) {
    const tx = await broker.ledger.depositFund(TARGET_LEDGER_BALANCE_OG);
    await waitIfTransaction(tx, 'depositFund');
  } else {
    console.log('Existing ledger has enough available balance; skipping addLedger/depositFund.');
  }

  const finalLedger = await broker.ledger.getLedger();
  console.log('Ledger after init:', summarizeLedger(finalLedger));

  if (broker.ledger.ledger?.getLedgerWithDetail) {
    const detail = await broker.ledger.ledger
      .getLedgerWithDetail()
      .catch((error: unknown) => ({ detailReadError: String(error) }));
    console.log('Ledger numeric detail:', collectNumericFields(detail));
  }

  let providerAcknowledged = false;
  try {
    providerAcknowledged = broker.inference.acknowledged
      ? await broker.inference.acknowledged(providerAddress)
      : false;
    if (!providerAcknowledged) {
      const tx = await broker.inference.acknowledgeProviderSigner(providerAddress);
      await waitIfTransaction(tx, 'acknowledgeProviderSigner');
      providerAcknowledged = true;
    }
  } catch (error) {
    console.warn(
      'Provider acknowledgement failed; ledger initialization is complete, but first chat may retry acknowledgement.',
      error,
    );
  }

  const finalAvailable = getLedgerBalance(finalLedger);
  console.log(`✓ Ledger initialized for: ${signer.address}`);
  console.log(`✓ Available balance: ${ethers.formatEther(finalAvailable)} $0G`);
  console.log(
    `✓ Provider acknowledged: ${providerAcknowledged ? providerAddress : 'not confirmed'}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
