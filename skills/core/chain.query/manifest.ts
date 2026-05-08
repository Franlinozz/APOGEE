import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'chain.query',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'chain.query built-in core skill.',
  inputs: z.object({to:z.string(),abi:z.array(z.string()),functionName:z.string(),args:z.array(z.unknown()).optional()}),
  outputs: z.object({result:z.unknown()}),
  sideEffects: ["chain"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
