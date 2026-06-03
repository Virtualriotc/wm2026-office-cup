import { describe, it, expect } from "vitest";
import {
  STAGE_POINTS,
  MIN_ACTIVE_MEMBERS,
  scoreMatch,
  recomputeLeaderboards,
  computeConsensus,
  resolveResult,
} from "./scoring";
import type {
  Stage,
  User,
  Prediction,
  Result,
  Department,
} from "./types";

const STAGES: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];

function pred(
  userId: string,
  matchId: string,
  pick: Prediction["pick"],
): Prediction {
  return {
    id: `${userId}-${matchId}`,
    userId,
    matchId,
    pick,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

function result(
  matchId: string,
  outcome: Result["outcome"],
  source: Result["source"] = "organizer",
): Result {
  return {
    matchId,
    outcome,
    source,
    updatedAt: "2026-06-12T00:00:00.000Z",
  };
}

describe("scoreMatch", () => {
  it("awards the stage's points for a correct pick at every stage", () => {
    for (const stage of STAGES) {
      const m = `m-${stage}`;
      expect(scoreMatch(pred("u1", m, "home"), result(m, "home"), stage)).toBe(
        STAGE_POINTS[stage],
      );
    }
  });

  it("knockout stages are weighted higher than group (1<2<3<4<5<6)", () => {
    expect(STAGE_POINTS.group).toBe(1);
    expect(STAGE_POINTS.r32).toBe(2);
    expect(STAGE_POINTS.r16).toBe(3);
    expect(STAGE_POINTS.qf).toBe(4);
    expect(STAGE_POINTS.sf).toBe(5);
    expect(STAGE_POINTS.final).toBe(6);
  });

  it("awards 0 for a wrong pick", () => {
    expect(scoreMatch(pred("u1", "m1", "home"), result("m1", "away"), "qf")).toBe(
      0,
    );
  });

  it("awards 0 for a missed pick (no prediction)", () => {
    expect(scoreMatch(undefined, result("m1", "home"), "final")).toBe(0);
    expect(scoreMatch(null, result("m1", "home"), "group")).toBe(0);
  });

  it("awards 0 when the match has no result yet", () => {
    expect(scoreMatch(pred("u1", "m1", "home"), undefined, "sf")).toBe(0);
  });

  it("scores draws correctly in the group stage", () => {
    expect(scoreMatch(pred("u1", "m1", "draw"), result("m1", "draw"), "group")).toBe(
      1,
    );
    expect(scoreMatch(pred("u1", "m1", "draw"), result("m1", "home"), "group")).toBe(
      0,
    );
  });
});

describe("recomputeLeaderboards", () => {
  const departments: Department[] = [
    { id: "d1", name: "Tech", slug: "tech", color: "#FFD23F" },
    { id: "d2", name: "Sales", slug: "sales", color: "#2F4BE0" },
  ];

  function user(id: string, name: string, deptId: string): User {
    return {
      id,
      displayName: name,
      departmentId: deptId,
      tokenHash: "x",
      isOrganizer: false,
      joinedAt: "2026-06-02T00:00:00.000Z",
    };
  }

  const matchStages: Record<string, Stage> = {
    g1: "group",
    g2: "group",
    f1: "final",
  };

  it("ranks users by points desc and computes percentile + ineligible draws", () => {
    const users = [
      user("u1", "Alice", "d1"),
      user("u2", "Bob", "d1"),
      user("u3", "Cara", "d2"),
    ];
    const predictions: Prediction[] = [
      pred("u1", "g1", "home"), // +1
      pred("u1", "f1", "home"), // +6  => 7
      pred("u2", "g1", "home"), // +1  => 1
      pred("u3", "g1", "away"), // 0   => 0  (active, but wrong)
    ];
    const results: Result[] = [result("g1", "home"), result("f1", "home")];

    const { leaderboard, departments: depts } = recomputeLeaderboards({
      users,
      predictions,
      results,
      matchStages,
      departments,
    });

    expect(leaderboard.map((r) => r.userId)).toEqual(["u1", "u2", "u3"]);
    expect(leaderboard[0]!.points).toBe(7);
    expect(leaderboard[1]!.points).toBe(1);
    expect(leaderboard[2]!.points).toBe(0);
    // percentile: rank/total * 100
    expect(leaderboard[0]!.percentile).toBe(33);
    expect(leaderboard[2]!.percentile).toBe(100);

    // Department avg = points / active members.
    // d1: (7 + 1)/2 = 4 ; d2: 0/1 = 0
    const d1 = depts.find((d) => d.departmentId === "d1")!;
    const d2 = depts.find((d) => d.departmentId === "d2")!;
    expect(d1.avgPoints).toBe(4);
    expect(d1.activeMembers).toBe(2);
    expect(d2.avgPoints).toBe(0);
    expect(d1.rank).toBe(1);
    expect(d2.rank).toBe(2);
  });

  it("excludes members with no picks from the department average (active only)", () => {
    const users = [
      user("u1", "Alice", "d1"), // 3 pts, active
      user("u2", "Bob", "d1"), // no picks => not active, excluded
    ];
    const predictions: Prediction[] = [pred("u1", "g1", "home")];
    const results: Result[] = [result("g1", "home")];
    const { departments: depts } = recomputeLeaderboards({
      users,
      predictions,
      results,
      matchStages: { g1: "r16" }, // 3 pts
      departments: [departments[0]!],
    });
    const d1 = depts.find((d) => d.departmentId === "d1")!;
    expect(d1.avgPoints).toBe(3); // 3 / 1 active, not 3 / 2 members
    expect(d1.activeMembers).toBe(1);
  });

  it("MIN_ACTIVE_MEMBERS guard: a sub-threshold dept is ineligible and can't top the table", () => {
    expect(MIN_ACTIVE_MEMBERS).toBe(3);
    // d1 (Tech): 3 active members, modest average.
    // d2 (Sales): 1 active member with a PERFECT score — would top on raw avg,
    // but is below the 3-member guard, so it must be ineligible and sink below
    // the eligible d1 despite the higher average.
    const users = [
      user("u1", "Alice", "d1"),
      user("u2", "Bob", "d1"),
      user("u3", "Cara", "d1"),
      user("u4", "Dora", "d2"), // lone star
    ];
    const predictions: Prediction[] = [
      pred("u1", "g1", "home"), // +1
      pred("u2", "g1", "home"), // +1
      pred("u3", "g1", "away"), // 0   => d1 avg = 2/3 ≈ 0.67 over 3 active
      pred("u4", "g1", "home"), // +1  => d2 avg = 1 over 1 active
    ];
    const results: Result[] = [result("g1", "home")];
    const { departments: depts } = recomputeLeaderboards({
      users,
      predictions,
      results,
      matchStages,
      departments,
    });
    const d1 = depts.find((d) => d.departmentId === "d1")!;
    const d2 = depts.find((d) => d.departmentId === "d2")!;
    expect(d1.eligible).toBe(true);
    expect(d1.activeMembers).toBe(3);
    expect(d2.eligible).toBe(false); // only 1 active member, below the guard
    expect(d2.avgPoints).toBe(1); // metric still computed for display
    // Despite d2's higher average, the eligible d1 ranks above the ineligible d2.
    expect(d1.rank).toBeLessThan(d2.rank);
    expect(d1.rank).toBe(1);
  });

  it("is idempotent: re-running yields identical output", () => {
    const users = [user("u1", "Alice", "d1"), user("u2", "Bob", "d2")];
    const predictions = [pred("u1", "g1", "home"), pred("u2", "g1", "away")];
    const results = [result("g1", "home")];
    const args = { users, predictions, results, matchStages, departments };
    const a = recomputeLeaderboards(args);
    const b = recomputeLeaderboards(args);
    expect(a).toEqual(b);
  });

  it("computes climbDelta from previous ranks (positive = climbed)", () => {
    const users = [user("u1", "Alice", "d1"), user("u2", "Bob", "d2")];
    const predictions = [pred("u1", "g1", "home")]; // u1 leads
    const results = [result("g1", "home")];
    const { leaderboard } = recomputeLeaderboards({
      users,
      predictions,
      results,
      matchStages,
      departments,
      previous: { users: { u1: 2, u2: 1 } }, // u1 was 2nd, now 1st => +1
    });
    const u1 = leaderboard.find((r) => r.userId === "u1")!;
    expect(u1.rank).toBe(1);
    expect(u1.climbDelta).toBe(1);
  });
});

describe("computeConsensus", () => {
  it("returns zeros for a match with no predictions", () => {
    expect(computeConsensus("m1", [])).toEqual({
      matchId: "m1",
      pctHome: 0,
      pctDraw: 0,
      pctAway: 0,
      n: 0,
    });
  });

  it("computes per-outcome percentages over picks for that match only", () => {
    const preds: Prediction[] = [
      pred("u1", "m1", "home"),
      pred("u2", "m1", "home"),
      pred("u3", "m1", "draw"),
      pred("u4", "m1", "away"),
      pred("u5", "m2", "home"), // different match — ignored
    ];
    const c = computeConsensus("m1", preds);
    expect(c.n).toBe(4);
    expect(c.pctHome).toBe(50);
    expect(c.pctDraw).toBe(25);
    expect(c.pctAway).toBe(25);
  });
});

describe("resolveResult (feed vs organizer override precedence)", () => {
  it("organizer override wins over a conflicting feed result", () => {
    const feed = result("m1", "home", "feed");
    const organizer = result("m1", "away", "organizer");
    expect(resolveResult(feed, organizer)).toBe(organizer);
    // Order of args doesn't change the precedence.
    expect(resolveResult(feed, organizer)!.source).toBe("organizer");
    expect(resolveResult(feed, organizer)!.outcome).toBe("away");
  });

  it("feed is authoritative when there is no organizer override", () => {
    const feed = result("m1", "home", "feed");
    expect(resolveResult(feed, null)).toBe(feed);
    expect(resolveResult(feed, undefined)!.source).toBe("feed");
  });

  it("returns the organizer result when there is no feed result", () => {
    const organizer = result("m1", "draw", "organizer");
    expect(resolveResult(null, organizer)).toBe(organizer);
  });

  it("returns null when neither source has a result", () => {
    expect(resolveResult(null, null)).toBeNull();
    expect(resolveResult(undefined, undefined)).toBeNull();
  });
});
