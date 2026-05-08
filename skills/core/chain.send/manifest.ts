import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'chain.send',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'chain.send built-in core skill.',
  inputs: z.object({agentAccount:z.string(),target:z.string(),value:z.union([z.bigint(),z.string()]).optional(),data:z.string().optional()}),
  outputs: z.object({hash:z.string().nullable().optional()}).passthrough(),
  sideEffects: ["chain"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
