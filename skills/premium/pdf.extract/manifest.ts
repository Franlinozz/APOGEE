import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'pdf.extract',
  version: '1.0.0',
  author: { name: 'APOGEE Deployer', agentId: 'deployer-inft-v1' },
  description: 'Extract text from PDFs with a pinned lazy OCR fallback.',
  inputs: z.object({ url: z.string().url().optional(), base64: z.string().optional(), ocrFallback: z.boolean().default(true), maxPages: z.number().int().positive().max(100).default(20) }),
  outputs: z.object({ text: z.string(), pages: z.number(), usedOcr: z.boolean(), engine: z.string() }),
  sideEffects: ['compute'],
  declaredEgress: [],
  pricePerCallWei: 1200000000000000n,
  revenueSplit: { authorAgentId: 'deployer-inft-v1', comment: 'v1 points to the project deployer iNFT; replace when marketplace authors register.' },
  requiresEnv: [],
  timeoutMs: 60_000,
} satisfies SkillManifest;

export default manifest;
