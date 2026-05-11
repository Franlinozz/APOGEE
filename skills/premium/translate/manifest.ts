import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'translate.text',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Translate text to/from 50 languages with a quality score via 0G chat.',
  inputs: z.object({ text: z.string().min(1), targetLanguage: z.string().min(2), sourceLanguage: z.string().optional() }),
  outputs: z.object({ translatedText: z.string(), sourceLanguage: z.string().optional(), targetLanguage: z.string(), qualityScore: z.number().min(0).max(1) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 600000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
