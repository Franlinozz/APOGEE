import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { diff: string; focus: string[] };
  const response = await ctx.call('compute.chat', [{ messages: [{ role: 'system', content: 'Return JSON with summary and findings for a code review.' }, { role: 'user', content: `Focus: ${input.focus.join(', ')}\nDiff:\n${input.diff}` }] }]) as { content?: string };
  try { return JSON.parse(String(response.content ?? '{}')); } catch { return { summary: String(response.content ?? 'Review completed.'), findings: [] }; }

}) as SkillHandler;

export default handler;
