"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { usePrefersReducedMotion } from "./useReducedMotion";

type Variant = "primary" | "secondary";

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: Variant;
}

/**
 * Neo-brutalist button. The CSS (.nb-btn) owns the hard-shadow collapse on
 * :active; Motion adds a springy tap scale on top, honoring reduced motion.
 */
export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const reduce = usePrefersReducedMotion();
  const cls = `nb-btn nb-btn--${variant} ${className}`.trim();

  return (
    <motion.button
      className={cls}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
