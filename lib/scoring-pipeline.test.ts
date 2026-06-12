// ============================================================================
// SCORING PIPELINE — end-to-end proof, run on BOTH stores (MockStore AND the
// real DrizzleStore on Postgres-in-WASM). Simulates a finished matchday:
//   pick  ->  setResult  ->  getLeaderboard (points)  ->  getAwards (Hot
//   Streak)
// This is the chain that fires for the first time when real results land on
// 11 Jun. Proving it here means it won't first run untested in production.
// ============================================================================

import { describe, it, expect } from "vitest";
import { MockStore } from "./data";
import { DrizzleStore } from "../db/drizzleStore";
import { makePgliteDb } from "../test/pgliteDb";
import type { DataStore } from "./data";

// Pre-tournament clock, so every group match is still open (pickable).
const CLOCK = new Date("2026-06-01T00:00:00Z");
class ClockMock extends MockStore {
  protected override now(): Date {
    return CLOCK;
  }
}
class ClockDrizzle extends DrizzleStore {
  protected override now(): Date {
    return CLOCK;
  }
}

async function makeMock(): Promise<DataStore> {
  const s = new ClockMock({ seedDemo: false });
  await s.seedFromOpenfootball();
  return s;
}
async function makeDrizzle(): Promise<DataStore> {
  const s = new ClockDrizzle(await makePgliteDb());
  await s.seedFromOpenfootball();
  return s;
}

function runPipeline(label: string, make: () => Promise<DataStore>) {
  describe(`scoring pipeline — ${label}`, () => {
    it("a scored matchday awards points + fires Hot Streak end-to-end", async () => {
      const store = await make();
      const depts = await store.getDepartments();
      const deptA = depts[0]!.id;

      // 3 group matches on the SAME calendar day = one matchday.
      const group = (await store.getPredictableMatches()).filter(
        (m) => m.stage === "group",
      );
      const byDay: Record<string, typeof group> = {};
      for (const m of group) (byDay[m.kickoff.slice(0, 10)] ??= []).push(m);
      const day = Object.keys(byDay)
        .sort()
        .find((d) => byDay[d]!.length >= 3)!;
      const [m1, m2, m3] = byDay[day]!.slice(0, 3);

      const { user: alice } = await store.createUser("Alice", deptA);
      const { user: bob } = await store.createUser("Bob", deptA);
      const { user: carol } = await store.createUser("Carol", deptA);

      // Carol nails all 3, Bob 2, Alice 0 (results will be "home" on all three).
      await store.savePredictions(carol.id, [
        { matchId: m1!.id, pick: "home" },
        { matchId: m2!.id, pick: "home" },
        { matchId: m3!.id, pick: "home" },
      ]);
      await store.savePredictions(bob.id, [
        { matchId: m1!.id, pick: "home" },
        { matchId: m2!.id, pick: "home" },
        { matchId: m3!.id, pick: "away" },
      ]);
      await store.savePredictions(alice.id, [
        { matchId: m1!.id, pick: "away" },
        { matchId: m2!.id, pick: "draw" },
        { matchId: m3!.id, pick: "draw" },
      ]);

      // BEFORE results: all-zero board, no result-based award (hot streak null).
      let board = await store.getLeaderboard();
      expect(board.every((r) => r.points === 0)).toBe(true);
      let awards = await store.getAwards();
      expect(awards.hotStreak).toBeNull();

      // THE EVENT: the matchday is played — results come in.
      await store.setResult(m1!.id, "home");
      await store.setResult(m2!.id, "home");
      await store.setResult(m3!.id, "home");

      // Points awarded + board reorders.
      board = await store.getLeaderboard();
      const pts = Object.fromEntries(board.map((r) => [r.displayName, r.points]));
      expect(pts["Carol"]).toBe(3);
      expect(pts["Bob"]).toBe(2);
      expect(pts["Alice"]).toBe(0);
      expect(board[0]!.displayName).toBe("Carol"); // Carol now tops the board

      // The result-based award (Hot Streak) populates from the scored matchday.
      awards = await store.getAwards();
      expect(awards.hotStreak?.displayName).toBe("Carol");
      expect(awards.hotStreak?.detail).toBe("3 in a row");
    });
  });
}

runPipeline("MockStore", makeMock);
runPipeline("DrizzleStore (PGlite — real Postgres)", makeDrizzle);
