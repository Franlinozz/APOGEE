'use client';

import { motion } from '@apogee/ui';

interface InViewRevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
  as?: 'div' | 'li' | 'section' | 'article';
}

const TAGS = {
  div:     motion.div,
  li:      motion.li,
  section: motion.section,
  article: motion.article,
} as const;

export function InViewReveal({ children, delay = 0, className, y = 16, as: Tag = 'div' }: InViewRevealProps) {
  const Component = TAGS[Tag];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
    >
      {children}
    </Component>
  );
}
