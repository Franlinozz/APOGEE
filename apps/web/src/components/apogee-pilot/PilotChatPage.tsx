'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { ChatMessage } from './ChatMessage';
import { usePilotChat } from './usePilotChat';
import styles from './pilot.module.css';

const QUICK_REPLIES = [
  'Explain receipts',
  'What is an iNFT?',
  'How does the policy engine work?',
  'Show me a sample agent flow',
];

export function PilotChatPage({ isGuest = false }: { isGuest?: boolean }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, isStreaming, streamingContent, guestRemaining, send, cancel } = usePilotChat({ isGuest, guestLimit: 5 });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingContent]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isStreaming) cancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cancel, isStreaming]);

  function submit(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || (isGuest && guestRemaining === 0)) return;
    void send(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKey(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-[720px] flex-col px-4 py-5 sm:px-6">
      <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface/80 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar isStreaming={isStreaming} size={40} />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-fg">Apogee Pilot</h2>
            <p className="text-sm text-fg-muted">Your guide to Apogee, powered by 0G Compute</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface shadow-sm">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5" aria-live="polite" aria-atomic="false" aria-label="Apogee Pilot conversation">
          {messages.length === 0 && !isStreaming && (
            <div className="flex min-h-full flex-col items-center justify-center gap-3 text-center">
              <Avatar isStreaming={false} size={60} />
              <div>
                <p className="text-base font-semibold text-fg">Ask Apogee Pilot</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
                  Get concise technical answers about agents, receipts, iNFT identity, policies, memory, and the 0G stack.
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isStreaming && streamingContent === '' && (
            <div className="flex items-center gap-1 px-1" role="status" aria-label="Thinking">
              {[0, 1, 2].map((index) => (
                <span key={index} className={styles.thinkingDot} style={{ animationDelay: `${index * 180}ms` }} />
              ))}
            </div>
          )}

          {isStreaming && streamingContent !== '' && (
            <ChatMessage message={{ id: '__streaming__', role: 'assistant', content: streamingContent, isStreaming: true }} />
          )}

          <div ref={messagesEndRef} />
        </div>

        {messages.length === 0 && !isStreaming && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--color-line)] px-4 py-3">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => submit(reply)}
                className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {isGuest && guestRemaining === 0 && (
          <div className="border-t border-[var(--color-line)] bg-accent/5 px-4 py-3 text-center text-xs text-fg-muted">
            Guest limit reached. <a href="/connect" className="font-semibold text-accent hover:underline">Sign in</a> for unlimited messages.
          </div>
        )}

        <div className="sticky bottom-0 flex shrink-0 items-end gap-2 border-t border-[var(--color-line)] bg-surface p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Apogee Pilot… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={isStreaming || (isGuest && guestRemaining === 0)}
            className="min-h-10 flex-1 resize-none rounded-[var(--radius)] bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-40"
            style={{ maxHeight: 144 }}
          />
          {isStreaming ? (
            <button
              onClick={cancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--color-line)] text-fg-muted transition-colors hover:border-danger/40 hover:text-danger"
              aria-label="Cancel response"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!input.trim() || (isGuest && guestRemaining === 0)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-35"
              aria-label="Send message"
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
