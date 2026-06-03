"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { COPY, fill } from "@/lib/copy";
import { usePrefersReducedMotion } from "@/components/ui";

/**
 * Live per-match lock countdown. Ticks once a second toward kickoff and flips
 * to the locked label the instant `now >= kickoff`. This is a UI affordance
 * only — the authoritative lock is enforced server-side in the store. When the
 * countdown crosses zero we notify the parent (`onLock`) so the card can drop
 * its pick controls without a round-trip.
 *
 * Reduced motion: no pulsing/blinking; the urgent-yellow state is conveyed by
 * a static border/color, not animation.
 */
export function LockCountdown({
  kickoff,
  onLock,
}: {
  kickoff: string;
  onLock?: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  const kickoffMs = new Date(kickoff).getTime();
  const [remaining, setRemaining] = useState(() => kickoffMs - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const left = kickoffMs - Date.now();
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onLock?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [kickoffMs, onLock]);

  const locked = remaining <= 0;
  // "Urgent" once under an hour: paint it yellow so the eye catches it.
  const urgent = !locked && remaining <= 60 * 60 * 1000;

  const label = locked
    ? COPY.predict.lockClosed
    : fill(COPY.predict.lockOpen, { time: formatRemaining(remaining) });

  const style: React.CSSProperties = locked
    ? { background: "var(--color-ink)", color: "var(--color-cream)" }
    : urgent
      ? { background: "var(--color-yellow)", color: "var(--color-ink)" }
      : { background: "var(--color-cream)", color: "var(--color-ink)" };

  return (
    <span
      className="nb-tag tnum"
      style={style}
      role="timer"
      aria-live="off"
      aria-label={label}
    >
      {urgent && !reduce ? (
        <motion.span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: "var(--color-coral)" }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      {label}
    </span>
  );
}

/** Compact "2d 4h" / "3h 12m" / "8m 05s" string for the remaining time. */
function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${pad(secs)}s`;
  return `${secs}s`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
