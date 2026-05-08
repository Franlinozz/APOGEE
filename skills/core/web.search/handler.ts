import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { query: string };
  const res = await ctx.call('http.fetch', { url: 'https://api.tavily.com/search?q=' + encodeURIComponent(input.query), maxBytes: 1048576 }) as { text?: string };
  let data: unknown;
  try { data = JSON.parse(String(res.text ?? '{}')); } catch { data = { results: [] }; }
  const record = (typeof data === 'object' && data !== null ? data : { results: [] }) as { results?: Array<{ title?: unknown; url?: unknown; content?: unknown; snippet?: unknown }> };
  const results = (record.results ?? []).slice(0, 5).map((r) => ({ title: String(r.title ?? ''), url: String(r.url ?? ''), content: String(r.content ?? r.snippet ?? '') }));
  return { results };
}) as SkillHandler;

export default handler;
