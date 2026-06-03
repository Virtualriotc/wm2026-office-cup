"use client";

import { useReducedMotion as useMotionReducedMotion } from "motion/react";

/**
 * Thin re-export so components import reduced-motion state from one place.
 * Motion's hook reads the OS `prefers-reduced-motion` media query and updates
 * reactively. Components branch on this to drop springs/overshoot to instant.
 */
export function usePrefersReducedMotion(): boolean {
  return useMotionReducedMotion() ?? false;
}
