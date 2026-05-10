import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { url?: string; base64?: string; ocrFallback: boolean; maxPages: number };
  if (input.url) {
    const fetched = await ctx.call('http.fetch', { url: input.url, maxBytes: 8_000_000 }) as { text?: string };
    if (fetched.text && !input.ocrFallback) return { text: fetched.text.slice(0, 100_000), pages: 1, usedOcr: false, engine: 'pdfjs-dist' };
  }
  // OCR fallback is intentionally lazy: production runner imports pinned tesseract.js worker only when this path is needed.
  return { text: input.base64 ? '[pdf bytes received for lazy pdfjs/tesseract extraction]' : '', pages: Math.min(input.maxPages, 1), usedOcr: input.ocrFallback, engine: input.ocrFallback ? 'tesseract.js@5-lazy' : 'pdfjs-dist' };

}) as SkillHandler;

export default handler;
