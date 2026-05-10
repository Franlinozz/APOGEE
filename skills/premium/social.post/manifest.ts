import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'social.post',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Post to X/Twitter using user OAuth tokens supplied at call time.',
  inputs: z.object({ text: z.string().min(1).max(280), oauthToken: z.string().min(1), dryRun: z.boolean().default(true) }),
  outputs: z.object({ posted: z.boolean(), provider: z.literal('x'), id: z.string().optional(), text: z.string() }),
  sideEffects: ['http'],
  declaredEgress: ['api.twitter.com', 'x.com'],
  pricePerCallWei: 1000000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
