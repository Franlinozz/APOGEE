import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'nft.mint',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Mint an ERC-721 with metadata stored on 0G Storage.',
  inputs: z.object({ contractAddress: z.string().min(1), to: z.string().min(1), name: z.string().min(1), description: z.string().optional(), image: z.string().optional(), attributes: z.array(z.record(z.string(), z.unknown())).default([]), dryRun: z.boolean().default(false) }),
  outputs: z.object({ tokenUri: z.string(), storageRoot: z.string().optional(), txHash: z.string().optional(), dryRun: z.boolean() }),
  sideEffects: ['chain', 'storage'],
  declaredEgress: [],
  pricePerCallWei: 2000000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
