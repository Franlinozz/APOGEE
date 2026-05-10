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
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        {/* outer ring */}
        <circle cx="15" cy="15" r="13.5" stroke="var(--color-accent, #6366f1)" strokeOpacity="0.45" strokeWidth="1" />
        {/* dashed orbit track */}
        <circle cx="15" cy="15" r="8.5" stroke="var(--color-accent, #6366f1)" strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="3 2" />
        {/* soft core glow */}
        <circle cx="15" cy="15" r="5" fill="var(--color-accent, #6366f1)" fillOpacity="0.12" />
        {/* core dot */}
        <circle cx="15" cy="15" r="3" fill="var(--color-accent, #6366f1)" />
        {/* orbiting node — simple rotate around viewBox center (15,15) */}
        <g
          className={styles.launcherOrbit}
          style={{ transformOrigin: '15px 15px' }}
        >
          <circle cx="15" cy="6.5" r="2.4" fill="var(--color-accent, #6366f1)" />
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
