import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { rows: Array<Record<string, unknown>>; question?: string };
  const keys = Object.keys(input.rows[0] ?? {});
  const x = keys[0] ?? 'x';
  const y = keys.find((key) => typeof input.rows[0]?.[key] === 'number') ?? keys[1] ?? x;
  return { vegaLiteSpec: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: input.rows }, mark: 'bar', encoding: { x: { field: x, type: 'nominal' }, y: { field: y, type: 'quantitative' } } }, insights: [`Rows analysed: ${input.rows.length}`, `Primary dimension: ${x}`], summary: input.question ?? 'Generated chart-ready analytics report.' };

}) as SkillHandler;

export default handler;
