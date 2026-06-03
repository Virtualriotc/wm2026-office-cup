"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import type { Match, Outcome, Result } from "@/lib/types";
import { COPY, fill } from "@/lib/copy";
import { Button } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/useReducedMotion";
import { confirmResult } from "@/app/actions/organizer";

const OUTCOME_LABEL: Record<Outcome, (m: Match) => string> = {
  home: (m) => m.home,
  draw: () => COPY.predict.drawLabel,
  away: (m) => m.away,
};

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface MatchConfirmRowProps {
  match: Match;
  /** The recorded result for this match, if any. source 'feed' = auto, 'organizer' = override. */
  result: Result | null;
  delay?: number;
}

/**
 * One match in the override list. Results arrive automatically (source 'feed'),
 * so this row LEADS with the auto call — "Auto result: X" — and the organizer
 * only opens the override controls when the feed is wrong or hasn't called yet.
 * Picking an outcome writes an organizer override (confirmResult), which always
 * wins over the feed, then reflects it. Optimistic UI with a server round-trip.
 */
export function MatchConfirmRow({ match, result, delay = 0 }: MatchConfirmRowProps) {
  const reduce = usePrefersReducedMotion();
  // The live outcome (from the feed or a prior override) and which source set it.
  const [outcome, setOutcome] = useState<Outcome | null>(result?.outcome ?? null);
  const [isOverride, setIsOverride] = useState(result?.source === "organizer");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const outcomes: Outcome[] =
    match.stage === "group" ? ["home", "draw", "away"] : ["home", "away"];

  function handleOverride(next: Outcome) {
    setError(null);
    const prevOutcome = outcome;
    const prevOverride = isOverride;
    setOutcome(next); // optimistic
    setIsOverride(true);
    startTransition(async () => {
      const res = await confirmResult(match.id, next);
      if (res.ok) {
        setOpen(false);
      } else {
        setOutcome(prevOutcome); // roll back
        setIsOverride(prevOverride);
        setError(
          res.error === "FORBIDDEN"
            ? COPY.errors.notOrganizer
            : res.error ?? COPY.errors.generic,
        );
      }
    });
  }

  const outcomeLabel = outcome ? OUTCOME_LABEL[outcome](match) : null;

  return (
    <motion.div
      className="nb-card p-4"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 26, delay }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[1.05rem] font-bold">
          {match.home} <span style={{ color: "var(--color-muted)" }}>vs</span>{" "}
          {match.away}
        </p>
        <p className="tnum text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
          {kickoffLabel(match.kickoff)}
        </p>
      </div>

      {/* The auto result line (or the override line, when one is active). */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {outcomeLabel ? (
          <p
            className="text-[0.85rem] font-bold"
            style={{ color: isOverride ? "var(--color-royal)" : "var(--color-ink)" }}
            role="status"
          >
            {fill(
              isOverride ? COPY.organizer.overrideActive : COPY.organizer.autoResult,
              { outcome: outcomeLabel },
            )}
          </p>
        ) : (
          <p className="text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
            {COPY.organizer.noResultYet}
          </p>
        )}
        <Button
          variant="secondary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={pending}
        >
          {COPY.organizer.overrideCta}
        </Button>
      </div>

      {/* Override controls — collapsed until the organizer needs to step in. */}
      {open ? (
        <div className="mt-3">
          <p className="text-[0.85rem] font-bold">
            {COPY.organizer.overrideLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {outcomes.map((o) => {
              const isCurrent = outcome === o;
              return (
                <Button
                  key={o}
                  variant={isCurrent ? "primary" : "secondary"}
                  onClick={() => handleOverride(o)}
                  disabled={pending}
                  aria-pressed={isCurrent}
                >
                  {isCurrent ? "✓ " : ""}
                  {OUTCOME_LABEL[o](match)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isOverride && outcomeLabel ? (
        <p
          className="mt-2 text-[0.8rem] font-bold"
          style={{ color: "var(--color-green)" }}
          role="status"
        >
          {COPY.organizer.overrideSavedToast}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-2 text-[0.8rem] font-bold"
          style={{ color: "var(--color-coral)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}
