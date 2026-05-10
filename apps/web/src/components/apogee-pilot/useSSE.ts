'use client';

import { useRef, useCallback } from 'react';
import type { SSEEvent } from './types';

export function useSSEStream() {
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    messages: { role: 'user' | 'assistant'; content: string }[],
    onEvent: (e: SSEEvent) => void,
  ): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      response = await fetch('/api/pilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: 'Cannot reach the Pilot service.' } });
      return;
    }

    if (!response.ok || !response.body) {
      onEvent({ event: 'error', data: { message: `Server error ${response.status}` } });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE messages are separated by \n\n
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = '';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: '))  dataStr  = line.slice(6);
          }
          if (!eventType || !dataStr) continue;
          try {
            const parsed: unknown = JSON.parse(dataStr);
            onEvent({ event: eventType, data: parsed } as SSEEvent);
          } catch { /* malformed event — skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ event: 'error', data: { message: 'Stream interrupted.' } });
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { stream, cancel };
}
