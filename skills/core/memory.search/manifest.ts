import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'memory.search',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'memory.search built-in core skill.',
  inputs: z.object({query:z.string().min(1),k:z.number().int().positive().max(25).optional()}),
  outputs: z.object({hits:z.array(z.unknown())}),
  sideEffects: ["storage","compute"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
