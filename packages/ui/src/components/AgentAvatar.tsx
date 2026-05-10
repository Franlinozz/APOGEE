import { cn } from '../lib/cn.js';

export interface AgentAvatarProps {
  agentId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PALETTE: [string, string][] = [
  ['#4F46E5', '#7C3AED'],
  ['#7C3AED', '#A855F7'],
  ['#2563EB', '#4F46E5'],
  ['#0891B2', '#2563EB'],
  ['#059669', '#10B981'],
  ['#D97706', '#F59E0B'],
  ['#DC2626', '#EF4444'],
  ['#BE185D', '#EC4899'],
];

function hashAgentId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(id: string): string {
  const clean = id.replace(/^0x/i, '');
  return clean.slice(0, 2).toUpperCase();
}

const SIZE_MAP = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };

export function AgentAvatar({ agentId, size = 'md', className }: AgentAvatarProps) {
  const pair = PALETTE[hashAgentId(agentId) % PALETTE.length] ?? PALETTE[0]!;
  const [from, to] = pair;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-mono font-semibold text-white select-none',
        SIZE_MAP[size],
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-label={`Agent ${agentId}`}
    >
      {initials(agentId)}
    </span>
  );
}
