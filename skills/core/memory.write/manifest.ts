import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'memory.write',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'memory.write built-in core skill.',
  inputs: z.object({key:z.string().min(1),value:z.unknown()}),
  outputs: z.object({rootHash:z.string(),version:z.number()}),
  sideEffects: ["storage"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
