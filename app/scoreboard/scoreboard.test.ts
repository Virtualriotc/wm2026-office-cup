import { describe, it, expect } from "vitest";
import {
  computeFirstKickoff,
  isPreTournament,
  hasScoredResult,
} from "@/components/scoreboard/scoreboardState";
import type { Match, Result, DepartmentStanding } from "@/lib/types";

function match(id: string, kickoff: string): Match {
  return {
    id,
    stage: "group",
    group: "A",
    home: "Home",
    away: "Away",
    kickoff,
    status: "scheduled",
    externalRef: null,
  };
}

function standing(
  departmentId: string,
  avgPoints: number,
  eligible = true,
): DepartmentStanding {
  return {
    departmentId,
    name: departmentId,
    color: "#000000",
    avgPoints,
    activeMembers: 3,
    rank: 1,
    climbDelta: 0,
    eligible,
  };
}

function result(matchId: string): Result {
  return {
    matchId,
    outcome: "home",
    source: "feed",
    updatedAt: "2026-06-11T20:00:00.000Z",
  };
}

const FIRST = "2026-06-11T16:00:00.000Z"; // Mexico vs South Africa, earliest fixture
const matches: Match[] = [
  match("m2", "2026-06-12T16:00:00.000Z"),
  match("m1", FIRST),
  match("m3", "2026-06-13T16:00:00.000Z"),
];

describe("computeFirstKickoff", () => {
  it("returns the EARLIEST kickoff regardless of array order", () => {
    expect(computeFirstKickoff(matches)).toBe(FIRST);
  });

  it("returns null when there are no matches", () => {
    expect(computeFirstKickoff([])).toBeNull();
  });
});

describe("isPreTournament", () => {
  it("a clock BEFORE the earliest fixture -> pre-tournament (countdown)", () => {
    const before = new Date("2026-06-02T09:00:00.000Z");
    expect(isPreTournament(FIRST, before)).toBe(true);
  });

  it("a clock AFTER the earliest fixture -> NOT pre-tournament (race)", () => {
    const after = new Date("2026-06-11T18:00:00.000Z");
    expect(isPreTournament(FIRST, after)).toBe(false);
  });

  it("exactly at kickoff -> NOT pre-tournament (the cup has started)", () => {
    expect(isPreTournament(FIRST, new Date(FIRST))).toBe(false);
  });

  it("no firstKickoff -> NOT pre-tournament (nothing to count down to)", () => {
    expect(isPreTournament(null, new Date("2026-06-02T09:00:00.000Z"))).toBe(false);
  });
});

describe("hasScoredResult (mover/streak gating)", () => {
  it("no result rows AND an all-zero board -> NO scored result (mover hidden)", () => {
    const standings = [standing("a", 0), standing("b", 0)];
    expect(hasScoredResult([], standings)).toBe(false);
  });

  it("a recorded result row -> scored result exists (mover may show)", () => {
    const standings = [standing("a", 0), standing("b", 0)];
    expect(hasScoredResult([result("m1")], standings)).toBe(true);
  });

  it("any department on positive average points -> scored result exists", () => {
    const standings = [standing("a", 2.33), standing("b", 1)];
    expect(hasScoredResult([], standings)).toBe(true);
  });
});
