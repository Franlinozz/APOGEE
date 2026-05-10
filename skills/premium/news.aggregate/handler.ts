import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { feeds: string[]; query?: string; categories: string[]; limit: number };
  const items: Array<{ title: string; url?: string; source?: string; summary?: string }> = [];
  for (const feed of input.feeds.slice(0, 5)) {
    const res = await ctx.call('http.fetch', { url: feed, maxBytes: 500_000 }) as { text?: string; url?: string };
    const text = String(res.text ?? '');
    const titles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi)].slice(1, input.limit + 1);
    for (const match of titles) items.push({ title: String(match[1] ?? match[2] ?? '').trim(), source: new URL(feed).hostname, url: res.url ?? feed });
  }
  if (items.length === 0 && input.query) items.push({ title: input.query, summary: 'No live feed supplied; query captured for upstream news API routing.' });
  const categories: Record<string, typeof items> = {};
  for (const cat of input.categories) categories[cat] = [];
  for (const item of items.slice(0, input.limit)) (categories[input.categories[0] ?? 'general'] ??= []).push(item);
  return { categories, fetchedAt: new Date().toISOString() };

}) as SkillHandler;

export default handler;
