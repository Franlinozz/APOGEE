import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'analytics.report',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Create Vega-Lite chart specs and insights JSON from a dataset.',
  inputs: z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1), question: z.string().optional() }),
  outputs: z.object({ vegaLiteSpec: z.record(z.string(), z.unknown()), insights: z.array(z.string()), summary: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 1400000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
