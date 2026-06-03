"use client";

import { motion } from "motion/react";
import type { CopyShape } from "@/lib/copy";
import { Ball, Tag } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";

/**
 * Landing hero: eyebrow pill, the heavy royal-blue "Match Picks 2026" display
 * headline with its yellow offset shadow (from .display), the subhead, and the
 * "UNOFFICIAL OFFICE GAME · NO BETTING" tag. A small bouncing ball adds energy
 * without stealing the budget; it stills under reduced motion.
 */
export function Hero({ copy }: { copy: CopyShape }) {
  const reduce = usePrefersReducedMotion();

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <motion.p
        className="nb-pill"
        style={{ fontWeight: 700 }}
        initial={reduce ? false : { opacity: 0, y: -10, scale: 0.9 }}
        animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 20 }}
      >
        {copy.hero.eyebrow}
      </motion.p>

      <h1 className="display text-[clamp(2.75rem,10vw,6rem)]">
        <motion.span
          className="block"
          initial={reduce ? false : { opacity: 0, y: 26, scale: 0.85 }}
          animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
        >
          {copy.hero.titleLine1}
        </motion.span>
        <motion.span
          className="block"
          initial={reduce ? false : { opacity: 0, y: 26, scale: 0.85 }}
          animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.14 }}
        >
          {copy.hero.titleLine2}
        </motion.span>
      </h1>

      <motion.div
        aria-hidden="true"
        className="leading-none"
        initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: -25 }}
        animate={
          reduce
            ? undefined
            : { opacity: 1, scale: 1, rotate: 0, y: [0, -10, 0] }
        }
        transition={{
          opacity: { duration: 0.4, delay: 0.28 },
          scale: { type: "spring", stiffness: 500, damping: 16, delay: 0.28 },
          rotate: { type: "spring", stiffness: 500, damping: 16, delay: 0.28 },
          y: { duration: 2.2, ease: "easeInOut", repeat: Infinity, delay: 0.9 },
        }}
      >
        <Ball size={40} />
      </motion.div>

      <motion.p
        className="max-w-[30rem] text-[1.05rem] font-medium"
        style={{ color: "var(--color-ink)" }}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.34 }}
      >
        {copy.hero.subhead}
      </motion.p>

      <Tag>{copy.app.unofficialTag}</Tag>
    </section>
  );
}
