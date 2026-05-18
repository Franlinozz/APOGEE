import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string; maxWords?: number };
  const maxWords = input.maxWords ?? 80;
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Summarize the following in ${maxWords} words or fewer.\nReturn only the summary text, no preamble or commentary.\n\nTEXT:\n${input.text}` },
    ],
    maxTokens: Math.max(64, Math.min(512, maxWords * 3)),
  }]) as { content?: string; reasoning_content?: string };
  const text = String(response.content || response.reasoning_content || '').trim().replace(/^(["'“”])(.+)\1$/s, '$2').trim();
  return { summary: text };
}) as SkillHandler;

export default handler;
