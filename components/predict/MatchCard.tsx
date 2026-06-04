"use client";

import { motion } from "motion/react";
import type { Consensus, Match, Outcome, Result } from "@/lib/types";
import { COPY, fill } from "@/lib/copy";
import { Card, usePrefersReducedMotion } from "@/components/ui";
import {
  isKnockout,
  pointsForStage,
  stageLabel,
} from "./predict-helpers";
import { LockCountdown } from "./LockCountdown";

export interface MatchCardProps {
  match: Match;
  /** Index for the pop-in stagger. */
  index: number;
  /** Whether picks are still open for this match (client view of the lock). */
  open: boolean;
  /** The user's current pick for this match, if any. */
  selected?: Outcome;
  /** Not signed in yet: show a "join to pick" prompt instead of the read-only
   *  LockedView, so an unsigned visitor isn't told an OPEN match is "locked". */
  previewOnly?: boolean;
  /** Confirmed result, when the match is final. */
  result?: Result;
  /** Office consensus (optional crowd signal — never odds). */
  consensus?: Consensus;
  /** Called when the user taps an option (open cards only). */
  onSelect?: (matchId: string, pick: Outcome) => void;
  /** Called when this card's countdown crosses kickoff. */
  onLock?: (matchId: string) => void;
}

/**
 * One fixture as a cream neo-brutalist card.
 *  - Open: tappable options (Group: Home/Draw/Away; Knockout: which of the two
 *    teams advances) + a live lock countdown + points-at-stake badge.
 *  - Locked/final: read-only, showing the user's pick and — when a result is
 *    in — the no-blame outcome line from COPY.
 */
export function MatchCard({
  match,
  index,
  open,
  selected,
  result,
  consensus,
  previewOnly,
  onSelect,
  onLock,
}: MatchCardProps) {
  const knockout = isKnockout(match.stage);
  const points = pointsForStage(match.stage);

  return (
    <Card popIn delay={Math.min(index, 6) * 0.05} className="p-4 sm:p-5">
      {/* header row: stage + group, points at stake, lock countdown */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="nb-tag" style={{ background: "var(--color-royal)", color: "#fff" }}>
            {stageLabel(match.stage)}
            {match.group ? ` · ${match.group}` : ""}
          </span>
          <span
            className="tnum text-[0.75rem] font-bold"
            style={{ color: "var(--color-muted)" }}
          >
            +{points} {points === 1 ? "pt" : "pts"}
          </span>
        </div>
        <LockCountdown
          kickoff={match.kickoff}
          onLock={onLock ? () => onLock(match.id) : undefined}
        />
      </div>

      {open ? (
        <OpenOptions
          match={match}
          knockout={knockout}
          selected={selected}
          onSelect={onSelect}
        />
      ) : previewOnly ? (
        <p
          className="mt-3 text-[0.9rem] font-bold"
          style={{ color: "var(--color-royal)" }}
        >
          {COPY.predict.signInToPick}
        </p>
      ) : (
        <LockedView match={match} knockout={knockout} selected={selected} result={result} points={points} />
      )}

      {/* office consensus — optional, only when we have picks to show */}
      {consensus && consensus.n > 0 ? (
        <ConsensusBar match={match} knockout={knockout} consensus={consensus} />
      ) : null}
    </Card>
  );
}

// --------------------------------------------------------------------------
// Open (pickable) state.
// --------------------------------------------------------------------------

function OpenOptions({
  match,
  knockout,
  selected,
  onSelect,
}: {
  match: Match;
  knockout: boolean;
  selected?: Outcome;
  onSelect?: (matchId: string, pick: Outcome) => void;
}) {
  const options: { value: Outcome; label: string }[] = knockout
    ? [
        { value: "home", label: match.home },
        { value: "away", label: match.away },
      ]
    : [
        { value: "home", label: match.home },
        { value: "draw", label: COPY.predict.drawLabel },
        { value: "away", label: match.away },
      ];

  const instruction = knockout ? "Tap who advances." : COPY.predict.instruction;

  return (
    <div role="radiogroup" aria-label={`${match.home} vs ${match.away} — ${instruction}`}>
      <p className="mb-2 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
        {selected ? null : instruction}
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <PickOption
            key={opt.value}
            label={opt.label}
            isDraw={opt.value === "draw"}
            checked={selected === opt.value}
            onClick={() => onSelect?.(match.id, opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

function PickOption({
  label,
  isDraw,
  checked,
  onClick,
}: {
  label: string;
  isDraw: boolean;
  checked: boolean;
  onClick: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-2.5 text-center transition-[transform,box-shadow] duration-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[var(--color-royal)] focus-visible:outline-offset-2"
      style={
        checked
          ? {
              border: "var(--border-ink)",
              background: "var(--color-green)",
              color: "#fff",
              boxShadow: "0 0 0 var(--color-ink)",
              transform: "translate(3px, 3px)",
            }
          : {
              border: "var(--border-ink)",
              background: "var(--color-cream)",
              color: "var(--color-ink)",
              boxShadow: "var(--shadow-hard-sm)",
            }
      }
    >
      <span className="font-bold leading-tight">{label}</span>
      {isDraw ? null : <span className="text-[0.65rem] opacity-70">to win</span>}
    </motion.button>
  );
}

// --------------------------------------------------------------------------
// Locked / final (read-only) state.
// --------------------------------------------------------------------------

function LockedView({
  match,
  knockout,
  selected,
  result,
  points,
}: {
  match: Match;
  knockout: boolean;
  selected?: Outcome;
  result?: Result;
  points: number;
}) {
  const teams: { value: Outcome; label: string }[] = knockout
    ? [
        { value: "home", label: match.home },
        { value: "away", label: match.away },
      ]
    : [
        { value: "home", label: match.home },
        { value: "draw", label: COPY.predict.drawLabel },
        { value: "away", label: match.away },
      ];

  const pickedLabel =
    selected !== undefined
      ? teams.find((t) => t.value === selected)?.label ?? "—"
      : null;

  // Outcome banner (no-blame). Three cases: nailed it, not your day, missed.
  let banner: { text: string; bg: string; fg: string } | null = null;
  if (result) {
    if (selected === undefined) {
      banner = {
        text: COPY.predict.resultMissed,
        bg: "var(--color-cream)",
        fg: "var(--color-muted)",
      };
    } else if (selected === result.outcome) {
      banner = {
        text: fill(COPY.predict.resultCorrect, { points }),
        bg: "var(--color-green)",
        fg: "#fff",
      };
    } else {
      banner = {
        text: COPY.predict.resultWrong,
        bg: "var(--color-coral)",
        fg: "var(--color-ink)",
      };
    }
  }

  const winnerLabel = result
    ? teams.find((t) => t.value === result.outcome)?.label ?? "—"
    : null;

  return (
    <div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(0, 1fr))` }}
      >
        {teams.map((t) => {
          const isPick = selected === t.value;
          const isWinner = result?.outcome === t.value;
          return (
            <div
              key={t.value}
              className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-[12px] px-2 py-2.5 text-center"
              style={{
                border: "var(--border-ink)",
                boxShadow: isWinner || isPick ? "var(--shadow-hard-sm)" : "none",
                background: isWinner
                  ? "var(--color-green)"
                  : isPick
                    ? "var(--color-yellow)"
                    : "var(--color-cream)",
                color: isWinner ? "#fff" : "var(--color-ink)",
              }}
            >
              <span className="font-bold">{t.label}</span>
              {isPick ? (
                <span className="text-[0.6rem] font-bold uppercase tracking-wide">
                  Your pick
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {banner ? (
        <p
          className="tnum mt-3 flex flex-wrap items-center gap-1 rounded-[12px] px-3 py-2 text-[0.9rem] font-bold"
          style={{
            border: "var(--border-ink)",
            boxShadow: "var(--shadow-hard-sm)",
            background: banner.bg,
            color: banner.fg,
          }}
        >
          {banner.text}
          {winnerLabel ? (
            <span className="ml-2 font-normal opacity-90">
              Winner: {winnerLabel}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-3 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
          {selected !== undefined
            ? `Locked in: ${pickedLabel}. ${COPY.predict.postLockNote}`
            : `No pick — this one locked. ${COPY.predict.postLockNote}`}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Office consensus (optional crowd signal — our own picks, never odds).
// --------------------------------------------------------------------------

function ConsensusBar({
  match,
  knockout,
  consensus,
}: {
  match: Match;
  knockout: boolean;
  consensus: Consensus;
}) {
  const segments = knockout
    ? [
        { label: match.home, pct: consensus.pctHome, color: "var(--color-royal)" },
        { label: match.away, pct: consensus.pctAway, color: "var(--color-green)" },
      ]
    : [
        { label: match.home, pct: consensus.pctHome, color: "var(--color-royal)" },
        { label: COPY.predict.drawLabel, pct: consensus.pctDraw, color: "var(--color-muted)" },
        { label: match.away, pct: consensus.pctAway, color: "var(--color-green)" },
      ];

  return (
    <div className="mt-3">
      <p
        className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.predict.consensusLabel} · {consensus.n}
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ border: "var(--border-ink)" }}>
        {segments.map((s, i) => (
          <span
            key={i}
            className="h-full"
            style={{ width: `${s.pct}%`, background: s.color }}
            title={`${s.label}: ${s.pct}%`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
