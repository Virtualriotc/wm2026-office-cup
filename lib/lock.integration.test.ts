// ============================================================================
// SERVER-SIDE LOCK — integration test against the real data store.
//
// This is the critical invariant from goal.md / lib/data.ts: a prediction for a
// match whose kickoff is in the PAST must be REJECTED by the store itself, not
// merely hidden behind a disabled button. We exercise it by BYPASSING the UI
// entirely and calling getStore().savePredictions() directly — exactly the path
// a malicious or buggy client could try to abuse.
//
// Runs on the in-memory mock store (DATABASE_URL unset in this test process).
// The production DEFAULT now seeds the REAL openfootball schedule, so we opt
// into the DEMO snapshot (SEED_DEMO=1) to guarantee an already-kicked-off
// fixture as well as an open one.
//
// The CLOCK IS FROZEN mid-tournament. It used to run against the wall clock,
// which quietly stopped working the moment the real cup finished: with every
// fixture in the past there is no open match left to accept a pick, so the
// test failed for a reason that had nothing to do with the lock. A fixed
// instant makes it deterministic forever.
//
// Both the env flag and the clock are set BEFORE the first getStore() so the
// memoized MockStore seeds against them.
// ============================================================================

process.env.SEED_DEMO = "1";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getStore } from "./data";
import type { User } from "./types";

// Group stage under way: earlier fixtures locked, knockouts still ahead.
// Only Date is faked — timers and promises keep working normally.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));

describe("server-side lock (store.savePredictions)", () => {
  const store = getStore();
  let user: User;
  let lockedMatchId: string;
  let openMatchId: string;

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeAll(async () => {
    // A fresh participant, so we don't collide with the seeded demo picks.
    const created = await store.createUser("Lock Tester", "Energy Ops");
    user = created.user;

    const matches = await store.getMatches();
    const now = Date.now();
    const locked = matches.find((m) => new Date(m.kickoff).getTime() <= now);
    // A future match savePredictions will ACCEPT. Once the group stage ends,
    // EVERY future match is an unresolved knockout placeholder (which the store
    // rightly rejects as unpredictable), so resolve a future KO slot to real
    // teams here — keeping this test date-robust through the whole tournament.
    const futureKo = matches.find(
      (m) => new Date(m.kickoff).getTime() > now && m.stage !== "group",
    );
    expect(locked, "seed must include at least one already-kicked-off match").toBeTruthy();
    expect(futureKo, "seed must include a future knockout slot").toBeTruthy();
    await store.setMatchTeams(futureKo!.id, "Locklandia", "Testovia");
    lockedMatchId = locked!.id;
    openMatchId = futureKo!.id;
  });

  it("REJECTS a pick on a match whose kickoff has passed", async () => {
    const res = await store.savePredictions(user.id, [
      { matchId: lockedMatchId, pick: "home" },
    ]);
    expect(res.saved).toBe(0);
    expect(res.rejectedLocked).toContain(lockedMatchId);

    // And nothing was persisted for that locked match.
    const preds = await store.getPredictionsForUser(user.id);
    expect(preds.find((p) => p.matchId === lockedMatchId)).toBeUndefined();
  });

  it("ACCEPTS a pick on a match still open (kickoff in the future)", async () => {
    const res = await store.savePredictions(user.id, [
      { matchId: openMatchId, pick: "home" },
    ]);
    expect(res.saved).toBe(1);
    expect(res.rejectedLocked).not.toContain(openMatchId);

    const preds = await store.getPredictionsForUser(user.id);
    expect(preds.find((p) => p.matchId === openMatchId)?.pick).toBe("home");
  });

  it("rejects only the locked legs of a mixed batch, saving the open ones", async () => {
    const res = await store.savePredictions(user.id, [
      { matchId: lockedMatchId, pick: "away" },
      { matchId: openMatchId, pick: "away" }, // overwrite the open pick
    ]);
    expect(res.rejectedLocked).toEqual([lockedMatchId]);
    expect(res.saved).toBe(1);

    const preds = await store.getPredictionsForUser(user.id);
    // The open pick was upserted to "away"; the locked one never landed.
    expect(preds.find((p) => p.matchId === openMatchId)?.pick).toBe("away");
    expect(preds.find((p) => p.matchId === lockedMatchId)).toBeUndefined();
  });

  it("treats an unknown match id as rejected, never silently saved", async () => {
    const res = await store.savePredictions(user.id, [
      { matchId: "m-does-not-exist", pick: "home" },
    ]);
    expect(res.saved).toBe(0);
    expect(res.rejectedLocked).toContain("m-does-not-exist");
  });
});
