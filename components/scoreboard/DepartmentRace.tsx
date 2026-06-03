"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { RaceLane, RaceModel } from "./raceModel";
import { readableTextOn } from "./relative";

// ============================================================================
// THE DEPARTMENT RACE — the hero (goal.md §5).
//
// A legible RANKED layout (one lane per department, top = leader) that plays a
// GENUINE overtake: the model gives a `before` order and an `after` order; on
// mount we render `before`, then flip to `after`. Two things move at once:
//   1. REORDER — lanes change vertical position. Each lane is a `motion.li`
//      with `layout`, so when the rendered array reorders, Motion FLIPs each
//      lane to its new row: the passer visibly RISES above the passed lane.
//   2. CROSS — each lane's token slides horizontally to a position
//      proportional to its points. The climbing lane's token travels forward
//      and crosses past the stalling lane's token.
// Together: a department both reorders above another AND moves past it.
//
// Reduced motion: render the final `after` order instantly, no FLIP, no token
// travel — just the settled, legible standings.
// ============================================================================

const TRACK_INSET = 28; // px the token keeps from each end so it never clips

interface Phase {
  order: RaceLane[];
  /** Token positions 0..1 keyed by departmentId. */
  frac: Record<string, number>;
}

function Lane({
  lane,
  rank,
  frac,
  reduce,
  passing,
}: {
  lane: RaceLane;
  rank: number;
  /** Token position 0..1 along the track. */
  frac: number;
  reduce: boolean;
  passing: boolean;
}) {
  const springX = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 110, damping: 20 } as const);

  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
      className="flex items-center gap-3 py-1.5"
    >
      {/* rank chip */}
      <span
        className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-md text-[0.85rem] font-extrabold"
        style={{ border: "var(--border-ink-thin)", background: "var(--color-cream)" }}
      >
        {rank}
      </span>

      {/* department label + badge */}
      <div className="flex w-[7rem] shrink-0 items-center gap-2 sm:w-[9.5rem]">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[0.7rem] font-extrabold"
          style={{
            background: lane.color,
            color: readableTextOn(lane.color),
            border: "var(--border-ink-thin)",
          }}
          aria-hidden
        >
          {lane.abbr}
        </span>
        <span className="truncate text-[0.9rem] font-bold leading-tight">
          {lane.name}
          {lane.isYou ? (
            <span
              className="ml-1 inline-block rounded px-1 align-middle text-[0.55rem] font-extrabold leading-none"
              style={{
                background: "var(--color-yellow)",
                border: "var(--border-ink-thin)",
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              YOU
            </span>
          ) : null}
        </span>
      </div>

      {/* track */}
      <div
        className="relative h-9 flex-1 overflow-hidden rounded-lg"
        style={{ background: "rgba(20,19,15,0.05)", border: "var(--border-ink-thin)" }}
      >
        {/* trail fill behind the token */}
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: lane.color, opacity: 0.26 }}
          initial={false}
          animate={{ width: `${frac * 100}%` }}
          transition={springX}
        />
        {/* sweep highlight when this lane is the one doing the passing */}
        {passing && !reduce ? (
          <motion.div
            className="pointer-events-none absolute inset-y-0 left-0 w-12"
            style={{
              background:
                "linear-gradient(90deg,transparent,rgba(255,210,63,0.9),transparent)",
            }}
            initial={{ left: "-15%", opacity: 0 }}
            animate={{ left: ["0%", "100%"], opacity: [0, 1, 0] }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          />
        ) : null}
        {/* token */}
        <motion.div
          className="absolute top-1/2 h-6 w-6 rounded-full"
          style={{
            background: lane.color,
            border: "var(--border-ink)",
            boxShadow: lane.isYou ? "0 0 0 3px var(--color-yellow)" : undefined,
            marginTop: -12,
          }}
          initial={false}
          animate={{ left: `calc(${TRACK_INSET}px + (100% - ${TRACK_INSET * 2}px) * ${frac})` }}
          transition={springX}
        />
      </div>

      {/* points */}
      <span className="tnum w-11 shrink-0 text-right text-[0.95rem] font-extrabold">
        {lane.avgPoints.toFixed(1)}
      </span>
    </motion.li>
  );
}

export function DepartmentRace({ model }: { model: RaceModel }) {
  const reduce = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<Phase>(() =>
    reduce
      ? { order: model.after, frac: model.afterFrac }
      : { order: model.before, frac: model.beforeFrac },
  );
  const [passerId, setPasserId] = useState<string | null>(null);
  const started = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduce) {
      setPhase({ order: model.after, frac: model.afterFrac });
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    let flipTimer: ReturnType<typeof setTimeout> | undefined;
    let sweepTimer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      if (started.current) return;
      started.current = true;
      // Beat one: the `before` snapshot is already on screen. Beat two: flip
      // to the real standings -> reorder (FLIP) + token cross fire together.
      flipTimer = setTimeout(() => {
        setPhase({ order: model.after, frac: model.afterFrac });
        const climber = [...model.after].sort((a, b) => b.climbDelta - a.climbDelta)[0];
        if (climber && (climber.climbDelta > 0 || model.isDemo)) {
          setPasserId(climber.departmentId);
          sweepTimer = setTimeout(() => setPasserId(null), 1100);
        }
      }, 700);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) run();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (flipTimer) clearTimeout(flipTimer);
      if (sweepTimer) clearTimeout(sweepTimer);
    };
  }, [model, reduce]);

  return (
    <div ref={containerRef}>
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Department race standings">
        {phase.order.map((lane, i) => (
          <Lane
            key={lane.departmentId}
            lane={lane}
            rank={i + 1}
            frac={phase.frac[lane.departmentId] ?? model.afterFrac[lane.departmentId] ?? 0.08}
            reduce={reduce}
            passing={passerId === lane.departmentId}
          />
        ))}
      </ul>
    </div>
  );
}
