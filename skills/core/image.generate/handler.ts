import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { prompt: string; options?: unknown };
  const image = await ctx.call('compute.image', [input.prompt, input.options ?? {}]) as { urls?: string[]; storageRoots?: string[]; attestationDigest?: string };
  const root = image.storageRoots?.[0] ?? '';
  return { storageRoot: root, url: image.urls?.[0] ?? '', storageRoots: image.storageRoots ?? [], urls: image.urls ?? [], attestationDigest: image.attestationDigest };
}) as SkillHandler;

export default handler;
