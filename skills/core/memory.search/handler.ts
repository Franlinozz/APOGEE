import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { query: string; k?: number };
  return { hits: await ctx.call('memory.search', [input.query, input.k ?? 5]) };
}) as SkillHandler;

export default handler;
