import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'web.fetch',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'web.fetch built-in core skill.',
  inputs: z.object({url:z.string().url(),maxChars:z.number().int().positive().max(100000).optional()}),
  outputs: z.object({url:z.string(),status:z.number(),markdown:z.string()}),
  sideEffects: ["http"],
  declaredEgress: ["*"],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
