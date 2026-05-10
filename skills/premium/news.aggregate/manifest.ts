import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'news.aggregate',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'RSS and news API aggregation into categorized stories.',
  inputs: z.object({ feeds: z.array(z.string().url()).default([]), query: z.string().optional(), categories: z.array(z.string()).default(['general']), limit: z.number().int().positive().max(50).default(10) }),
  outputs: z.object({ categories: z.record(z.string(), z.array(z.object({ title: z.string(), url: z.string().optional(), source: z.string().optional(), summary: z.string().optional() }))), fetchedAt: z.string() }),
  sideEffects: ['http'],
  declaredEgress: ['rss.com', 'newsapi.org'],
  pricePerCallWei: 500000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
