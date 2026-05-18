import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Extract named entities from the following text. Respond with ONLY valid JSON in this exact shape — no preamble, no markdown fences, no extra fields:\n{\"entities\":[{\"type\":\"PERSON\"|\"PLACE\"|\"ORG\"|\"OTHER\",\"value\":\"<string>\"}]}\n\nIf no entities are found, return {\"entities\":[]}.\n\nTEXT:\n${input.text}` },
    ],
    maxTokens: 400,
  }]) as { content?: string; reasoning_content?: string };
  const rawText = String(response.content || response.reasoning_content || '').trim();
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { entities?: unknown };
    const allowed = new Set(['PERSON', 'PLACE', 'ORG', 'OTHER']);
    const entities = Array.isArray(parsed.entities) ? parsed.entities.flatMap((entry) => {
      const item = entry as { type?: unknown; value?: unknown };
      if (!allowed.has(String(item.type)) || typeof item.value !== 'string' || item.value.trim().length === 0) return [];
      return [{ type: String(item.type) as 'PERSON' | 'PLACE' | 'ORG' | 'OTHER', value: item.value.trim() }];
    }) : [];
    return { entities };
  } catch {
    await ctx.log('warn', 'text.entities.parse_fallback', { raw: rawText.slice(0, 500) });
    return { entities: [] };
  }
}) as SkillHandler;

export default handler;
