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
      aria-label={isOpen ? 'Close Apogee Pilot' : 'Open Apogee Pilot'}
      aria-expanded={isOpen}
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full
        transition-all duration-200 hover:scale-105 active:scale-95
        ${isOpen ? 'scale-105' : styles.launcher}`}
      style={{ background: 'linear-gradient(145deg, #9d7ef8 0%, #7c5ff1 50%, #5c3fd4 100%)' }}
    >
      {/* Single clean chat bubble — white on violet */}
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11 2C6.03 2 2 5.582 2 10c0 1.9.72 3.645 1.918 5.015L3 19.5l4.568-1.423A9.59 9.59 0 0 0 11 18.5c4.97 0 9-3.582 9-8s-4.03-8-9-8Z"
          fill="white"
          fillOpacity="0.92"
        />
      </svg>

      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
          className="absolute top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-accent"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
