import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { key: string };
  return { value: await ctx.call('memory.get', [input.key]) };
}) as SkillHandler;

export default handler;
