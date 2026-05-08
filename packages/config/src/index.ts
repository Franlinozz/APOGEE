import { z } from 'zod';

export const zeroGNetworks = {
  galileo: {
    name: '0G Galileo Testnet',
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    storageIndexer: 'https://indexer-storage-testnet-turbo.0g.ai',
    faucetUrl: 'https://faucet.0g.ai'
  },
  aristotle: {
    name: '0G Aristotle Mainnet',
    rpcUrl: 'https://evmrpc.0g.ai',
    chainId: 16661,
    explorerUrl: 'https://chainscan.0g.ai',
    storageIndexer: 'https://indexer-storage.0g.ai'
  }
} as const;

export type ZeroGNetwork = keyof typeof zeroGNetworks;

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  OG_NETWORK: z.enum(['galileo', 'aristotle']).default('galileo'),
  OG_RPC_URL: z.string().url().default(zeroGNetworks.galileo.rpcUrl),
  OG_CHAIN_ID: z.coerce.number().int().default(zeroGNetworks.galileo.chainId),
  OG_EXPLORER_URL: z.string().url().default(zeroGNetworks.galileo.explorerUrl),
  OG_STORAGE_INDEXER: z.string().url().default(zeroGNetworks.galileo.storageIndexer),
  OG_PRIVATE_KEY: z.string().optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}
