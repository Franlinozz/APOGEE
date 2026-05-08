import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string | string[]; options?: unknown };
  return { embeddings: await ctx.call('compute.embed', [input.text, input.options ?? {}]) };
}) as SkillHandler;

export default handler;
