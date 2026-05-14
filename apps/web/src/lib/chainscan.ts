export type ChainscanLinkKind = 'tx' | 'address';

export type ChainscanInput = {
  value?: string | null;
  txHash?: string | null;
  address?: string | null;
  kind?: ChainscanLinkKind;
  chainId?: number | string | null;
  network?: string | null;
};

const TX_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function chainscanBase(input?: Pick<ChainscanInput, 'chainId' | 'network'> | null): string {
  const chainId = input?.chainId != null ? Number(input.chainId) : undefined;
  const network = input?.network?.toLowerCase();
  if (chainId === 16602 || network === 'galileo') return 'https://chainscan-galileo.0g.ai';
  if (chainId === 16661 || network === 'aristotle') return 'https://chainscan.0g.ai';
  return 'https://chainscan.0g.ai';
}

export function isTxHash(value?: string | null): value is string {
  return typeof value === 'string' && TX_RE.test(value);
}

export function isAddress(value?: string | null): value is string {
  return typeof value === 'string' && ADDRESS_RE.test(value);
}

export function buildChainscanUrl(input: ChainscanInput | string | null | undefined): string | null {
  const normalized: ChainscanInput = typeof input === 'string' ? { value: input } : input ?? {};
  const candidate = normalized.txHash ?? normalized.address ?? normalized.value ?? null;
  if (!candidate) return null;

  const kind = normalized.kind;
  const base = chainscanBase(normalized);
  if ((kind === undefined || kind === 'tx') && isTxHash(candidate)) return `${base}/tx/${candidate}`;
  if ((kind === undefined || kind === 'address') && isAddress(candidate)) return `${base}/address/${candidate}`;
  return null;
}
