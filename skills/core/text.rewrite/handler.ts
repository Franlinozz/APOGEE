import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Rewrite the following text to be clearer and more formal while preserving the original meaning.\nReturn only the rewritten text, no preamble or commentary.\n\nTEXT:\n${input.text}` },
    ],
  }]) as { content?: string; reasoning_content?: string };
  const text = String(response.content || response.reasoning_content || '').trim().replace(/^(["'“”])(.+)\1$/s, '$2').trim();
  return { rewrite: text };
}) as SkillHandler;

export default handler;
