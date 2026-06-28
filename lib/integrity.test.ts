import { describe, it, expect } from "vitest";
import { computeIntegrity, summariseIntegrity } from "./integrity";
import type { Match, Stage } from "./types";

const NOW = new Date("2026-06-28T12:00:00.000Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const mk = (id: string, stage: Stage, home: string, away: string, kickoffH: number): Match => ({
  id, stage, group: stage === "group" ? "A" : null, home, away,
  kickoff: hoursFromNow(kickoffH), status: "scheduled", externalRef: null,
});

const has = (r: ReturnType<typeof computeIntegrity>, check: string) => r.issues.find((i) => i.check === check);

describe("computeIntegrity", () => {
  it("a clean future slate raises no alarms", () => {
    const matches = [mk("r32a", "r32", "Brazil", "Japan", 24), mk("r32b", "r32", "Spain", "Italy", 26)];
    const r = computeIntegrity({ matches, predictions: [], results: [], now: NOW });
    expect(r.ok).toBe(true);
    expect(has(r, "duplicate_ko_fixtures")).toBeUndefined();
  });

  it("ALARMS on a duplicate knockout fixture (the corruption we fixed)", () => {
    const matches = [
      mk("r32a", "r32", "Brazil", "Japan", 24),
      mk("r32b", "r32", "Japan", "Brazil", 27), // same matchup, order flipped, 2nd slot
    ];
    const r = computeIntegrity({ matches, predictions: [], results: [], now: NOW });
    expect(r.ok).toBe(false);
    expect(has(r, "duplicate_ko_fixtures")?.severity).toBe("alarm");
  });

  it("ALARMS on a placeholder persisted as a team on a LOCKED slot", () => {
    const matches = [mk("r32a", "r32", "Group A Winner", "Japan", -2)]; // kicked off, still a descriptor
    const r = computeIntegrity({ matches, predictions: [], results: [], now: NOW });
    expect(has(r, "placeholder_leak")?.severity).toBe("alarm");
    expect(r.ok).toBe(false);
  });

  it("ALARMS when a user predicted the SAME matchup twice", () => {
    const matches = [mk("r32a", "r32", "Brazil", "Japan", 24), mk("r32b", "r32", "Brazil", "Japan", 27)];
    const predictions = [
      { userId: "u1", matchId: "r32a", pick: "home" },
      { userId: "u1", matchId: "r32b", pick: "away" }, // u1 picked Brazil-Japan on both
    ];
    const r = computeIntegrity({ matches, predictions, results: [], now: NOW });
    expect(has(r, "double_picks")?.count).toBe(1);
    expect(r.ok).toBe(false);
  });

  it("WARNS (not alarms) on a kicked-off, predicted, unscored match", () => {
    const matches = [mk("r32a", "r32", "Brazil", "Japan", -3)]; // 3h ago, no result
    const predictions = [{ userId: "u1", matchId: "r32a", pick: "home" }];
    const r = computeIntegrity({ matches, predictions, results: [], now: NOW });
    expect(has(r, "locked_no_result")?.severity).toBe("warn");
    expect(r.ok).toBe(true); // warnings don't fail the check
  });

  it("WARNS on a group match past the buffer with no result (feed/alias gap)", () => {
    const matches = [mk("g1", "group", "Ivory Coast", "Norway", -4)];
    const r = computeIntegrity({ matches, predictions: [], results: [], now: NOW });
    expect(has(r, "ingest_gap")?.severity).toBe("warn");
  });

  it("does NOT warn once the result is in", () => {
    const matches = [mk("g1", "group", "Ivory Coast", "Norway", -4)];
    const r = computeIntegrity({ matches, predictions: [], results: [{ matchId: "g1" }], now: NOW });
    expect(has(r, "ingest_gap")).toBeUndefined();
  });

  it("summarises clean vs alarming states for the dashboard", () => {
    const clean = computeIntegrity({ matches: [], predictions: [], results: [], now: NOW });
    // empty slate => fixture_count info only, no alarm
    expect(clean.ok).toBe(true);
    const bad = computeIntegrity({ matches: [mk("a", "r32", "Brazil", "Japan", 1), mk("b", "r32", "Brazil", "Japan", 2)], predictions: [], results: [], now: NOW });
    expect(summariseIntegrity(bad)).toContain("INTEGRITY ALARM");
  });
});
