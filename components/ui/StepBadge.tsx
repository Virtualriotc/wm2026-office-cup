"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "./useReducedMotion";

export interface StepBadgeProps {
  /** The step number shown inside the badge. */
  n: number;
  label?: string;
  /** Stagger delay (s) for the pop-in. */
  delay?: number;
}

/**
 * Numbered yellow step badge with an ink border. Pops in with a small
 * overshoot; instant under reduced motion.
 */
export function StepBadge({ n, label, delay = 0 }: StepBadgeProps) {
  const reduce = usePrefersReducedMotion();
  return (
    <div className="flex items-center gap-3">
      <motion.span
        className="nb-step tnum"
        initial={reduce ? false : { scale: 0.5, opacity: 0 }}
        animate={reduce ? undefined : { scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18, delay }}
        aria-hidden="true"
      >
        {n}
      </motion.span>
      {label ? <span className="font-bold">{label}</span> : null}
    </div>
  );
}
