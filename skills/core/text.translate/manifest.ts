import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.translate',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Translate text with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000), targetLanguage: z.string().min(1).max(80) }),
  outputs: z.object({ translation: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
