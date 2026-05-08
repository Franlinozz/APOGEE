import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { key: string; value: unknown };
  return await ctx.call('memory.set', [input.key, input.value]);
}) as SkillHandler;

export default handler;
