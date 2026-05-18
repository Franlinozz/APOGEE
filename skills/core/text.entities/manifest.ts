import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'text.entities',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'Extract named entities with 0G Compute.',
  inputs: z.object({ text: z.string().min(1).max(10_000) }),
  outputs: z.object({ entities: z.array(z.object({ type: z.enum(['PERSON', 'PLACE', 'ORG', 'OTHER']), value: z.string() })) }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
