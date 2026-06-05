import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.rewrite',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Rewrite text clearly and formally with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000) }),
  outputs: z.object({ rewrite: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
