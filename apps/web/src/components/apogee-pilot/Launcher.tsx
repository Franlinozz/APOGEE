'use client';

import styles from './pilot.module.css';

interface LauncherProps {
  isOpen: boolean;
  onToggle: () => void;
  unreadCount: number;
}

export function Launcher({ isOpen, onToggle, unreadCount }: LauncherProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={isOpen ? 'Close Apogee Pilot' : 'Open Apogee Pilot (Cmd+K)'}
      aria-expanded={isOpen}
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full
        border border-accent/40 backdrop-blur-sm
        transition-transform duration-200 hover:scale-105 active:scale-95
        ${isOpen ? 'scale-105' : styles.launcher}`}
      style={{ background: 'linear-gradient(145deg, #0c0e22 0%, #12153a 100%)' }}
    >
      {/*
        --color-accent is stored as raw RGB channels ("124 95 241"), not a full color.
        SVG presentation attributes don't process rgb(var(...)), so we set `color` on
        the SVG element and reference it via `currentColor` inside every shape.
      */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        style={{ color: 'rgb(var(--color-accent, 124 95 241))' }}
      >
        {/* speech bubble body */}
        <path
          d="M4 6C4 4.895 4.895 4 6 4H22C23.105 4 24 4.895 24 6V17C24 18.105 23.105 19 22 19H16L11 24V19H6C4.895 19 4 18.105 4 17V6Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* three dots — AI thinking indicator */}
        <circle cx="10" cy="12.5" r="1.3" fill="currentColor" />
        <circle cx="14" cy="12.5" r="1.3" fill="currentColor" fillOpacity="0.7" />
        <circle cx="18" cy="12.5" r="1.3" fill="currentColor" fillOpacity="0.4" />
      </svg>

      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
          className="absolute top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
