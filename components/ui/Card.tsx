"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./useReducedMotion";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** When true, the card pops in with a slight overshoot on mount. */
  popIn?: boolean;
  /** Stagger delay (s) when several cards pop in together. */
  delay?: number;
}

/**
 * Cream surface, thick ink border, hard offset shadow (.nb-card). Optionally
 * pops in with a small overshoot; reduced motion renders it instantly.
 */
export function Card({
  children,
  className = "",
  popIn = false,
  delay = 0,
}: CardProps) {
  const reduce = usePrefersReducedMotion();
  const cls = `nb-card ${className}`.trim();

  if (!popIn || reduce) {
    return <div className={cls}>{children}</div>;
  }

  return (
    <motion.div
      className={cls}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 24, delay }}
    >
      {children}
    </motion.div>
  );
}
