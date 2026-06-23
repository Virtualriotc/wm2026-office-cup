"use client";

import { motion } from "motion/react";
import type { Consensus, Match, Outcome, Result } from "@/lib/types";
import { COPY, fill } from "@/lib/copy";
import { Card, usePrefersReducedMotion } from "@/components/ui";
import { Flag } from "@/components/Flag";
import {
  isKnockout,
  pointsForStage,
  roundStyle,
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
 * One fixture as a compact cream neo-brutalist card. Team buttons carry the
 * country flag (self-hosted SVG); under them the office consensus shows the real
 * pick split as a bar PLUS the percentages, so the crowd signal is legible.
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
  const round = roundStyle(match);

  return (
    <Card
      popIn
      delay={Math.min(index, 6) * 0.04}
      className={`p-3 sm:p-3.5${round ? " overflow-hidden" : ""}${round?.gold ? " nb-card--gold" : ""}`}
    >
      {round ? (
        /* knockout: full-width colour ribbon — round name + points + countdown.
           The accent colour never stands alone; the round NAME rides with it. */
        <div
          className="-mx-3 -mt-3 mb-2.5 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:-mx-3.5 sm:-mt-3.5 sm:px-3.5"
          style={{ background: round.bg, color: round.fg, borderBottom: "var(--border-ink)" }}
        >
          <span
            className="text-[0.95rem] font-extrabold leading-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {round.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="nb-tag" style={{ background: "#fff", color: "var(--color-ink)" }}>
              +{points} {points === 1 ? "pt" : "pts"}
            </span>
            <LockCountdown
              kickoff={match.kickoff}
              onLock={onLock ? () => onLock(match.id) : undefined}
            />
          </div>
        </div>
      ) : (
        /* group stage — unchanged: royal stage tag, points, countdown */
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="nb-tag" style={{ background: "var(--color-royal)", color: "#fff" }}>
              {stageLabel(match.stage)}
              {match.group ? ` · ${match.group}` : ""}
            </span>
            <span
              className="tnum text-[0.72rem] font-bold"
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
      )}

      {open ? (
        <OpenOptions
          match={match}
          knockout={knockout}
          selected={selected}
          onSelect={onSelect}
        />
      ) : previewOnly ? (
        <p
          className="mt-2 text-[0.9rem] font-bold"
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
  const options: { value: Outcome; label: string; team?: string }[] = knockout
    ? [
        { value: "home", label: match.home, team: match.home },
        { value: "away", label: match.away, team: match.away },
      ]
    : [
        { value: "home", label: match.home, team: match.home },
        { value: "draw", label: COPY.predict.drawLabel },
        { value: "away", label: match.away, team: match.away },
      ];

  const instruction = knockout ? "Tap who advances." : COPY.predict.instruction;

  return (
    <div role="radiogroup" aria-label={`${match.home} vs ${match.away} — ${instruction}`}>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <PickOption
            key={opt.value}
            label={opt.label}
            team={opt.team}
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
  team,
  checked,
  onClick,
}: {
  label: string;
  team?: string;
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
      className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-[12px] px-2 py-2 text-center transition-[transform,box-shadow] duration-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[var(--color-royal)] focus-visible:outline-offset-2"
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
      {team ? <Flag team={team} size={18} /> : null}
      <span className="text-[0.92rem] font-bold leading-tight">{label}</span>
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
  const teams: { value: Outcome; label: string; team?: string }[] = knockout
    ? [
        { value: "home", label: match.home, team: match.home },
        { value: "away", label: match.away, team: match.away },
      ]
    : [
        { value: "home", label: match.home, team: match.home },
        { value: "draw", label: COPY.predict.drawLabel },
        { value: "away", label: match.away, team: match.away },
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
              className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-[12px] px-2 py-2 text-center"
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
              {t.team ? <Flag team={t.team} size={18} /> : null}
              <span className="text-[0.92rem] font-bold">{t.label}</span>
              {isPick ? (
                <span className="text-[0.55rem] font-bold uppercase tracking-wide opacity-80">
                  pick
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {banner ? (
        <p
          className="tnum mt-2.5 flex flex-wrap items-center gap-1 rounded-[12px] px-3 py-2 text-[0.9rem] font-bold"
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
        <p className="mt-2.5 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
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
// Shows the bar AND the percentages so the signal is actually legible.
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
        { label: match.home, team: match.home, pct: consensus.pctHome, color: "var(--color-royal)" },
        { label: match.away, team: match.away, pct: consensus.pctAway, color: "var(--color-green)" },
      ]
    : [
        { label: match.home, team: match.home, pct: consensus.pctHome, color: "var(--color-royal)" },
        { label: COPY.predict.drawLabel, team: undefined, pct: consensus.pctDraw, color: "var(--color-muted)" },
        { label: match.away, team: match.away, pct: consensus.pctAway, color: "var(--color-green)" },
      ];

  return (
    <div className="mt-2.5">
      <p
        className="mb-1 text-[0.68rem] font-bold uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.predict.consensusLabel} · {consensus.n} {consensus.n === 1 ? "pick" : "picks"}
      </p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ border: "var(--border-ink)" }}>
        {segments.map((s, i) => (
          <span
            key={i}
            className="h-full"
            style={{ width: `${s.pct}%`, background: s.color }}
            aria-hidden="true"
          />
        ))}
      </div>
      {/* legible legend: each outcome's share, with its bar colour */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem]">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color, border: "1px solid var(--color-ink)" }}
              aria-hidden="true"
            />
            {s.team ? <Flag team={s.team} size={14} /> : null}
            <span className="font-semibold">{s.label}</span>
            <span className="tnum font-extrabold">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
