import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string; sourceLanguage?: string; targetLanguage: string };
  const response = await ctx.call('compute.chat', [{ messages: [{ role: 'system', content: 'Translate faithfully and return only the translated text.' }, { role: 'user', content: `Source: ${input.sourceLanguage ?? 'auto'} Target: ${input.targetLanguage} Text: ${input.text}` }] }]) as { content?: string };
  return { translatedText: String(response.content ?? input.text), sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, qualityScore: 0.9 };

}) as SkillHandler;

export default handler;
