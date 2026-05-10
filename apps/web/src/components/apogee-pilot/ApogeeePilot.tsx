'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Launcher } from './Launcher';
import { Panel } from './Panel';
import { useSSEStream } from './useSSE';
import type { Message, SSEEvent } from './types';

interface ApogeeePilotProps {
  isGuest?: boolean;
}

const GUEST_LIMIT = 5;

export function ApogeeePilot({ isGuest = false }: ApogeeePilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [guestCount, setGuestCount] = useState(0);

  const streamBufRef = useRef('');
  const rafRef = useRef<number>(0);
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

  const { stream, cancel } = useSSEStream();

  // Cmd/Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpenRef.current) handleClose();
        else handleOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // stable — uses ref

  // Esc close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  function handleOpen() {
    setIsExiting(false);
    setIsOpen(true);
    setUnreadCount(0);
  }

  function handleClose() {
    setIsExiting(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsExiting(false);
    }, 280);
  }

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming) return;
    if (isGuest && guestCount >= GUEST_LIMIT) return;

    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    if (isGuest) setGuestCount(c => c + 1);

    setIsStreaming(true);
    setStreamingContent('');
    streamBufRef.current = '';

    const history = [...messages, userMsg].map(m => ({
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
        setMessages(prev => [
          ...prev,
          { id: `a_${Date.now()}`, role: 'assistant', content: finalContent },
        ]);
        setStreamingContent('');
        setIsStreaming(false);
        if (!isOpenRef.current) setUnreadCount(c => c + 1);
      } else if (evt.event === 'error') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        streamBufRef.current = '';
        setMessages(prev => [
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming, isGuest, guestCount, stream]);

  const handleCancel = useCallback(() => {
    cancel();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const partial = streamBufRef.current;
    streamBufRef.current = '';
    if (partial) {
      setMessages(prev => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', content: partial + ' _(cancelled)_' },
      ]);
    }
    setStreamingContent('');
    setIsStreaming(false);
  }, [cancel]);

  return (
    <>
      <Launcher
        isOpen={isOpen}
        onToggle={isOpen ? handleClose : handleOpen}
        unreadCount={unreadCount}
      />
      {isOpen && (
        <Panel
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          isGuest={isGuest}
          guestRemaining={Math.max(0, GUEST_LIMIT - guestCount)}
          isExiting={isExiting}
          onClose={handleClose}
          onMinimize={handleClose}
          onSend={handleSend}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
