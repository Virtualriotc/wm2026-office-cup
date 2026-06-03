"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { CopyShape } from "@/lib/copy";
import { Ball, Tag } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";

/** Whole days from now until `kickoff`, or null if it's not in the future. */
function daysUntil(kickoff: string | null, nowMs: number): number | null {
  if (!kickoff) return null;
  const diff = new Date(kickoff).getTime() - nowMs;
  if (diff <= 0) return null;
  return Math.ceil(diff / 86_400_000);
}

/**
 * Landing hero: eyebrow pill, the heavy royal-blue "Match Picks 2026" display
 * headline with its yellow offset shadow (from .display), the about line, and the
 * "UNOFFICIAL OFFICE GAME · NO BETTING" tag. A small bouncing ball adds energy
 * without stealing the budget; it stills under reduced motion.
 *
 * When `kickoff` is still in the future, a small "kicks off in N days" chip
 * lifts the pre-launch landing. It resolves on the client (after mount) to keep
 * the marketing page static-cacheable and avoid a hydration mismatch; it never
 * ticks per second — this is a glance, not the scoreboard's live countdown.
 */
export function Hero({
  copy,
  kickoff = null,
}: {
  copy: CopyShape;
  kickoff?: string | null;
}) {
  const reduce = usePrefersReducedMotion();

  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    setDays(daysUntil(kickoff, Date.now()));
  }, [kickoff]);

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

      {days !== null ? (
        <motion.span
          className="nb-pill"
          style={{ fontWeight: 800, color: "var(--color-royal)" }}
          initial={reduce ? false : { opacity: 0, scale: 0.85 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 18 }}
        >
          Kicks off in {days} {days === 1 ? "day" : "days"}
        </motion.span>
      ) : null}

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

      {/* The bold "what is this + how" line, just above the CTA. */}
      <motion.p
        className="max-w-[34rem] text-[1.05rem] font-semibold"
        style={{ color: "var(--color-ink)" }}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.34 }}
      >
        {copy.hero.about}
      </motion.p>

      <Tag>{copy.app.unofficialTag}</Tag>
    </section>
  );
}
