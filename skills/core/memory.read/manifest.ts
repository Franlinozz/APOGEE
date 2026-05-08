import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'memory.read',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'memory.read built-in core skill.',
  inputs: z.object({key:z.string().min(1)}),
  outputs: z.object({value:z.unknown().nullable()}),
  sideEffects: ["storage"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
