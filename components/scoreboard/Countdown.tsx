"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";

// ============================================================================
// Countdown — the live ticking clock at the heart of the pre-tournament hero.
// Takes a target ISO timestamp (the first kickoff) and ticks every second down
// to Days : Hours : Minutes : Seconds.
//
// SSR/hydration: the server renders against the request time; the client takes
// over on mount and re-syncs to the real wall clock, so the first paint is
// never blank and the numbers don't jump on hydrate. Under reduced motion we
// hold a single static snapshot (no per-second churn) — the page still reads
// the remaining time, it just doesn't animate.
// ============================================================================

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function remainingUntil(targetMs: number, nowMs: number): Remaining {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    done: diff <= 0,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const UNITS: { key: keyof Omit<Remaining, "done">; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Mins" },
  { key: "seconds", label: "Secs" },
];

export interface CountdownProps {
  /** Target instant (the first kickoff) as ISO-8601. */
  target: string;
}

export function Countdown({ target }: CountdownProps) {
  const reduce = usePrefersReducedMotion();
  const targetMs = new Date(target).getTime();

  // Seed both server and first client paint from the same request-time value so
  // hydration matches; the effect below re-syncs to the live clock on mount.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (reduce) return; // hold a static snapshot under reduced motion
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reduce]);

  const r = remainingUntil(targetMs, now);

  // A human label for screen readers — the visual grid is decorative detail.
  const spoken = r.done
    ? "Kickoff time has arrived."
    : `${r.days} days, ${r.hours} hours, ${r.minutes} minutes, ${r.seconds} seconds until kickoff.`;

  return (
    <div
      className="flex flex-wrap items-stretch justify-center gap-2 sm:gap-3"
      role="timer"
      aria-live="off"
      aria-label={spoken}
    >
      {UNITS.map((u, i) => (
        <div key={u.key} className="flex items-stretch gap-2 sm:gap-3">
          <div
            className="flex min-w-[3.6rem] flex-col items-center rounded-lg px-2 py-2.5 sm:min-w-[5rem] sm:py-3"
            style={{
              background: "var(--color-cream)",
              border: "2.5px solid var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
            }}
          >
            <span
              className="display tnum text-[clamp(1.9rem,8vw,3.25rem)] leading-none"
              style={{ color: "var(--color-royal)" }}
            >
              {pad(r[u.key])}
            </span>
            <span
              className="mt-1 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] sm:text-[0.68rem]"
              style={{ color: "var(--color-muted)" }}
            >
              {u.label}
            </span>
          </div>
          {i < UNITS.length - 1 ? (
            <span
              aria-hidden
              className="self-center text-[clamp(1.5rem,6vw,2.5rem)] font-black leading-none"
              style={{ color: "var(--color-ink)" }}
            >
              :
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
