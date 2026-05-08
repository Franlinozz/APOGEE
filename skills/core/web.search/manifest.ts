import { z } from 'zod';
import type { SkillManifest } from '@apogee/skills-runtime';

const manifest = {
  id: 'web.search',
  version: '1.0.0',
  author: { name: 'APOGEE Protocol' },
  description: 'web.search built-in core skill.',
  inputs: z.object({query:z.string().min(1),apiKey:z.string().optional(),tavilyApiKey:z.string().optional()}),
  outputs: z.object({results:z.array(z.object({title:z.string(),url:z.string(),content:z.string()})).max(5)}),
  sideEffects: ["http"],
  declaredEgress: ["api.tavily.com"],
  pricePerCallWei: 0n,
  requiresEnv: ["TAVILY_API_KEY"],
  timeoutMs: 30_000,
} satisfies SkillManifest;

export default manifest;
