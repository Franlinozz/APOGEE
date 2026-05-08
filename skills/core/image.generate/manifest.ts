import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'image.generate',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'image.generate built-in core skill.',
  inputs: z.object({prompt:z.string().min(1),options:z.object({size:z.string().optional(),n:z.number().int().positive().optional(),model:z.string().optional(),provider:z.string().optional(),sealed:z.boolean().optional()}).optional()}),
  outputs: z.object({storageRoot:z.string(),url:z.string(),storageRoots:z.array(z.string()),urls:z.array(z.string()),attestationDigest:z.string().optional()}),
  sideEffects: ["compute","storage"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
