"use client";

import { useState } from "react";
import type { LeaderboardRow, Department } from "@/lib/types";
import { Card } from "@/components/ui";

const MEDAL = ["🥇", "🥈", "🥉"];
const INITIAL = 5;

/** Next reveal size: 5 → 30 → 60 → everyone. Skips a step that would overshoot
 *  the actual player count (e.g. 42 players goes 5 → 30 → 42). */
function nextThreshold(shown: number, total: number): number {
  for (const t of [30, 60]) if (shown < t && t < total) return t;
  return total;
}

/**
 * Individual leaderboard for the scoreboard: opens at the top 5, then a button
 * progressively reveals more of the field (top 30, top 60, then everyone) and
 * collapses back. The viewer's own row stays pinned (and highlighted) even when
 * it's outside the currently-shown slice. Before any match is scored it shows a
 * "starts at kickoff" note instead of a meaningless all-zero list.
 */
export function TopPlayers({
  rows,
  departments,
  viewerId,
  title = "Top players",
}: {
  rows: LeaderboardRow[];
  departments: Department[];
  viewerId: string | null;
  /** Heading override — the finale page calls these the final standings. */
  title?: string;
}) {
  const [shown, setShown] = useState(INITIAL);
  if (rows.length === 0) return null;

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const anyScored = rows.some((r) => r.points > 0);

  const visible = rows.slice(0, shown);
  const viewer = viewerId ? rows.find((r) => r.userId === viewerId) : null;
  const viewerOutside =
    viewer != null && !visible.some((r) => r.userId === viewer.userId);
  const atAll = shown >= rows.length;
  const next = nextThreshold(shown, rows.length);

  const Row = ({ r, you }: { r: LeaderboardRow; you: boolean }) => (
    <li
      className="flex items-center gap-2.5 px-1 py-1.5 text-[0.9rem]"
      style={you ? { background: "var(--color-yellow)", borderRadius: 8 } : undefined}
    >
      <span className="tnum w-7 shrink-0 text-center font-extrabold">
        {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">
        {you ? "You · " : ""}
        {r.displayName}
        <span className="font-normal" style={{ color: "var(--color-muted)" }}>
          {" "}
          · {deptName.get(r.departmentId) ?? "—"}
        </span>
      </span>
      <span className="tnum shrink-0 font-extrabold">
        {r.points} {r.points === 1 ? "pt" : "pts"}
      </span>
    </li>
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="display text-[1.15rem]">{title}</h2>
        {anyScored ? (
          <span
            className="tnum text-[0.72rem] font-bold"
            style={{ color: "var(--color-muted)" }}
          >
            {rows.length} playing
          </span>
        ) : null}
      </div>

      {!anyScored ? (
        <p className="text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          Standings open when the first match kicks off. Get your picks in.
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((r) => (
              <Row key={r.userId} r={r} you={r.userId === viewerId} />
            ))}
            {viewerOutside ? (
              <>
                <li
                  className="my-1 text-center text-[0.7rem]"
                  style={{ color: "var(--color-muted)" }}
                  aria-hidden
                >
                  · · ·
                </li>
                <Row r={viewer!} you />
              </>
            ) : null}
          </ul>

          {rows.length > INITIAL ? (
            <button
              type="button"
              onClick={() => setShown(atAll ? INITIAL : next)}
              aria-expanded={!atAll ? undefined : true}
              className="nb-btn nb-btn--secondary mt-3 w-full text-[0.82rem]"
            >
              {atAll
                ? "Show less ▴"
                : next >= rows.length
                  ? `Show all ${rows.length} ▾`
                  : `Show top ${next} ▾`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}
