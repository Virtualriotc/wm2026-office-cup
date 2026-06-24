import { describe, it, expect } from "vitest";
import { withDayOverDayDelta, buildRaceModel } from "./raceModel";
import type { DepartmentStanding } from "@/lib/types";

const dept = (
  id: string,
  rank: number,
  avgPoints: number,
  eligible = true,
): DepartmentStanding => ({
  departmentId: id,
  name: id,
  color: "#000",
  avgPoints,
  activeMembers: 5,
  rank,
  climbDelta: 999, // sentinel: must be overwritten by the day-over-day calc
  eligible,
});

describe("withDayOverDayDelta", () => {
  it("sets climbDelta = yesterdayRank - todayRank (positive = climbed)", () => {
    const standings = [dept("a", 1, 10), dept("b", 2, 8), dept("c", 3, 6)];
    // Yesterday: c was #1, a was #2, b was #3. Today a leads.
    const prev = { a: 2, b: 3, c: 1 };
    const out = withDayOverDayDelta(standings, prev);
    expect(out.find((d) => d.departmentId === "a")!.climbDelta).toBe(1); // 2 -> 1
    expect(out.find((d) => d.departmentId === "b")!.climbDelta).toBe(1); // 3 -> 2
    expect(out.find((d) => d.departmentId === "c")!.climbDelta).toBe(-2); // 1 -> 3
  });

  it("gives 0 to a department with no prior-day rank (no spurious mover)", () => {
    const out = withDayOverDayDelta([dept("new", 2, 5)], { other: 1 });
    expect(out[0]!.climbDelta).toBe(0);
  });

  it("treats a steady leader as climbDelta 0, not a mover", () => {
    const out = withDayOverDayDelta([dept("a", 1, 10)], { a: 1 });
    expect(out[0]!.climbDelta).toBe(0);
    // …and the race model then reports no headline mover.
    expect(buildRaceModel(out, null).mover).toBeNull();
  });

  it("preserves every other field (only climbDelta changes)", () => {
    const [d] = withDayOverDayDelta([dept("a", 1, 10)], { a: 3 });
    expect(d).toMatchObject({ departmentId: "a", rank: 1, avgPoints: 10, eligible: true });
    expect(d!.climbDelta).toBe(2);
  });

  it("the biggest climber since yesterday becomes the headline mover", () => {
    const standings = [dept("a", 1, 10), dept("b", 2, 8), dept("c", 3, 6)];
    const prev = { a: 1, b: 4, c: 2 }; // b jumped 4 -> 2 (+2), the biggest move
    const model = buildRaceModel(withDayOverDayDelta(standings, prev), null);
    expect(model.mover).toEqual({ name: "b", jumped: 2 });
  });

  it("PRODUCTION (allowDemo=false): a no-movement day fakes nothing", () => {
    // Every delta 0 (no prior snapshot, or no rank change). Production must not
    // synthesize an overtake or a "climbed 1 since yesterday" mover.
    const standings = [dept("a", 1, 10), dept("b", 2, 8)].map((s) => ({
      ...s,
      climbDelta: 0,
    }));
    const model = buildRaceModel(standings, null, false);
    expect(model.isDemo).toBe(false);
    expect(model.mover).toBeNull();
  });

  it("DEMO (allowDemo=true): a flat board still stages a hero overtake", () => {
    const standings = [dept("a", 1, 10), dept("b", 2, 8)].map((s) => ({
      ...s,
      climbDelta: 0,
    }));
    const model = buildRaceModel(standings, null, true);
    expect(model.isDemo).toBe(true);
    expect(model.mover).not.toBeNull();
  });
});
