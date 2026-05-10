// Canonical contract address registry for all deployed networks.
// Galileo addresses are live. Aristotle section is populated by deploy-aristotle.ts.

export type NetworkContracts = {
  PolicyEngine: string;
  ReceiptBook: string;
  AgentIdentity: string;
  ServiceRegistry: string;
  RevenueSplitter: string;
  PaymentRouter: string;
  EscrowVault: string;
  AccountFactory: string;
  AgentAccount: string;
};

const GALILEO: NetworkContracts = {
  PolicyEngine:    '0xa8933d96A27BDfFac07C0d7467f3213cb340f550',
  ReceiptBook:     '0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53',
  AgentIdentity:   '0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3',
  ServiceRegistry: '0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad',
  RevenueSplitter: '0x1E32A89B6815a492Ad30f71a5E35280EF7399b74',
  PaymentRouter:   '0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c',
  EscrowVault:     '0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767',
  AccountFactory:  '0xABc44aF98e6d873C0700c9B687fbf3Be560cba90',
  AgentAccount:    '0xc18eD4e075a23A66505744A353eeFE91340F924d',
};

// Populated by: pnpm -F @apogee/contracts deploy:aristotle
const ARISTOTLE: NetworkContracts = {
  PolicyEngine:    '',
  ReceiptBook:     '',
  AgentIdentity:   '',
  ServiceRegistry: '',
  RevenueSplitter: '',
  PaymentRouter:   '',
  EscrowVault:     '',
  AccountFactory:  '',
  AgentAccount:    '',
};

export const CONTRACTS: Record<number, NetworkContracts> = {
  16602: GALILEO,
  16661: ARISTOTLE,
};

export const EXPLORER_URLS: Record<number, string> = {
  16602: 'https://chainscan-galileo.0g.ai',
  16661: 'https://chainscan.0g.ai',
};

export const CHAIN_NAMES: Record<number, string> = {
  16602: 'Galileo (testnet)',
  16661: 'Aristotle (mainnet)',
};

export const RPC_URLS: Record<number, string> = {
  16602: 'https://evmrpc-testnet.0g.ai',
  16661: 'https://evmrpc.0g.ai',
};

export function getContracts(chainId: number): NetworkContracts {
  const c = CONTRACTS[chainId];
  if (!c) throw new Error(`No contract addresses for chainId ${chainId}`);
  return c;
}

export const CONTRACT_NAMES = Object.keys(GALILEO) as (keyof NetworkContracts)[];
