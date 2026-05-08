import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { url: string; maxChars?: number };
  const res = await ctx.call('http.fetch', { url: input.url, maxBytes: 1048576 }) as { url?: string; status: number; text?: string };
  const text = String(res.text ?? '').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return { url: res.url ?? input.url, status: res.status, markdown: text.slice(0, input.maxChars ?? 20000) };
}) as SkillHandler;

export default handler;
