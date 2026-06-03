// ============================================================================
// runStoreContract — the PROOF that MockStore and the Drizzle-backed store
// behave IDENTICALLY. One reusable suite, run against both implementations.
//
// Every store under test runs on a FIXED clock (2026-07-01T00:00:00Z) so the
// shared REAL openfootball 2026 schedule (104 fixtures) partitions
// deterministically:
//   - past kickoffs (group + early knockouts, through late Jun) => locked
//   - future kickoffs (semis Jul 14–15, final Jul 19)           => open
// Both stores are seeded clean (departments + fixtures only, NO demo snapshot),
// so the full-state assertions (leaderboards, dept guard, climb-delta) compare
// apples to apples.
//
// What it asserts, identically on both:
//   1. create user + add-your-own department (dynamic department creation)
//   2. server-side lock: REJECT a past-kickoff pick, ACCEPT an open one
//   3. UNIQUE(userId, matchId) upsert: second pick overwrites, never duplicates
//   4. feed result, then organizer override precedence
//   5. recompute leaderboards + climb-delta across two recomputes
//   6. consensus
//   7. MIN_ACTIVE_MEMBERS=3 department guard (1-/2-member dept ineligible)
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";
import type { DataStore } from "../lib/data";

export interface ContractStore {
  store: DataStore;
  /** A match whose kickoff is in the PAST under the fixed clock (locked). */
  lockedMatchId: string;
  /** A match whose kickoff is in the FUTURE under the fixed clock (open). */
  openMatchId: string;
  /** A second open match, used for the consensus + lock-batch checks. */
  secondOpenMatchId: string;
  /**
   * A FUTURE knockout match whose teams stay bracket PLACEHOLDERS (never
   * resolved in this suite). Used to prove the savePredictions semantic gate
   * rejects picks on unpredictable (unresolved) matches.
   */
  unresolvedKoMatchId: string;
}

export type MakeContractStore = () => Promise<ContractStore>;

/**
 * Register the shared contract against a single store factory.
 * @param label  human name for the describe block ("MockStore" / "DrizzleStore")
 * @param make   builds a fresh, clean, fixed-clock store + its known match ids
 */
export function runStoreContract(label: string, make: MakeContractStore): void {
  describe(`DataStore contract — ${label}`, () => {
    let ctx: ContractStore;
    let store: DataStore;

    beforeAll(async () => {
      ctx = await make();
      store = ctx.store;
    });

    it("seeds the seed departments and the full fixture list", async () => {
      const depts = await store.getDepartments();
      // Five Energy lanes + the privacy "Other / prefer not to say" lane.
      expect(depts.length).toBe(6);
      expect(depts.map((d) => d.slug).sort()).toContain("energy-ops");
      expect(depts.map((d) => d.slug)).toContain("other");

      const matches = await store.getMatches();
      // The full REAL openfootball 2026 schedule: 104 fixtures.
      expect(matches.length).toBe(104);
      // Sorted by kickoff ascending.
      const kos = matches.map((m) => m.kickoff);
      expect([...kos].sort()).toEqual(kos);
    });

    it("partitions matches into locked/open by the fixed clock", async () => {
      const matches = await store.getMatches();
      const locked = matches.find((m) => m.id === ctx.lockedMatchId)!;
      const open = matches.find((m) => m.id === ctx.openMatchId)!;
      // A past-kickoff match with no result reads as 'locked'.
      expect(locked.status).toBe("locked");
      expect(open.status).toBe("scheduled");
    });

    it("getPredictableMatches surfaces only future matches with REAL teams", async () => {
      const predictable = await store.getPredictableMatches();
      // Kickoff-sorted.
      const kos = predictable.map((m) => m.kickoff);
      expect([...kos].sort()).toEqual(kos);
      // Every one is open (not locked) and has two real teams.
      for (const m of predictable) {
        expect(m.status).toBe("scheduled");
        expect(m.home).not.toMatch(/^(W|L|R)\d|^[1-9][0-9]?[A-L]$|^3[A-L]\//);
        expect(m.away).not.toMatch(/^(W|L|R)\d|^[1-9][0-9]?[A-L]$|^3[A-L]\//);
      }
      // The openMatchId (the final) is a still-placeholder KO match at this
      // clock, so it is EXCLUDED until resolved.
      expect(predictable.some((m) => m.id === ctx.openMatchId)).toBe(false);
    });

    it("setMatchTeams resolves a KO placeholder; it then becomes predictable", async () => {
      // The openMatchId (the final) still holds bracket placeholders.
      const before = (await store.getMatches()).find(
        (m) => m.id === ctx.openMatchId,
      )!;
      expect(/^W\d+$/.test(before.home)).toBe(true); // e.g. "W101"

      const updated = await store.setMatchTeams(
        ctx.openMatchId,
        "Brazil",
        "France",
      );
      expect(updated.home).toBe("Brazil");
      expect(updated.away).toBe("France");

      // Re-read confirms the overwrite persisted.
      const after = (await store.getMatches()).find(
        (m) => m.id === ctx.openMatchId,
      )!;
      expect(after.home).toBe("Brazil");
      expect(after.away).toBe("France");

      // Now the resolved, still-future final IS predictable.
      const predictable = await store.getPredictableMatches();
      expect(predictable.some((m) => m.id === ctx.openMatchId)).toBe(true);

      // Resolve the second open KO match too, so later prediction/consensus
      // checks pick on a match with REAL teams (the savePredictions semantic
      // gate rejects picks on unresolved placeholder matches by design).
      await store.setMatchTeams(ctx.secondOpenMatchId, "Spain", "Portugal");
      const predictable2 = await store.getPredictableMatches();
      expect(predictable2.some((m) => m.id === ctx.secondOpenMatchId)).toBe(true);

      // Unknown match id throws (parity on the guard).
      await expect(
        store.setMatchTeams("m-nope", "A", "B"),
      ).rejects.toThrow();
    });

    it("creates a user in an EXISTING department by name", async () => {
      const { user, code } = await store.createUser("Alice", "Energy Ops");
      expect(user.id).toBeTruthy();
      expect(user.displayName).toBe("Alice");
      expect(user.isOrganizer).toBe(false);
      // Code is shown once; tokenHash is the SHA-256 of it, never the raw code.
      expect(code).toMatch(/^MP-/);
      expect(user.tokenHash).not.toBe(code);
      expect(user.tokenHash.length).toBe(64); // SHA-256 hex

      const dept = (await store.getDepartments()).find(
        (d) => d.id === user.departmentId,
      )!;
      expect(dept.name).toBe("Energy Ops");

      // Round-trips by id and by token.
      expect((await store.getUser(user.id))?.id).toBe(user.id);
      expect((await store.getUserByToken(user.tokenHash))?.id).toBe(user.id);
    });

    it("creates a user with a BRAND-NEW department (add-your-own lane)", async () => {
      const before = (await store.getDepartments()).length;
      const { user } = await store.createUser("Mallory", "Skunkworks");
      const after = await store.getDepartments();
      expect(after.length).toBe(before + 1);
      const dept = after.find((d) => d.id === user.departmentId)!;
      expect(dept.name).toBe("Skunkworks");
      expect(dept.slug).toBe("skunkworks");
      // Idempotent on slug: the same new name resolves to the same department.
      const again = await store.getOrCreateDepartmentByName("skunkworks");
      expect(again.id).toBe(dept.id);
      expect((await store.getDepartments()).length).toBe(after.length);
    });

    it("REJECTS a pick on a locked (past-kickoff) match — server-side lock", async () => {
      const { user } = await store.createUser("Bob", "Energy Tech");
      const res = await store.savePredictions(user.id, [
        { matchId: ctx.lockedMatchId, pick: "home" },
      ]);
      expect(res.saved).toBe(0);
      expect(res.rejectedLocked).toContain(ctx.lockedMatchId);
      const preds = await store.getPredictionsForUser(user.id);
      expect(preds.find((p) => p.matchId === ctx.lockedMatchId)).toBeUndefined();
    });

    it("ACCEPTS a pick on an open match, and rejects unknown match ids", async () => {
      const { user } = await store.createUser("Cara", "Energy Tech");
      const res = await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "home" },
        { matchId: "m-does-not-exist", pick: "away" },
      ]);
      expect(res.saved).toBe(1);
      expect(res.rejectedLocked).toContain("m-does-not-exist");
      const preds = await store.getPredictionsForUser(user.id);
      expect(preds.find((p) => p.matchId === ctx.openMatchId)?.pick).toBe("home");
    });

    it("REJECTS a 'draw' pick on a KNOCKOUT match (knockouts always resolve)", async () => {
      // openMatchId is the FINAL (resolved to real teams above): a 'draw' there
      // is semantically invalid and must be rejected, never saved.
      const { user } = await store.createUser("Nadia", "Energy Tech");
      const res = await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "draw" },
      ]);
      expect(res.saved).toBe(0);
      expect(res.rejectedLocked).toContain(ctx.openMatchId);
      const preds = await store.getPredictionsForUser(user.id);
      expect(preds.find((p) => p.matchId === ctx.openMatchId)).toBeUndefined();

      // A home/away pick on the SAME knockout match is still accepted.
      const ok = await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "home" },
      ]);
      expect(ok.saved).toBe(1);
    });

    it("REJECTS any pick on an UNRESOLVED knockout match (placeholder teams)", async () => {
      // unresolvedKoMatchId still holds bracket placeholders -> not predictable.
      const { user } = await store.createUser("Omar", "Energy Tech");
      const res = await store.savePredictions(user.id, [
        { matchId: ctx.unresolvedKoMatchId, pick: "home" },
      ]);
      expect(res.saved).toBe(0);
      expect(res.rejectedLocked).toContain(ctx.unresolvedKoMatchId);
      const preds = await store.getPredictionsForUser(user.id);
      expect(
        preds.find((p) => p.matchId === ctx.unresolvedKoMatchId),
      ).toBeUndefined();
    });

    it("deleteUser hard-removes the user + their picks; they vanish from the board", async () => {
      // A fresh, scored user on a resolved match, then erased.
      const { user } = await store.createUser("Petra", "Energy CS");
      await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "home" },
      ]);
      // They exist and have a pick + a leaderboard row.
      expect((await store.getUser(user.id))?.id).toBe(user.id);
      expect(
        (await store.getPredictionsForUser(user.id)).length,
      ).toBeGreaterThan(0);
      const before = await store.getLeaderboard();
      expect(before.some((r) => r.userId === user.id)).toBe(true);

      // Erase.
      await store.deleteUser(user.id);

      // Gone from every surface.
      expect(await store.getUser(user.id)).toBeNull();
      expect(await store.getUserByToken(user.tokenHash)).toBeNull();
      expect((await store.getPredictionsForUser(user.id)).length).toBe(0);
      const after = await store.getLeaderboard();
      expect(after.some((r) => r.userId === user.id)).toBe(false);

      // Idempotent: deleting again is a harmless no-op.
      await expect(store.deleteUser(user.id)).resolves.toBeUndefined();
    });

    it("UPSERTS on (userId, matchId): a second pick overwrites, never duplicates", async () => {
      const { user } = await store.createUser("Dora", "Energy Tech");
      await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "home" },
      ]);
      await store.savePredictions(user.id, [
        { matchId: ctx.openMatchId, pick: "away" },
      ]);
      const preds = await store.getPredictionsForUser(user.id);
      const forMatch = preds.filter((p) => p.matchId === ctx.openMatchId);
      expect(forMatch.length).toBe(1); // no duplicate row
      expect(forMatch[0]!.pick).toBe("away"); // overwritten
    });

    it("records a feed result, then an organizer override wins", async () => {
      // Feed first (authoritative default).
      const feed = await store.recordFeedResult(ctx.openMatchId, "home");
      expect(feed.source).toBe("feed");
      expect(feed.outcome).toBe("home");

      // A second feed value refreshes the feed result in place.
      const feed2 = await store.recordFeedResult(ctx.openMatchId, "draw");
      expect(feed2.source).toBe("feed");
      expect(feed2.outcome).toBe("draw");

      // Organizer override wins and is stamped 'organizer'.
      const org = await store.setResult(ctx.openMatchId, "away");
      expect(org.source).toBe("organizer");
      expect(org.outcome).toBe("away");

      // A later feed value must NOT clobber the organizer override.
      const feed3 = await store.recordFeedResult(ctx.openMatchId, "home");
      expect(feed3.source).toBe("organizer");
      expect(feed3.outcome).toBe("away");

      const stored = (await store.getResults()).find(
        (r) => r.matchId === ctx.openMatchId,
      )!;
      expect(stored.source).toBe("organizer");
      expect(stored.outcome).toBe("away");

      // Once a result exists, the match reads as 'final'.
      const match = (await store.getMatches()).find(
        (m) => m.id === ctx.openMatchId,
      )!;
      expect(match.status).toBe("final");
    });

    it("computes office consensus from this store's own predictions", async () => {
      // Three users pick on secondOpenMatchId: 2 home, 1 away => 67/0/33.
      const a = await store.createUser("Eve", "Energy CS");
      const b = await store.createUser("Frank", "Energy CS");
      const c = await store.createUser("Gita", "Energy CS");
      await store.savePredictions(a.user.id, [
        { matchId: ctx.secondOpenMatchId, pick: "home" },
      ]);
      await store.savePredictions(b.user.id, [
        { matchId: ctx.secondOpenMatchId, pick: "home" },
      ]);
      await store.savePredictions(c.user.id, [
        { matchId: ctx.secondOpenMatchId, pick: "away" },
      ]);
      const consensus = await store.getConsensus(ctx.secondOpenMatchId);
      expect(consensus.n).toBe(3);
      expect(consensus.pctHome).toBe(67);
      expect(consensus.pctDraw).toBe(0);
      expect(consensus.pctAway).toBe(33);
    });

    it("recomputes leaderboards, the dept guard, and a real climb-delta", async () => {
      // Fresh, deterministic department + user set so this assertion does not
      // depend on the order of earlier tests. We reuse three seed departments
      // and one tiny new one.
      //   - "Energy Finance" (Fin): 3 active members, modest score => ELIGIBLE
      //   - "Energy Invoicing" (Inv): 1 active member, perfect score => INELIGIBLE
      // The open match openMatchId resolved to "away" above; we score against it.
      const finA = await store.createUser("Hugo", "Energy Finance");
      const finB = await store.createUser("Iris", "Energy Finance");
      const finC = await store.createUser("Jack", "Energy Finance");
      const invLone = await store.createUser("Kара", "Energy Invoicing");

      // openMatchId result == "away". Fin: 2 correct, 1 wrong. Inv lone: correct.
      await store.savePredictions(finA.user.id, [
        { matchId: ctx.openMatchId, pick: "away" }, // correct
      ]);
      await store.savePredictions(finB.user.id, [
        { matchId: ctx.openMatchId, pick: "away" }, // correct
      ]);
      await store.savePredictions(finC.user.id, [
        { matchId: ctx.openMatchId, pick: "home" }, // wrong
      ]);
      await store.savePredictions(invLone.user.id, [
        { matchId: ctx.openMatchId, pick: "away" }, // correct, but lone member
      ]);

      // First recompute establishes a baseline (previous ranks empty => delta 0).
      const first = await store.getDepartmentStandings();
      const finFirst = first.find((d) => d.departmentId === "dept-energy-finance")!;
      const invFirst = first.find(
        (d) => d.departmentId === "dept-energy-invoicing",
      )!;
      expect(finFirst.activeMembers).toBe(3);
      expect(finFirst.eligible).toBe(true);
      // openMatchId is a knockout (r16/qf/sf/final) worth > 1; 2 correct of 3.
      expect(finFirst.avgPoints).toBeGreaterThan(0);
      // The lone-member dept is ineligible regardless of its perfect average.
      expect(invFirst.activeMembers).toBe(1);
      expect(invFirst.eligible).toBe(false);
      // An eligible dept always ranks above an ineligible one.
      expect(finFirst.rank).toBeLessThan(invFirst.rank);

      // User leaderboard: correct knockout pickers sit above the wrong picker.
      const board = await store.getLeaderboard();
      const finApts = board.find((r) => r.userId === finA.user.id)!.points;
      const finCpts = board.find((r) => r.userId === finC.user.id)!.points;
      expect(finApts).toBeGreaterThan(0);
      expect(finCpts).toBe(0);

      // Now flip a pick and recompute: finC gets it right, climbs; deltas appear.
      const finCRankBefore = board.find((r) => r.userId === finC.user.id)!.rank;
      await store.savePredictions(finC.user.id, [
        { matchId: ctx.openMatchId, pick: "away" }, // now correct
      ]);
      const board2 = await store.getLeaderboard();
      const finCAfter = board2.find((r) => r.userId === finC.user.id)!;
      expect(finCAfter.points).toBeGreaterThan(0);
      // climbDelta is computed against the previous persisted ranks: finC moved
      // up (or held), so its delta is >= 0 and the rank improved or tied.
      expect(finCAfter.rank).toBeLessThanOrEqual(finCRankBefore);
      expect(finCAfter.climbDelta).toBe(finCRankBefore - finCAfter.rank);
    });

    it("tracks the sync heartbeat (markSync + getSyncStatus)", async () => {
      const before = await store.getSyncStatus();
      expect(before.feedResultCount).toBeGreaterThanOrEqual(0);
      await store.markSync("contract sync pass");
      const after = await store.getSyncStatus();
      expect(after.lastSyncAt).not.toBeNull();
      expect(after.lastSyncNote).toBe("contract sync pass");
    });
  });
}
