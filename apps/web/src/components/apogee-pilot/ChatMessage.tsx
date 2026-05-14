'use client';

import styles from './pilot.module.css';
import type { Message } from './types';

function renderInline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code style="background:rgb(var(--color-elevated));border-radius:3px;padding:1px 4px;font-size:0.78em;font-family:var(--font-mono)">$1</code>');
}

function parseContent(text: string): React.ReactNode[] {
  // Split on fenced code blocks first
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('```')) {
      const firstNewline = seg.indexOf('\n');
      const code = firstNewline >= 0 ? seg.slice(firstNewline + 1).replace(/```$/, '') : seg.slice(3).replace(/```$/, '');
      return (
        <pre
          key={i}
          style={{
            background: 'rgb(var(--color-elevated))',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            overflowX: 'auto',
            margin: '6px 0',
            lineHeight: 1.5,
            whiteSpace: 'pre',
          }}
        >
          <code>{code}</code>
        </pre>
      );
    }

    // Split on double newlines → paragraphs
    const lines = seg.split('\n');
    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        nodes.push(
          <ul key={`ul-${nodes.length}`} style={{ margin: '4px 0 4px 12px', paddingLeft: 8 }}>
            {listItems.map((li, j) => (
              <li key={j} style={{ fontSize: '0.8125rem', lineHeight: 1.55, listStyleType: 'disc', marginBottom: 2 }}
                dangerouslySetInnerHTML={{ __html: renderInline(li) }}
              />
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, j) => {
      if (/^[-*] /.test(line)) {
        listItems.push(line.slice(2));
        return;
      }
      if (/^\d+\. /.test(line)) {
        listItems.push(line.replace(/^\d+\. /, ''));
        return;
      }
      flushList();

      // Table header separator — skip
      if (/^\|[-| :]+\|$/.test(line)) return;

      // Table row
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        nodes.push(
          <div key={`tr-${j}`} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', lineHeight: 1.5, borderBottom: '1px solid var(--color-line)', padding: '2px 0' }}>
            {cells.map((c, k) => (
              <span key={k} style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: renderInline(c) }} />
            ))}
          </div>
        );
        return;
      }

      if (!line.trim()) {
        nodes.push(<div key={`br-${j}`} style={{ height: 6 }} />);
        return;
      }

      nodes.push(
        <p key={`p-${j}`} style={{ fontSize: '0.8125rem', lineHeight: 1.6, margin: '2px 0' }}
          dangerouslySetInnerHTML={{ __html: renderInline(line) }}
        />
      );
    });
    flushList();
    return <div key={i}>{nodes}</div>;
  });
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          style={{
            background: 'rgb(var(--color-accent))',
            color: '#fff',
            borderRadius: '12px 12px 2px 12px',
            padding: '8px 12px',
            maxWidth: '85%',
            fontSize: '0.8125rem',
            lineHeight: 1.55,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgb(var(--color-accent))', marginTop: 6 }} />
      </div>
      <div
        style={{ flex: 1, color: 'rgb(var(--color-fg))', wordBreak: 'break-word' }}
        className={message.isStreaming ? styles.streamCaret : ''}
      >
        {parseContent(message.content)}
      </div>
    </div>
  );
}
