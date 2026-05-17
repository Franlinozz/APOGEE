'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Launcher } from './Launcher';
import { Panel } from './Panel';
import { usePilotChat } from './usePilotChat';

interface ApogeeePilotProps {
  isGuest?: boolean;
}

const GUEST_LIMIT = 5;

export function ApogeeePilot({ isGuest = false }: ApogeeePilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousAssistantCountRef = useRef(0);
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

  const { messages, isStreaming, streamingContent, guestRemaining, send, cancel } = usePilotChat({ isGuest, guestLimit: GUEST_LIMIT });

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

  useEffect(() => {
    const assistantCount = messages.filter((message) => message.role === 'assistant').length;
    if (assistantCount > previousAssistantCountRef.current && !isOpenRef.current) setUnreadCount(c => c + 1);
    previousAssistantCountRef.current = assistantCount;
  }, [messages]);

  const handleSend = useCallback((text: string) => {
    void send(text);
  }, [send]);

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  return (
    <>
      <Launcher
        isOpen={isOpen}
        onToggle={isOpen ? handleClose : handleOpen}
        unreadCount={unreadCount}
      />
      {isOpen && (
        <>
          {/* Soft bokeh glow behind the panel — desktop only, purely decorative */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed bottom-0 right-0 hidden sm:block"
            style={{
              width: 520,
              height: 700,
              background:
                'radial-gradient(ellipse at 78% 88%, rgba(99,102,241,0.14) 0%, rgba(99,102,241,0.05) 42%, transparent 65%)',
              filter: 'blur(64px)',
              zIndex: 49,
            }}
          />
          <Panel
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            isGuest={isGuest}
            guestRemaining={guestRemaining}
            isExiting={isExiting}
            onClose={handleClose}
            onMinimize={handleClose}
            onSend={handleSend}
            onCancel={handleCancel}
          />
        </>
      )}
    </>
  );
}
