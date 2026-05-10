import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'defi.snapshot',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Multi-chain portfolio snapshot using RPC balances and Coingecko prices.',
  inputs: z.object({ address: z.string().min(1), chains: z.array(z.string()).default(['ethereum']), tokens: z.array(z.string()).default([]), currency: z.string().default('usd') }),
  outputs: z.object({ address: z.string(), currency: z.string(), chains: z.array(z.object({ chain: z.string(), totalValue: z.number(), assets: z.array(z.object({ symbol: z.string(), balance: z.string(), value: z.number() })) })), totalValue: z.number() }),
  sideEffects: ['http'],
  declaredEgress: ['api.coingecko.com', 'rpc.ankr.com'],
  pricePerCallWei: 800000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
