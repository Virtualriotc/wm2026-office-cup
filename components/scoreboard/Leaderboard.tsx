"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { COPY, fill } from "@/lib/copy";
import type { DepartmentStanding } from "@/lib/types";
import { readableTextOn } from "./relative";
import type { DisplayRow, RelativeView } from "./relative";

// ============================================================================
// LEADERBOARD — two tabs.
//
//   You         : RELATIVE framing (goal.md §5). Top 3 + the players directly
//                 above/below you + your percentile + climb-delta + a single
//                 "catchable" hook. NEVER "you are #N of M".
//   Departments : standings = AVERAGE points per ACTIVE member, with the
//                 fairness note so small teams read as competing fairly.
// ============================================================================

type Tab = "you" | "departments";

function climbLabel(delta: number): { text: string; up: boolean } | null {
  if (delta === 0) return null;
  return delta > 0
    ? { text: `up ${delta} this round`, up: true }
    : { text: `down ${Math.abs(delta)} this round`, up: false };
}

function Row({ row, dim }: { row: DisplayRow; dim?: boolean }) {
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={
        row.isYou
          ? { background: "rgba(255,210,63,0.18)", boxShadow: "inset 0 0 0 2px var(--color-yellow)" }
          : undefined
      }
    >
      <span
        className="tnum w-6 shrink-0 text-right text-[0.85rem] font-bold"
        style={{ color: dim ? "var(--color-muted)" : "var(--color-ink)" }}
      >
        {row.rank}
      </span>
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[0.7rem] font-extrabold"
        style={{
          background: row.color,
          color: readableTextOn(row.color),
          border: "var(--border-ink-thin)",
        }}
        aria-hidden
      >
        {row.initials}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.92rem] font-semibold">
        {row.displayName}
        {row.isYou ? (
          <span
            className="ml-1.5 inline-block rounded px-1 align-middle text-[0.55rem] font-extrabold leading-none"
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
      <span className="tnum shrink-0 text-[0.95rem] font-extrabold">{row.points}</span>
    </li>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 flex items-center gap-3 px-1">
      <span className="h-px flex-1" style={{ background: "rgba(20,19,15,0.15)" }} />
      <span
        className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em]"
        style={{ color: "var(--color-muted)" }}
      >
        {children}
      </span>
      <span className="h-px flex-1" style={{ background: "rgba(20,19,15,0.15)" }} />
    </div>
  );
}

function YouTab({ view }: { view: RelativeView }) {
  if (!view.hasViewer || !view.you) {
    // Visitor without a code: show the top of the cup, no relative framing.
    if (view.top.length === 0) {
      return (
        <p className="px-1 py-6 text-center text-[0.9rem]" style={{ color: "var(--color-muted)" }}>
          {COPY.leaderboard.empty}
        </p>
      );
    }
    return (
      <div>
        <Divider>{COPY.leaderboard.topOfCup}</Divider>
        <ul className="m-0 list-none p-0">
          {view.top.map((r) => (
            <Row key={r.userId} row={r} />
          ))}
        </ul>
        <p className="mt-3 px-1 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
          Join with a code to see where you land — and who&apos;s in reach.
        </p>
      </div>
    );
  }

  const you = view.you;
  const climb = climbLabel(you.climbDelta);
  // Percentile framing: top X% (never "#N of M"). But "Top X%" only reads as a
  // flex near the top — at the bottom it produces "Top 100% and climbing", which
  // contradicts the board. So only show the percentage in the top half; below
  // that, show a plain encouraging line (no misleading number).
  const topPct = Math.max(1, you.percentile);
  const rankNote =
    topPct <= 50
      ? fill(COPY.race.yourRankNote, { pct: topPct })
      : COPY.race.yourRankNoteClimb;

  return (
    <div className="flex flex-col gap-3">
      {/* The "you" hero card */}
      <div
        className="flex items-center gap-4 rounded-2xl p-4"
        style={{
          background: "linear-gradient(135deg, rgba(255,210,63,0.22), rgba(47,75,224,0.08))",
          border: "var(--border-ink)",
        }}
      >
        <div>
          <div className="display tnum text-[2.4rem] leading-none" style={{ textShadow: "var(--display-shadow)" }}>
            {you.points}
          </div>
          <div className="text-[0.7rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
            points
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[1.05rem] font-extrabold">{you.displayName}</div>
          <div className="mt-0.5 text-[0.82rem] font-semibold" style={{ color: "var(--color-muted)" }}>
            {you.departmentName} · {rankNote}
          </div>
          {climb ? (
            <div
              className="mt-1 inline-flex items-center gap-1 text-[0.82rem] font-extrabold"
              style={{ color: climb.up ? "var(--color-green)" : "var(--color-coral)" }}
            >
              <span aria-hidden>{climb.up ? "▲" : "▼"}</span>
              {climb.text}
            </div>
          ) : (
            <div className="mt-1 text-[0.82rem] font-bold" style={{ color: "var(--color-muted)" }}>
              Holding steady — pick the next round to climb.
            </div>
          )}
          {view.chase ? (
            <div className="mt-1.5 text-[0.82rem]" style={{ color: "var(--color-ink)" }}>
              {fill(COPY.leaderboard.behindNote, {
                points: view.chase.pointsBehind,
                name: view.chase.name,
              })}
            </div>
          ) : (
            <div className="mt-1.5 text-[0.82rem] font-bold" style={{ color: "var(--color-green)" }}>
              {COPY.leaderboard.topOfCup} — you&apos;re leading. Keep it.
            </div>
          )}
        </div>
      </div>

      {/* Within reach */}
      {view.neighbours.length > 0 ? (
        <div>
          <Divider>{COPY.leaderboard.withinReach}</Divider>
          <ul className="m-0 list-none p-0">
            {view.neighbours.map((r) => (
              <Row key={r.userId} row={r} dim />
            ))}
            {/* show the viewer inline among neighbours too, so the band reads continuously */}
          </ul>
        </div>
      ) : null}

      {/* Top of the cup */}
      <div>
        <Divider>{COPY.leaderboard.topOfCup}</Divider>
        <ul className="m-0 list-none p-0">
          {view.top.map((r) => (
            <Row key={r.userId} row={r} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function DepartmentsTab({
  standings,
  youDeptId,
}: {
  standings: DepartmentStanding[];
  youDeptId: string | null;
}) {
  const eligible = standings.filter((s) => s.eligible);
  const maxAvg = Math.max(1, ...eligible.map((s) => s.avgPoints));

  if (eligible.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[0.9rem]" style={{ color: "var(--color-muted)" }}>
        {COPY.empty.noLeaderboardYet}
      </p>
    );
  }

  return (
    <div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {eligible.map((s) => {
          const isYou = youDeptId !== null && s.departmentId === youDeptId;
          const climb = climbLabel(s.climbDelta);
          const frac = Math.max(0.05, Math.min(1, s.avgPoints / maxAvg));
          return (
            <li
              key={s.departmentId}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={
                isYou
                  ? { background: "rgba(255,210,63,0.18)", boxShadow: "inset 0 0 0 2px var(--color-yellow)" }
                  : undefined
              }
            >
              <span className="tnum w-6 shrink-0 text-right text-[0.85rem] font-bold">{s.rank}</span>
              <span
                className="h-7 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.color, border: "var(--border-ink-thin)" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[0.92rem] font-bold">{s.name}</span>
                  {isYou ? (
                    <span
                      className="rounded px-1 text-[0.55rem] font-extrabold leading-none"
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
                  {climb ? (
                    <span
                      className="text-[0.7rem] font-extrabold"
                      style={{ color: climb.up ? "var(--color-green)" : "var(--color-coral)" }}
                    >
                      {climb.up ? "▲" : "▼"}
                      {Math.abs(s.climbDelta)}
                    </span>
                  ) : null}
                </div>
                {/* mini bar */}
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "rgba(20,19,15,0.08)" }}
                >
                  <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: s.color }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="tnum text-[0.95rem] font-extrabold">{s.avgPoints.toFixed(1)}</span>
                <div className="text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                  {s.activeMembers} active
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 px-1 text-[0.78rem]" style={{ color: "var(--color-muted)" }}>
        {COPY.leaderboard.departmentsFooter}
      </p>
    </div>
  );
}

export function Leaderboard({
  view,
  standings,
  youDeptId,
  personalOnly = false,
}: {
  view: RelativeView;
  standings: DepartmentStanding[];
  youDeptId: string | null;
  /** Render only the personal "you" standing (no tabs) — used on Predict. */
  personalOnly?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const [tab, setTab] = useState<Tab>("you");

  // Predict shows just your personal standing; the department race lives on the
  // scoreboard, so no tabs / no department list here.
  if (personalOnly) return <YouTab view={view} />;

  const tabBtn = (key: Tab, label: string) => {
    const active = tab === key;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setTab(key)}
        className="nb-pill nb-pill--pressable"
        style={{
          background: active ? "var(--color-royal)" : "var(--color-cream)",
          color: active ? "#fff" : "var(--color-ink)",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <div role="tablist" aria-label="Leaderboard view" className="mb-4 flex gap-2">
        {tabBtn("you", COPY.leaderboard.tabYou)}
        {tabBtn("departments", COPY.leaderboard.tabDepartments)}
      </div>
      <motion.div
        key={tab}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
      >
        {tab === "you" ? (
          <YouTab view={view} />
        ) : (
          <DepartmentsTab standings={standings} youDeptId={youDeptId} />
        )}
      </motion.div>
    </div>
  );
}
