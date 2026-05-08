import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { audio?: Uint8Array; audioUrl?: string; options?: unknown };
  return await ctx.call('compute.transcribe', [input.audioUrl ?? input.audio, input.options ?? {}]);
}) as SkillHandler;

export default handler;
