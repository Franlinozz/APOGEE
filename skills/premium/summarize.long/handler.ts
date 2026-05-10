import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text: string; maxChunkChars: number; targetWords: number };
  const chunks = Array.from({ length: Math.ceil(input.text.length / input.maxChunkChars) }, (_, index) => input.text.slice(index * input.maxChunkChars, (index + 1) * input.maxChunkChars));
  const summaries: string[] = [];
  for (const chunk of chunks) {
    const res = await ctx.call('compute.chat', [{ messages: [{ role: 'system', content: 'Summarize this chunk concisely.' }, { role: 'user', content: chunk }] }]) as { content?: string };
    summaries.push(String(res.content ?? chunk.slice(0, 500)));
  }
  const final = await ctx.call('compute.chat', [{ messages: [{ role: 'system', content: `Combine into a ${input.targetWords}-word executive summary.` }, { role: 'user', content: summaries.join('\n---\n') }] }]) as { content?: string };
  return { summary: String(final.content ?? summaries.join('\n')), chunks: chunks.length };

}) as SkillHandler;

export default handler;
