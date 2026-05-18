import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { code: string; language?: string };
  const language = input.language || 'code';
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Review the following ${language} for bugs, style issues, and clarity. Return a concise review as 3 to 6 bullet points, each one sentence. No preamble.\n\nCODE:\n${input.code}` },
    ],
    maxTokens: 700,
  }]) as { content?: string; reasoning_content?: string };
  return { review: String(response.content || response.reasoning_content || '').trim() };
}) as SkillHandler;

export default handler;
