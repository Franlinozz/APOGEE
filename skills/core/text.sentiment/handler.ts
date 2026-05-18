import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string };
  const response = await ctx.call('compute.chat', [{
    messages: [
      { role: 'user', content: `Classify the sentiment of the following text. Respond with ONLY valid JSON in this exact shape — no preamble, no markdown fences, no extra fields:\n{\"sentiment\":\"positive\"|\"negative\"|\"neutral\",\"score\":<number between 0 and 1>}\n\nTEXT:\n${input.text}` },
    ],
    maxTokens: 160,
  }]) as { content?: string; reasoning_content?: string };
  const rawText = String(response.content || response.reasoning_content || '').trim();
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { sentiment?: unknown; score?: unknown };
    const sentiment = parsed.sentiment === 'positive' || parsed.sentiment === 'negative' || parsed.sentiment === 'neutral' ? parsed.sentiment : 'neutral';
    const scoreNum = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score);
    const score = Number.isFinite(scoreNum) ? Math.min(1, Math.max(0, scoreNum)) : 0.5;
    return { sentiment, score };
  } catch {
    await ctx.log('warn', 'text.sentiment.parse_fallback', { raw: rawText.slice(0, 500) });
    return { sentiment: 'neutral', score: 0.5 };
  }
}) as SkillHandler;

export default handler;
