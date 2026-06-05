import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Extract the key terms and short phrases from the following text. Respond with ONLY valid JSON in this exact shape — no preamble, no markdown fences, no extra fields:\n{\"keywords\":[{\"type\":\"KEYWORD\"|\"PHRASE\",\"value\":\"<string>\"}]}\n\nIf no keywords are found, return {\"keywords\":[]}.\n\nTEXT:\n${input.text}` },
    ],
    maxTokens: 400,
  }]) as { content?: string; reasoning_content?: string };
  const rawText = String(response.content || response.reasoning_content || '').trim();
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { keywords?: unknown };
    const allowed = new Set(['KEYWORD', 'PHRASE']);
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.flatMap((entry) => {
      const item = entry as { type?: unknown; value?: unknown };
      if (!allowed.has(String(item.type)) || typeof item.value !== 'string' || item.value.trim().length === 0) return [];
      return [{ type: String(item.type) as 'KEYWORD' | 'PHRASE', value: item.value.trim() }];
    }) : [];
    return { keywords };
  } catch {
    await ctx.log('warn', 'text.keywords.parse_fallback', { raw: rawText.slice(0, 500) });
    return { keywords: [] };
  }
}) as SkillHandler;

export default handler;
