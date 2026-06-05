import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.keywords',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Extract key terms and phrases with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000) }),
  outputs: z.object({ keywords: z.array(z.object({ type: z.enum(['KEYWORD', 'PHRASE']), value: z.string() })) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
