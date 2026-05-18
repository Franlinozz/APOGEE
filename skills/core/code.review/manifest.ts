import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'code.review',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Review code with 0G Compute.',
  inputs: z.object({ code: z.string().min(1).max(15_000), language: z.string().min(1).max(80).default('code').optional() }),
  outputs: z.object({ review: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
