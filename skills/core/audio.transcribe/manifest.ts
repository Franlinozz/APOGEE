import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'audio.transcribe',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'audio.transcribe built-in core skill.',
  inputs: z.object({audio:z.instanceof(Uint8Array).optional(),audioUrl:z.string().url().optional(),options:z.object({model:z.string().optional(),provider:z.string().optional(),sealed:z.boolean().optional()}).optional()}).refine(v=>v.audio||v.audioUrl,'audio or audioUrl required'),
  outputs: z.object({text:z.string(),segments:z.array(z.unknown())}).passthrough(),
  sideEffects: ["compute"],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
