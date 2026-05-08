import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'chat.completion',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'chat.completion built-in core skill.',
  inputs: z.object({messages:z.array(z.object({role:z.enum(['system','user','assistant','tool']),content:z.string()})).min(1),model:z.string().optional(),stream:z.boolean().optional(),sealed:z.boolean().optional(),provider:z.string().optional(),temperature:z.number().optional(),maxTokens:z.number().int().positive().optional()}),
  outputs: z.union([z.object({content:z.string()}).passthrough(), z.unknown()]),
  sideEffects: ["compute"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
