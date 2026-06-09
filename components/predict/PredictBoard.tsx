"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Consensus, Match, Outcome, Result } from "@/lib/types";
import { COPY, fill } from "@/lib/copy";
import { Button, usePrefersReducedMotion } from "@/components/ui";
import { savePredictions, type SavePicksState } from "@/app/actions/predictions";
import { MatchCard } from "./MatchCard";
import { groupByMatchday, type MatchdayGroup } from "./predict-helpers";

/** A match the user has already locked, with their pick + any result. */
export interface LockedEntry {
  match: Match;
  pick?: Outcome;
  result?: Result;
}

export interface PredictBoardProps {
  /** Whether someone is signed in. Picks can only be saved when true. */
  signedIn: boolean;
  /** The FULL predictable slate (every future match with both real teams). */
  openMatches: Match[];
  /** All fixtures, used only to derive stable matchday numbers. */
  allMatches: Match[];
  /** The user's existing picks for the OPEN matches, keyed by matchId. */
  existingPicks: Record<string, Outcome>;
  /** Locked/final matches the user has touched, newest kickoff first. */
  lockedEntries: LockedEntry[];
  /** Office consensus per matchId (open matches only). */
  consensus: Record<string, Consensus>;
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; saved: number; rejected: string[] }
  | { kind: "error"; message: string };

export function PredictBoard({
  signedIn,
  openMatches,
  allMatches,
  existingPicks,
  lockedEntries,
  consensus,
}: PredictBoardProps) {
  const reduce = usePrefersReducedMotion();
  const [picks, setPicks] = useState<Record<string, Outcome>>(existingPicks);
  // Matches that locked client-side after the page loaded (countdown hit zero).
  const [lockedNow, setLockedNow] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  // Open cards still pickable right now (exclude any that locked since load).
  const stillOpen = useMemo(
    () => openMatches.filter((m) => !lockedNow.has(m.id)),
    [openMatches, lockedNow],
  );

  // The pickable slate, grouped per matchday (soonest first). The first group
  // renders expanded; the rest are collapsible so a long slate stays scannable.
  const groups = useMemo(
    () => groupByMatchday(stillOpen, allMatches),
    [stillOpen, allMatches],
  );

  // Open matches that locked while the user was on the page move to read-only.
  const newlyLocked = useMemo(
    () => openMatches.filter((m) => lockedNow.has(m.id)),
    [openMatches, lockedNow],
  );

  // The first matchday that still has an unpicked game — target of "jump to next".
  const firstUnpickedDayKey = useMemo(() => {
    for (const g of groups) {
      if (g.matches.some((m) => picks[m.id] === undefined)) return g.dayKey;
    }
    return null;
  }, [groups, picks]);

  const jumpToNext = () => {
    if (!firstUnpickedDayKey) return;
    const el = document.getElementById(`md-${firstUnpickedDayKey}`);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelect = (matchId: string, pick: Outcome) => {
    if (!signedIn) return;
    setPicks((prev) => ({ ...prev, [matchId]: pick }));
    // A fresh edit invalidates a prior success/error message.
    if (status.kind !== "idle" && status.kind !== "saving") {
      setStatus({ kind: "idle" });
    }
  };

  const handleLock = (matchId: string) => {
    setLockedNow((prev) => {
      if (prev.has(matchId)) return prev;
      const next = new Set(prev);
      next.add(matchId);
      return next;
    });
  };

  const pickedCount = stillOpen.filter((m) => picks[m.id] !== undefined).length;
  const canSave = signedIn && pickedCount > 0 && !pending;

  const handleSave = () => {
    if (!canSave) return;
    // Send EVERY pick for matches that were open at page load — NOT just the
    // ones the client still considers open. The client-side countdown can flip a
    // card to "locked" a beat before (or, with clock skew, BEFORE) the server's
    // authoritative kickoff lock. Filtering by the client view used to silently
    // DROP those picks: they never reached the server, so they couldn't even be
    // reported as "locked at kickoff" — the pick just vanished. The server is the
    // source of truth: it saves any still-open match and returns rejectedLocked
    // for genuinely-locked ones, which the SaveBar surfaces.
    const payload = openMatches
      .filter((m) => picks[m.id] !== undefined)
      .map((m) => ({ matchId: m.id, pick: picks[m.id]! }));

    setStatus({ kind: "saving" });
    startTransition(async () => {
      let res: SavePicksState;
      try {
        res = await savePredictions(payload);
      } catch {
        setStatus({ kind: "error", message: COPY.predict.saveError });
        return;
      }
      if (!res.ok) {
        const message =
          res.error === "unauthenticated"
            ? COPY.errors.invalidCode
            : COPY.predict.saveError;
        setStatus({ kind: "error", message });
        return;
      }
      // Any picks the server rejected had locked at kickoff — flip them.
      if (res.rejectedLocked.length > 0) {
        setLockedNow((prev) => {
          const next = new Set(prev);
          for (const id of res.rejectedLocked) next.add(id);
          return next;
        });
      }
      setStatus({ kind: "success", saved: res.saved, rejected: res.rejectedLocked });
    });
  };

  const lockedToShow: LockedEntry[] = useMemo(() => {
    // Combine server-known locked entries with cards that locked this session.
    const fromSession: LockedEntry[] = newlyLocked.map((m) => ({
      match: m,
      pick: picks[m.id],
    }));
    return [...fromSession, ...lockedEntries];
  }, [newlyLocked, picks, lockedEntries]);

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <header className="flex flex-col gap-2">
        <p
          className="text-[0.75rem] font-bold uppercase tracking-wide"
          style={{ color: "var(--color-royal)" }}
        >
          {stillOpen.length > 0
            ? `${stillOpen.length} ${stillOpen.length === 1 ? "game" : "games"} · ${groups.length} ${groups.length === 1 ? "matchday" : "matchdays"} open`
            : COPY.predict.title}
        </p>
        <h1 className="display text-[clamp(2rem,7vw,3.25rem)]">
          {COPY.predict.title}
        </h1>
        {stillOpen.length > 0 ? (
          <p className="text-[0.95rem]" style={{ color: "var(--color-muted)" }}>
            {COPY.predict.instruction} Pick as many ahead as you like — all in one
            save.
          </p>
        ) : null}
      </header>

      {!signedIn ? <JoinPrompt /> : null}

      {/* full predictable slate. Matchdays already fully picked start collapsed
          so the user focuses on what's left; the rest open. A sticky strip up
          top tracks progress and jumps to the next unpicked matchday. */}
      {stillOpen.length > 0 ? (
        <section className="flex flex-col gap-4" aria-label="Open matches">
          {signedIn ? (
            <ProgressStrip
              pickedCount={pickedCount}
              total={stillOpen.length}
              hasUnpicked={firstUnpickedDayKey !== null}
              onJump={jumpToNext}
            />
          ) : null}
          {groups.map((group, gi) => (
            <MatchdaySection
              key={group.dayKey}
              domId={`md-${group.dayKey}`}
              group={group}
              defaultOpen={
                signedIn
                  ? !group.matches.every((m) => existingPicks[m.id] !== undefined)
                  : gi === 0
              }
              signedIn={signedIn}
              picks={picks}
              consensus={consensus}
              onSelect={handleSelect}
              onLock={handleLock}
            />
          ))}

          {signedIn ? (
            <SaveBar
              pickedCount={pickedCount}
              total={stillOpen.length}
              pending={pending}
              status={status}
              onSave={handleSave}
              reduce={reduce}
            />
          ) : null}
        </section>
      ) : (
        <EmptyOpen />
      )}

      {/* locked / scored matches, read-only */}
      {lockedToShow.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Locked matches">
          <h2 className="display text-[1.4rem]">Already locked</h2>
          <p className="text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
            {COPY.predict.postLockNote}
          </p>
          {lockedToShow.map((entry, i) => (
            <MatchCard
              key={entry.match.id}
              match={entry.match}
              index={i}
              open={false}
              selected={entry.pick}
              result={entry.result}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------------------
// One matchday's worth of pickable cards, in a collapsible <details> so a long
// multi-week slate stays scannable. The soonest matchday opens by default; the
// rest collapse. Native <details> keeps it keyboard- and screen-reader-friendly
// and needs no extra client state.
// --------------------------------------------------------------------------

function MatchdaySection({
  domId,
  group,
  defaultOpen,
  signedIn,
  picks,
  consensus,
  onSelect,
  onLock,
}: {
  domId: string;
  group: MatchdayGroup;
  defaultOpen: boolean;
  signedIn: boolean;
  picks: Record<string, Outcome>;
  consensus: Record<string, Consensus>;
  onSelect: (matchId: string, pick: Outcome) => void;
  onLock: (matchId: string) => void;
}) {
  // Own the open/closed state so a user's manual collapse STICKS. A controlled
  // `open={defaultOpen}` would fight them: every pick re-renders the board and
  // would force the matchday back open. defaultOpen only seeds the initial state.
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const total = group.matches.length;
  const pickedHere = group.matches.filter(
    (m) => picks[m.id] !== undefined,
  ).length;
  const allPicked = signedIn && pickedHere === total;
  const label =
    group.matchdayNo > 0
      ? fill(COPY.predict.matchdayHeader, {
          n: group.matchdayNo,
          count: total,
        })
      : `${total} games`;

  return (
    <details
      id={domId}
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      className="flex flex-col gap-3 scroll-mt-20"
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] px-3 py-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[var(--color-royal)] focus-visible:outline-offset-2"
        style={{
          border: "var(--border-ink)",
          background: allPicked ? "var(--color-green)" : "var(--color-yellow)",
          color: allPicked ? "#fff" : "var(--color-ink)",
          boxShadow: "var(--shadow-hard-sm)",
        }}
      >
        <span className="display text-[1.1rem]">{label}</span>
        <span className="tnum text-[0.8rem] font-bold">
          {!signedIn
            ? `${total}`
            : allPicked
              ? "✓ all picked"
              : `${pickedHere}/${total} picked`}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {group.matches.map((m, i) => (
          <MatchCard
            key={m.id}
            match={m}
            index={i}
            open={signedIn}
            previewOnly={!signedIn}
            selected={picks[m.id]}
            consensus={consensus[m.id]}
            onSelect={onSelect}
            onLock={onLock}
          />
        ))}
      </div>
    </details>
  );
}

// --------------------------------------------------------------------------
// Sticky progress strip: overall picked count + a jump to the next matchday
// that still has an unpicked game. Sits at the top so the user always knows
// what's left without scrolling.
// --------------------------------------------------------------------------

function ProgressStrip({
  pickedCount,
  total,
  hasUnpicked,
  onJump,
}: {
  pickedCount: number;
  total: number;
  hasUnpicked: boolean;
  onJump: () => void;
}) {
  const pct = total > 0 ? Math.round((pickedCount / total) * 100) : 0;
  return (
    <div className="sticky top-2 z-20">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-3 py-2"
        style={{
          border: "var(--border-ink)",
          background: "var(--color-cream)",
          boxShadow: "var(--shadow-hard-sm)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="tnum whitespace-nowrap text-[0.85rem] font-extrabold">
            {pickedCount}/{total} picked
          </span>
          <span
            className="h-2 min-w-[3rem] flex-1 overflow-hidden rounded-full"
            style={{ border: "1.5px solid var(--color-ink)", background: "var(--color-haze)" }}
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{ width: `${pct}%`, background: "var(--color-green)" }}
            />
          </span>
        </div>
        {hasUnpicked ? (
          <button
            type="button"
            onClick={onJump}
            className="whitespace-nowrap rounded-full px-3 py-1 text-[0.78rem] font-extrabold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[var(--color-royal)] focus-visible:outline-offset-2"
            style={{ border: "var(--border-ink)", background: "var(--color-yellow)" }}
          >
            Next unpicked →
          </button>
        ) : (
          <span className="text-[0.78rem] font-extrabold" style={{ color: "var(--color-green)" }}>
            All done ✓
          </span>
        )}
      </div>
    </div>
  );
}

function SaveBar({
  pickedCount,
  total,
  pending,
  status,
  onSave,
  reduce,
}: {
  pickedCount: number;
  total: number;
  pending: boolean;
  status: SaveStatus;
  onSave: () => void;
  reduce: boolean;
}) {
  return (
    <div className="sticky bottom-3 z-20 mt-1">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] p-3"
        style={{
          border: "var(--border-ink)",
          background: "var(--color-cream)",
          boxShadow: "var(--shadow-hard)",
        }}
      >
        <span className="tnum text-[0.9rem] font-bold">
          {pickedCount} / {total} picked
        </span>
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {status.kind === "success" ? (
              <motion.span
                key="ok"
                initial={reduce ? false : { opacity: 0, x: 8 }}
                animate={reduce ? undefined : { opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                className="text-[0.85rem] font-bold"
                style={{ color: "var(--color-green)" }}
                role="status"
              >
                {status.rejected.length > 0
                  ? `${COPY.predict.saveSuccess} (${status.rejected.length} locked at kickoff)`
                  : COPY.predict.saveSuccess}
              </motion.span>
            ) : status.kind === "error" ? (
              <span
                key="err"
                className="text-[0.85rem] font-bold"
                style={{ color: "var(--color-coral)" }}
                role="alert"
              >
                {status.message}
              </span>
            ) : null}
          </AnimatePresence>
          <Button variant="primary" onClick={onSave} disabled={pending || pickedCount === 0}>
            {pending ? "Saving…" : COPY.predict.saveCta}
          </Button>
        </div>
      </div>
    </div>
  );
}

function JoinPrompt() {
  return (
    <div
      className="flex flex-col gap-2 rounded-[16px] p-4"
      style={{
        border: "var(--border-ink)",
        background: "var(--color-yellow)",
        boxShadow: "var(--shadow-hard-sm)",
      }}
    >
      <p className="font-bold">{COPY.join.subhead}</p>
      <p className="text-[0.85rem]">{COPY.hero.ctaHelper}</p>
      <Link href="/" className="no-underline">
        <Button variant="primary">{COPY.hero.primaryCta} →</Button>
      </Link>
    </div>
  );
}

function EmptyOpen() {
  return (
    <div
      className="rounded-[16px] p-6 text-center"
      style={{
        border: "var(--border-ink)",
        background: "var(--color-cream)",
        boxShadow: "var(--shadow-hard-sm)",
      }}
    >
      <p className="font-bold">{COPY.predict.empty}</p>
    </div>
  );
}
