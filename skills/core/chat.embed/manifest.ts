import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'chat.embed',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'chat.embed built-in core skill.',
  inputs: z.object({text:z.union([z.string(),z.array(z.string()).min(1)]),options:z.object({model:z.string().optional(),provider:z.string().optional(),sealed:z.boolean().optional()}).optional()}),
  outputs: z.object({embeddings:z.array(z.array(z.number()))}),
  sideEffects: ["compute"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
