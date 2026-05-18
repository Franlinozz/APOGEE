import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string; targetLanguage: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Translate the following text to ${input.targetLanguage}.\nReturn only the translation, no preamble or commentary, no parenthetical notes.\n\nTEXT:\n${input.text}` },
    ],
  }]) as { content?: string; reasoning_content?: string };
  const text = String(response.content || response.reasoning_content || '').trim().replace(/^(["'“”])(.+)\1$/s, '$2').trim();
  return { translation: text };
}) as SkillHandler;

export default handler;
