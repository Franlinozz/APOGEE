'use client';

import styles from './pilot.module.css';

interface AvatarProps {
  isStreaming: boolean;
  size?: number;
}

export function Avatar({ isStreaming, size = 40 }: AvatarProps) {
  const r = size / 2;
  const orbitR = r * 0.65;
  const nodeR = r * 0.13;
  const coreR = r * 0.2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Subtle glow ring */}
      <circle cx={r} cy={r} r={r - 1} stroke="var(--color-accent)" strokeOpacity="0.12" strokeWidth="1.5" />
      {/* Dashed orbit path */}
      <circle cx={r} cy={r} r={orbitR} stroke="var(--color-accent)" strokeOpacity="0.3" strokeWidth="0.75" strokeDasharray="3 2" />
      {/* Core dot */}
      <circle cx={r} cy={r} r={coreR} fill="var(--color-accent)" />
      {/* Orbiting node — speed controlled via CSS variable */}
      <g
        className={styles.orbitNode}
        style={
          { '--orbit-duration': isStreaming ? '1.1s' : '3s', transformOrigin: `${r}px ${r}px` } as React.CSSProperties
        }
      >
        <circle cx={r} cy={r - orbitR} r={nodeR} fill="var(--color-accent)" />
      </g>
    </svg>
  );
}
