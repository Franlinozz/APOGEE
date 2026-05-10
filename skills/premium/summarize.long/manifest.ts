import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'summarize.long',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Recursive map-reduce summary for long text.',
  inputs: z.object({ text: z.string().min(1), maxChunkChars: z.number().int().positive().default(6000), targetWords: z.number().int().positive().default(400) }),
  outputs: z.object({ summary: z.string(), chunks: z.number() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 900000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
