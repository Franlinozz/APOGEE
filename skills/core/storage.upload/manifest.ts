import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'storage.upload',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'storage.upload built-in core skill.',
  inputs: z.object({text:z.string().optional(),bytes:z.instanceof(Uint8Array).optional(),encrypt:z.boolean().optional(),agentPubKey:z.string().optional()}).refine(v=>v.text||v.bytes,'text or bytes required'),
  outputs: z.object({rootHash:z.string(),txHash:z.string(),size:z.number()}),
  sideEffects: ["storage"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
