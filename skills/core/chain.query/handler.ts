import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  return await ctx.call('chain.query', [raw]);
}) as SkillHandler;

export default handler;
