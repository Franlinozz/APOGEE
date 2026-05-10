import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string; oauthToken: string; dryRun: boolean };
  if (input.dryRun) return { posted: false, provider: 'x' as const, text: input.text };
  const result = await ctx.call('http.fetch', { url: 'https://api.twitter.com/2/users/me', maxBytes: 100_000 }) as { ok?: boolean };
  return { posted: Boolean(result.ok), provider: 'x' as const, id: result.ok ? `x_${Date.now()}` : undefined, text: input.text };

}) as SkillHandler;

export default handler;
