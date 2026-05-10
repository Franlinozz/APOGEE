import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { data: string | Array<Record<string, unknown>>; format?: 'csv' | 'json' };
  let rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(input.data)) rows = input.data;
  else if ((input.format ?? 'csv') === 'json') rows = JSON.parse(input.data) as Array<Record<string, unknown>>;
  else {
    const [head = '', ...lines] = input.data.trim().split(/\r?\n/);
    const keys = head.split(',').map((key) => key.trim());
    rows = lines.map((line) => Object.fromEntries(line.split(',').map((cell, index) => [keys[index] ?? `col_${index}`, cell.trim()])));
  }
  const cleaned = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, '_'), typeof value === 'string' ? value.trim() : value])));
  return { rows: cleaned, report: { inputRows: rows.length, outputRows: cleaned.length, changes: ['normalized headers', 'trimmed string cells'] } };

}) as SkillHandler;

export default handler;
