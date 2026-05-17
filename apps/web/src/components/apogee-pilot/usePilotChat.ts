'use client';

import { useCallback, useRef, useState } from 'react';
import { useSSEStream } from './useSSE';
import type { Message, SSEEvent } from './types';

interface UsePilotChatOptions {
  isGuest?: boolean;
  guestLimit?: number;
}

export function usePilotChat({ isGuest = false, guestLimit = 5 }: UsePilotChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [guestCount, setGuestCount] = useState(0);

  const streamBufRef = useRef('');
  const rafRef = useRef<number>(0);
  const messagesRef = useRef<Message[]>([]);
  const { stream, cancel } = useSSEStream();

  const updateMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    setMessages(prev => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    if (isGuest && guestCount >= guestLimit) return;

    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', content: trimmed };
    const nextMessages = [...messagesRef.current, userMsg];
    updateMessages(() => nextMessages);
    if (isGuest) setGuestCount(c => c + 1);

    setIsStreaming(true);
    setStreamingContent('');
    streamBufRef.current = '';

    const history = nextMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await stream(history, (evt: SSEEvent) => {
      if (evt.event === 'token') {
        streamBufRef.current += evt.data;
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            setStreamingContent(streamBufRef.current);
            rafRef.current = 0;
          });
        }
      } else if (evt.event === 'done') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        const finalContent = streamBufRef.current;
        streamBufRef.current = '';
        updateMessages(prev => [
          ...prev,
          { id: `a_${Date.now()}`, role: 'assistant', content: finalContent },
        ]);
        setStreamingContent('');
        setIsStreaming(false);
      } else if (evt.event === 'error') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        streamBufRef.current = '';
        updateMessages(prev => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: 'assistant',
            content: `⚠ ${(evt.data as { message: string }).message}`,
          },
        ]);
        setStreamingContent('');
        setIsStreaming(false);
      }
    });
  }, [guestCount, guestLimit, isGuest, isStreaming, stream, updateMessages]);

  const cancelStreaming = useCallback(() => {
    cancel();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const partial = streamBufRef.current;
    streamBufRef.current = '';
    if (partial) {
      updateMessages(prev => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', content: `${partial} _(cancelled)_` },
      ]);
    }
    setStreamingContent('');
    setIsStreaming(false);
  }, [cancel, updateMessages]);

  return {
    messages,
    isStreaming,
    streamingContent,
    guestCount,
    guestRemaining: Math.max(0, guestLimit - guestCount),
    send,
    cancel: cancelStreaming,
  };
}
