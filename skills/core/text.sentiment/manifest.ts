import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.sentiment',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Classify sentiment with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000) }),
  outputs: z.object({ sentiment: z.enum(['positive', 'negative', 'neutral']), score: z.number().min(0).max(1) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
