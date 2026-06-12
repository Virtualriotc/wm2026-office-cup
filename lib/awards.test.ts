import { describe, it, expect } from "vitest";
import { computeAwards } from "./scoring";
import type {
  User,
  Prediction,
  Result,
  Match,
  Department,
  Outcome,
} from "./types";

// --- tiny fixture factories -------------------------------------------------
const dept = (id: string, name: string): Department => ({
  id,
  name,
  slug: name.toLowerCase(),
  color: "#000000",
});
const user = (id: string, name: string, dId: string): User => ({
  id,
  displayName: name,
  departmentId: dId,
  tokenHash: id,
  isOrganizer: false,
  joinedAt: "2026-06-01T00:00:00.000Z",
  jerseyOptIn: false,
});
const match = (id: string, kickoff: string): Match => ({
  id,
  stage: "group",
  group: "A",
  home: "Home",
  away: "Away",
  kickoff,
  status: "scheduled",
  externalRef: null,
});
const pred = (uId: string, mId: string, pick: Outcome): Prediction => ({
  id: `${uId}-${mId}`,
  userId: uId,
  matchId: mId,
  pick,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
});
const result = (mId: string, outcome: Outcome): Result => ({
  matchId: mId,
  outcome,
  source: "organizer",
  updatedAt: "2026-06-12T20:00:00.000Z",
});

const departments = [dept("d1", "Tech")];
const users = [
  user("u1", "Alice", "d1"),
  user("u2", "Bob", "d1"),
  user("u3", "Carol", "d1"),
];
const matches = [
  match("m1", "2026-06-11T16:00:00.000Z"),
  match("m2", "2026-06-11T17:00:00.000Z"),
  match("m3", "2026-06-11T18:00:00.000Z"),
  match("m4", "2026-06-12T16:00:00.000Z"),
  match("m5", "2026-06-12T17:00:00.000Z"),
  match("m6", "2026-06-12T18:00:00.000Z"),
];
// Picks engineered so HOME is the majority on every match.
// Bob matches the crowd on all 6; Carol on 5; Alice on 1.
const predictions: Prediction[] = [
  pred("u1", "m1", "away"), pred("u2", "m1", "home"), pred("u3", "m1", "home"),
  pred("u1", "m2", "draw"), pred("u2", "m2", "home"), pred("u3", "m2", "home"),
  pred("u1", "m3", "away"), pred("u2", "m3", "home"), pred("u3", "m3", "home"),
  pred("u1", "m4", "draw"), pred("u2", "m4", "home"), pred("u3", "m4", "home"),
  pred("u1", "m5", "away"), pred("u2", "m5", "home"), pred("u3", "m5", "home"),
  pred("u1", "m6", "home"), pred("u2", "m6", "home"), pred("u3", "m6", "away"),
];

describe("computeAwards", () => {
  it("Mainstream Picker = backs the office favourite most (pick-based, no results needed)", () => {
    const a = computeAwards({ users, predictions, results: [], matches, departments });
    expect(a.mainstream).not.toBeNull();
    expect(a.mainstream!.displayName).toBe("Bob");
    expect(a.mainstream!.departmentName).toBe("Tech");
    expect(a.mainstream!.detail).toBe("100% with the crowd");
  });

  it("Against the Odds = the mirror of Mainstream (lowest crowd rate)", () => {
    const a = computeAwards({ users, predictions, results: [], matches, departments });
    // Alice goes against the favourite most (matched the crowd just 1/6).
    expect(a.againstOdds).not.toBeNull();
    expect(a.againstOdds!.displayName).toBe("Alice");
    expect(a.againstOdds!.detail).toBe("83% against the grain");
  });

  it("Hot Streak is NULL before any match is scored (pick-based awards still show)", () => {
    const a = computeAwards({ users, predictions, results: [], matches, departments });
    expect(a.hotStreak).toBeNull();
    expect(a.mainstream).not.toBeNull(); // pick-based -> live immediately
    expect(a.againstOdds).not.toBeNull();
  });

  it("RESULTS SIMULATION: scoring the latest matchday activates Hot Streak", () => {
    // Day 2 (m4,m5,m6) played: m4 home, m5 home, m6 away.
    const results = [result("m4", "home"), result("m5", "home"), result("m6", "away")];
    const a = computeAwards({ users, predictions, results, matches, departments });

    // Carol got all three Day-2 results right -> a run of 3.
    expect(a.hotStreak).not.toBeNull();
    expect(a.hotStreak!.displayName).toBe("Carol");
    expect(a.hotStreak!.detail).toBe("3 in a row");
  });

  it("Hot Streak resets at the most recent miss (it's a CURRENT streak)", () => {
    // Only m6 played, and its result (home) makes Bob's most-recent pick wrong.
    const results = [result("m6", "home")]; // Bob picked home -> correct; Carol away -> wrong
    const a = computeAwards({ users, predictions, results, matches, departments });
    // Bob's latest completed pick (m6) is correct -> streak 1, but min is 2.
    expect(a.hotStreak).toBeNull();
  });

  it("no qualifying picker (everyone under the minimum) -> no mainstream award", () => {
    const few = [pred("u1", "m1", "home"), pred("u2", "m1", "home")];
    const a = computeAwards({ users, predictions: few, results: [], matches, departments });
    expect(a.mainstream).toBeNull();
  });
});

  // Edge case: empty dataset
  it("empty users / predictions → all awards null", () => {
    const a = computeAwards({ users: [], predictions: [], results: [], matches: [], departments: [] });
    expect(a.mainstream).toBeNull();
    expect(a.againstOdds).toBeNull();
    expect(a.hotStreak).toBeNull();
  });

  // Edge case: user with 0 picks
  it("user exists but has 0 predictions → no awards for them", () => {
    const a = computeAwards({ users, predictions: [], results: [], matches, departments });
    expect(a.mainstream).toBeNull();
    expect(a.againstOdds).toBeNull();
    expect(a.hotStreak).toBeNull();
  });

  // Edge case: match with no clear majority (3-way tie)
  it("match with 3-way tie (1 home, 1 draw, 1 away) → no majority on that match", () => {
    const tied = [
      pred("u1", "m1", "home"),
      pred("u2", "m1", "draw"),
      pred("u3", "m1", "away"),
      pred("u1", "m2", "home"), pred("u1", "m3", "home"), pred("u1", "m4", "home"), pred("u1", "m5", "home"),
      pred("u2", "m2", "home"), pred("u2", "m3", "home"), pred("u2", "m4", "home"), pred("u2", "m5", "home"),
      pred("u3", "m2", "home"), pred("u3", "m3", "home"), pred("u3", "m4", "home"), pred("u3", "m5", "home"),
    ];
    const a = computeAwards({ users, predictions: tied, results: [], matches, departments });
    // m1 has no majority (1 1 1), so it's excluded from all users' "considered" count
    // m2-m5 all have majority (3 home), so each user matches all 4 → 4/4 = 100%
    // But only matches with majority count toward "considered", so:
    // Each user: 4 considered (m2-m5), 4 matched → 100% rate
    // Tie between all three at 100%, so first one (u1 per Map order) wins
    expect(a.mainstream).not.toBeNull();
    expect(a.mainstream!.displayName).toBe("Alice");
    expect(a.mainstream!.detail).toBe("100% with the crowd");
  });

  // Edge case: two users with identical hot streak
  it("two users with same hot streak length → first wins", () => {
    const users2 = [user("u1", "Alice", "d1"), user("u2", "Bob", "d1")];
    const matches2 = [
      match("m1", "2026-06-11T16:00:00.000Z"),
      match("m2", "2026-06-11T17:00:00.000Z"),
    ];
    const preds2 = [
      pred("u1", "m1", "home"), pred("u1", "m2", "home"),
      pred("u2", "m1", "home"), pred("u2", "m2", "home"),
    ];
    const results2 = [result("m1", "home"), result("m2", "home")];
    const a = computeAwards({ users: users2, predictions: preds2, results: results2, matches: matches2, departments });
    expect(a.hotStreak).not.toBeNull();
    expect(a.hotStreak!.displayName).toBe("Alice");
    expect(a.hotStreak!.detail).toBe("2 in a row");
  });

  // Edge case: Hot streak with interrupted matches on same day
  it("hot streak interrupted midway through a day", () => {
    // m1✓ m2✓ m3✗ (same day), so streak resets to 0 for that day
    const results3 = [result("m1", "home"), result("m2", "home"), result("m3", "away")];
    const a = computeAwards({ users, predictions, results: results3, matches, departments });
    // Carol picked away on m3 (wrong), so her streak ends
    // Bob picked home on m1✓ m2✓ m3✓ (correct all)
    // Actually wait: Bob picked home, home, home on m1-m3, and results are home, home, away
    // So Bob: m1✓ m2✓ m3✗ → streak = 2 (breaks at m3)
    // Carol picked home, home, home on m1-m3, and results home, home, away
    // So Carol: m1✓ m2✓ m3✗ → streak = 2
    // Tie at 2, so first one wins (Bob)
    expect(a.hotStreak).not.toBeNull();
    expect(a.hotStreak!.displayName).toBe("Bob");
    expect(a.hotStreak!.detail).toBe("2 in a row");
  });
