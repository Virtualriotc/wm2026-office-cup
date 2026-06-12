import Link from "next/link";
import type { Consensus, Outcome, Result } from "@/lib/types";
import { getStore } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import {
  PredictBoard,
  type LockedEntry,
} from "@/components/predict/PredictBoard";
import { buildRelativeView } from "@/components/scoreboard/relative";
import { Leaderboard } from "@/components/scoreboard/Leaderboard";

// Always render against the live clock + store: lock state is time-sensitive.
export const dynamic = "force-dynamic";

/**
 * PREDICT screen (server component).
 *
 * Loads the FULL predictable slate (every future match with both real teams —
 * the whole group stage now, KO matches as their brackets resolve) plus the
 * user's locked/scored picks, then hands a fully serializable view-model to the
 * client board. Nothing authoritative is decided here: the lock and the write
 * both run server-side in the store / the save action. This page only chooses
 * what to show; the board groups it by matchday.
 */
export default async function PredictPage() {
  const store = getStore();
  const user = await getCurrentUser();

  const [allMatches, openMatches, results, leaderboard, departments] =
    await Promise.all([
      store.getMatches(),
      store.getPredictableMatches(),
      store.getResults(),
      store.getLeaderboard(),
      store.getDepartments(),
    ]);

  const resultByMatch = new Map<string, Result>(
    results.map((r) => [r.matchId, r]),
  );

  // The user's picks (if signed in), keyed by matchId.
  const predictions = user ? await store.getPredictionsForUser(user.id) : [];
  const pickByMatch = new Map<string, Outcome>(
    predictions.map((p) => [p.matchId, p.pick]),
  );

  // Existing picks for the OPEN matches seed the board's editable state.
  const existingPicks: Record<string, Outcome> = {};
  for (const m of openMatches) {
    const pick = pickByMatch.get(m.id);
    if (pick !== undefined) existingPicks[m.id] = pick;
  }

  const openIds = new Set(openMatches.map((m) => m.id));

  // Locked/scored entries to show read-only: any non-open match the user
  // picked, plus any match that is already final (so they see results even if
  // they missed it). Newest kickoff first so recent action is on top.
  const lockedEntries: LockedEntry[] = allMatches
    .filter((m) => !openIds.has(m.id))
    .filter((m) => pickByMatch.has(m.id) || resultByMatch.has(m.id))
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .map((m) => ({
      match: m,
      pick: pickByMatch.get(m.id),
      result: resultByMatch.get(m.id),
    }));

  // Office consensus for the open matches (optional crowd signal).
  const consensusList = await Promise.all(
    openMatches.map((m) => store.getConsensus(m.id)),
  );
  const consensus: Record<string, Consensus> = {};
  openMatches.forEach((m, i) => {
    consensus[m.id] = consensusList[i]!;
  });

  // Your personal standing (rank, who's in reach, leaders). The department race
  // + top-5 list live on the scoreboard, so this is the only individual board.
  const view = buildRelativeView(leaderboard, departments, user?.id ?? null);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="display text-[1.15rem]">Where you stand</h2>
          <Link
            href="/scoreboard"
            className="text-[0.78rem] font-extrabold no-underline"
            style={{ color: "var(--color-royal)" }}
          >
            The race →
          </Link>
        </div>
        <Leaderboard
          view={view}
          standings={[]}
          youDeptId={user?.departmentId ?? null}
          personalOnly
        />
      </Card>
      <PredictBoard
        signedIn={user !== null}
        openMatches={openMatches}
        allMatches={allMatches}
        existingPicks={existingPicks}
        lockedEntries={lockedEntries}
        consensus={consensus}
      />
    </div>
  );
}
