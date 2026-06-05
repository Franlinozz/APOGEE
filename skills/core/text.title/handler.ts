import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Generate a short, clear title or headline for the following text.\nReturn only the title, no preamble, no commentary, and no quotation marks.\n\nTEXT:\n${input.text}` },
    ],
    maxTokens: 160,
  }]) as { content?: string; reasoning_content?: string };
  const text = String(response.content || response.reasoning_content || '').trim().replace(/^(["'“”])(.+)\1$/s, '$2').trim();
  return { title: text };
}) as SkillHandler;

export default handler;
