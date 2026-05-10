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
        bg-bg border border-accent/50 shadow-lg shadow-accent/10 backdrop-blur-md
        transition-transform duration-200 hover:scale-105 active:scale-95
        ${isOpen ? 'scale-105' : styles.launcher}`}
    >
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <circle cx="15" cy="15" r="14" stroke="var(--color-accent)" strokeOpacity="0.15" strokeWidth="1" />
        <circle cx="15" cy="15" r="9" stroke="var(--color-accent)" strokeOpacity="0.3" strokeWidth="0.75" strokeDasharray="3 2.5" />
        <circle cx="15" cy="15" r="2.8" fill="var(--color-accent)" />
        <g className={styles.launcherOrbit}>
          <circle cx="15" cy="6" r="2.2" fill="var(--color-accent)" />
        </g>
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
