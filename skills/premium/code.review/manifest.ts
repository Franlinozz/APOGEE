import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'code.review',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Review a diff and return structured findings via 0G chat.',
  inputs: z.object({ diff: z.string().min(1), focus: z.array(z.string()).default(['correctness','security','tests']) }),
  outputs: z.object({ summary: z.string(), findings: z.array(z.object({ severity: z.enum(['low','medium','high','critical']), file: z.string().optional(), message: z.string(), suggestion: z.string().optional() })) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 1500000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
