import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.summarize',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Summarize text with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000), maxWords: z.number().int().positive().max(500).default(80).optional() }),
  outputs: z.object({ summary: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
