'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './pilot.module.css';
import { Avatar } from './Avatar';
import { ChatMessage } from './ChatMessage';
import type { Message } from './types';

const QUICK_REPLIES = [
  'Deploy my first agent',
  'Explain receipts',
  'Show me a demo run',
  'Why did my agent stop?',
  'Estimate monthly cost',
];

interface PanelProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  isGuest: boolean;
  guestRemaining: number;
  isExiting: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
}

export function Panel({
  messages, isStreaming, streamingContent, isGuest, guestRemaining,
  isExiting, onClose, onMinimize, onSend, onCancel,
}: PanelProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  // Auto-resize textarea (1–6 lines)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  }, [input]);

  // Focus trap + initial focus
  useEffect(() => {
    textareaRef.current?.focus();
    const panel = panelRef.current;
    if (!panel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener('keydown', handler);
    return () => panel.removeEventListener('keydown', handler);
  }, []);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  const statusText = isStreaming
    ? 'Thinking…'
    : isGuest
    ? `Guest · ${guestRemaining} message${guestRemaining !== 1 ? 's' : ''} left`
    : 'Ready';

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 z-40 bg-black/40 sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Apogee Pilot"
        aria-modal="true"
        className={`
          fixed z-50 flex flex-col overflow-hidden
          border
          inset-0
          sm:inset-auto sm:bottom-[88px] sm:right-6 sm:w-[390px] sm:h-[560px] sm:rounded-2xl
          ${isExiting ? styles.panelExit : styles.panel}
        `}
        style={{
          background: 'rgba(8, 10, 22, 0.92)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          borderColor: 'rgba(255,255,255,0.07)',
          boxShadow: [
            '0 32px 80px -8px rgba(0,0,0,0.80)',
            '0 0 0 1px rgba(99,102,241,0.10)',
            'inset 0 1px 0 rgba(255,255,255,0.05)',
          ].join(','),
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <Avatar isStreaming={isStreaming} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg leading-none">Apogee Pilot</p>
            <p className="mt-0.5 truncate text-xs text-fg-muted">{statusText}</p>
          </div>
          <button
            onClick={onMinimize}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-elevated text-fg-muted hover:text-fg transition-colors"
            aria-label="Minimise"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-elevated text-fg-muted hover:text-fg transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 space-y-4 overflow-y-auto p-4"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Conversation"
        >
          {messages.length === 0 && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Avatar isStreaming={false} size={52} />
              <p className="text-sm font-semibold text-fg">How can I help?</p>
              <p className="max-w-[220px] text-xs text-fg-muted">
                Ask me about agents, receipts, memory, or costs.
              </p>
            </div>
          )}

          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Thinking dots — before first token */}
          {isStreaming && streamingContent === '' && (
            <div className="flex items-center gap-1 px-1" role="status" aria-label="Thinking">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className={styles.thinkingDot}
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
          )}

          {/* Streaming content with caret */}
          {isStreaming && streamingContent !== '' && (
            <ChatMessage
              message={{ id: '__streaming__', role: 'assistant', content: streamingContent, isStreaming: true }}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick-reply chips — shown only on empty conversation */}
        {messages.length === 0 && !isStreaming && (
          <div className="shrink-0 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_REPLIES.map(q => (
              <button
                key={q}
                onClick={() => onSend(q)}
                className="shrink-0 whitespace-nowrap rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Guest upgrade prompt */}
        {isGuest && guestRemaining === 0 && (
          <div className="shrink-0 border-t border-[var(--color-line)] bg-accent/5 px-4 py-3 text-center">
            <p className="text-xs text-fg-muted">
              Guest limit reached.{' '}
              <a href="/connect" className="font-semibold text-accent hover:underline">
                Sign in
              </a>{' '}
              for unlimited messages.
            </p>
          </div>
        )}

        {/* Input footer */}
        <div className="shrink-0 flex items-end gap-2 border-t border-[var(--color-line)] p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Apogee Pilot… (Enter to send)"
            rows={1}
            disabled={isStreaming || (isGuest && guestRemaining === 0)}
            className="flex-1 resize-none rounded-[var(--radius)] bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-40"
            style={{ minHeight: 36, maxHeight: 144 }}
          />
          {isStreaming ? (
            <button
              onClick={onCancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--color-line)] text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
              aria-label="Cancel response"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim() || (isGuest && guestRemaining === 0)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-35"
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
