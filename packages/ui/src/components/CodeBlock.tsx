import { codeToHtml } from 'shiki';
import { cn } from '../lib/cn.js';

export interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
}

/*
 * Server component — shiki runs on the server, zero client JS.
 * Only use with trusted code strings (no user-supplied content without sanitization).
 */
export async function CodeBlock({ code, lang = 'typescript', className }: CodeBlockProps) {
  const html = await codeToHtml(code.trim(), {
    lang,
    theme: 'github-dark-dimmed',
  });

  return (
    <div
      className={cn(
        'overflow-auto rounded-[var(--radius-lg)] border border-DEFAULT bg-[#1c2128]',
        '[&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed [&_code]:font-mono',
        className,
      )}
      /* shiki output contains only element nodes with inline styles, no scripts */
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
