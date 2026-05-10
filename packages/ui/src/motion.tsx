'use client';

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { type ReactNode } from 'react';

/* All durations ≤ 600ms, gate animations on prefers-reduced-motion */
const REDUCED = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

function dur(ms: number): number {
  return REDUCED ? 0 : ms;
}

/* ── Fade ───────────────────────────────────────────────── */
const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: dur(0.25), ease: 'easeOut' } },
  exit:   { opacity: 0, transition: { duration: dur(0.15) } },
};

export interface FadeProps {
  children: ReactNode;
  className?: string;
}

export function Fade({ children, className }: FadeProps) {
  return (
    <motion.div
      className={className}
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/* ── RiseIn ─────────────────────────────────────────────── */
const riseVariants: Variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: dur(0.4), ease: [0.19, 1, 0.22, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: dur(0.2) } },
};

export function RiseIn({ children, className }: FadeProps) {
  return (
    <motion.div
      className={className}
      variants={riseVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/* ── StaggeredChildren ──────────────────────────────────── */
export interface StaggeredChildrenProps {
  children: ReactNode;
  stagger?: number;
  className?: string;
}

export function StaggeredChildren({ children, stagger = 0.07, className }: StaggeredChildrenProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: REDUCED ? 0 : stagger, delayChildren: 0 },
    },
  };
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/* Convenience re-export so callers import from one place */
export { AnimatePresence, motion };
