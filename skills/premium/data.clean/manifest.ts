import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'data.clean',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Clean CSV/JSON into normalized JSON with a report.',
  inputs: z.object({ data: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]), format: z.enum(['csv','json']).optional() }),
  outputs: z.object({ rows: z.array(z.record(z.string(), z.unknown())), report: z.object({ inputRows: z.number(), outputRows: z.number(), changes: z.array(z.string()) }) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 700000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
