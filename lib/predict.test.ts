// ============================================================================
// FEATURE 1 (batch prediction) + FEATURE 2 (KO team resolution) unit tests.
//
// Clock-pinned to 2026-06-02 (the real "today" in this codebase): the ENTIRE WM
// is in the future, so every group-stage match is predictable and every KO
// match is still a bracket PLACEHOLDER (excluded) until the feed resolves it.
//
//  1. isPlaceholderTeam / hasKnownTeams against the REAL seed shapes.
//  2. getPredictableMatches returns the full group slate, kickoff-sorted, and
//     EXCLUDES every still-placeholder KO match.
//  3. KO resolution: feed an ESPN-style R32 event with real teams ->
//     matchEspnKoTeams -> setMatchTeams fills it -> it becomes predictable.
// ============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { MockStore } from "./data";
import {
  isPlaceholderTeam,
  hasKnownTeams,
  SEED_MATCHES,
} from "./seed";
import {
  matchEspnKoTeams,
  espnSlugToStage,
  type EspnResult,
} from "./ingest/espn";

// A pre-tournament clock: the whole 11 Jun – 19 Jul schedule is in the future.
const PRE_TOURNAMENT = new Date("2026-06-02T00:00:00.000Z");

class FixedClockMockStore extends MockStore {
  protected override now(): Date {
    return PRE_TOURNAMENT;
  }
}

// ---------------------------------------------------------------------------

describe("isPlaceholderTeam — real openfootball KO shapes", () => {
  // EXACTLY the placeholder labels the bundled 2026 file emits for KO slots.
  const placeholders = [
    "1A", "2B", "1L", "2L", //          group winner / runner-up
    "3A/B/C/D/F", "3C/E/F/H/I", //      best-third combos
    "W73", "W100", "W101", "W102", //   winner-of-match
    "L101", "L102", //                  loser-of-match
  ];

  it("flags every KO placeholder shape from the seed", () => {
    for (const p of placeholders) {
      expect(isPlaceholderTeam(p), p).toBe(true);
    }
  });

  it("flags the defensive forms the data may use after a refresh", () => {
    for (const p of [
      "R1A",
      "Winner Group A",
      "Runner-up Group B",
      "W-Group C",
      "Loser Match 101",
      "", // blank is not a real team
      "  ",
    ]) {
      expect(isPlaceholderTeam(p), p).toBe(true);
    }
  });

  it("does NOT flag real teams (every group-stage team in the seed)", () => {
    const groupTeams = new Set<string>();
    for (const m of SEED_MATCHES) {
      if (m.stage === "group") {
        groupTeams.add(m.home);
        groupTeams.add(m.away);
      }
    }
    expect(groupTeams.size).toBeGreaterThan(40); // sanity: it's the real slate
    for (const t of groupTeams) {
      expect(isPlaceholderTeam(t), t).toBe(false);
    }
  });

  it("does NOT flag tricky real names that brush the patterns", () => {
    // Real WC teams that could naively collide with a pattern.
    for (const t of [
      "South Korea",
      "Mexico",
      "Wales", // starts with W but not W\d+
      "Luxembourg", // starts with L but not L\d+
      "Curaçao",
    ]) {
      expect(isPlaceholderTeam(t), t).toBe(false);
    }
  });
});

describe("hasKnownTeams", () => {
  it("is false when either side is a placeholder, true only when both are real", () => {
    expect(hasKnownTeams({ home: "1A", away: "2B" })).toBe(false);
    expect(hasKnownTeams({ home: "Mexico", away: "W101" })).toBe(false);
    expect(hasKnownTeams({ home: "W101", away: "Mexico" })).toBe(false);
    expect(hasKnownTeams({ home: "Mexico", away: "South Korea" })).toBe(true);
  });

  it("matches the seed: group matches are known, KO matches are not (yet)", () => {
    for (const m of SEED_MATCHES) {
      expect(hasKnownTeams(m), `${m.id}`).toBe(m.stage === "group");
    }
  });
});

describe("getPredictableMatches — pre-tournament clock", () => {
  let store: FixedClockMockStore;
  beforeEach(async () => {
    store = new FixedClockMockStore({ seedDemo: false });
    await store.seedFromOpenfootball();
  });

  it("returns the FULL group slate, kickoff-sorted, and no KO placeholders", async () => {
    const predictable = await store.getPredictableMatches();
    const groupCount = SEED_MATCHES.filter((m) => m.stage === "group").length;

    // Every group match is predictable now; no KO match is (all placeholders).
    expect(predictable.length).toBe(groupCount);
    expect(predictable.every((m) => m.stage === "group")).toBe(true);
    expect(predictable.some((m) => m.stage !== "group")).toBe(false);

    // Sorted by kickoff ascending.
    const kos = predictable.map((m) => m.kickoff);
    expect([...kos].sort()).toEqual(kos);

    // Spans MULTIPLE matchdays (distinct calendar days) — the batch board's point.
    const days = new Set(predictable.map((m) => m.kickoff.slice(0, 10)));
    expect(days.size).toBeGreaterThan(1);
  });

  it("excludes a match once its kickoff has passed (locked), even if group", async () => {
    // Move the clock to mid-tournament so early group games are locked out.
    class MidClock extends MockStore {
      protected override now(): Date {
        return new Date("2026-06-20T00:00:00.000Z");
      }
    }
    const mid = new MidClock({ seedDemo: false });
    await mid.seedFromOpenfootball();
    const predictable = await mid.getPredictableMatches();
    // Nothing returned has kicked off.
    for (const m of predictable) {
      expect(new Date(m.kickoff).getTime()).toBeGreaterThan(
        new Date("2026-06-20T00:00:00.000Z").getTime(),
      );
    }
  });
});

describe("KO team resolution — feed fills placeholders, match becomes predictable", () => {
  it("maps the ESPN slug to our stage", () => {
    expect(espnSlugToStage("round-of-32")).toBe("r32");
    expect(espnSlugToStage("group-stage")).toBe("group");
    expect(espnSlugToStage("final")).toBe("final");
    expect(espnSlugToStage("nonsense")).toBeNull();
    expect(espnSlugToStage(null)).toBeNull();
  });

  it("resolves an R32 slot from an ESPN event then surfaces it for prediction", async () => {
    const store = new FixedClockMockStore({ seedDemo: false });
    await store.seedFromOpenfootball();

    // Pick the FIRST R32 match (28 Jun, single fixture that day) — still a
    // placeholder, still in the future under the pre-tournament clock.
    const all = await store.getMatches();
    const r32 = all
      .filter((m) => m.stage === "r32")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]!;
    expect(hasKnownTeams(r32)).toBe(false); // placeholder before resolution

    // It is NOT predictable yet (placeholder teams).
    let predictable = await store.getPredictableMatches();
    expect(predictable.some((m) => m.id === r32.id)).toBe(false);

    // Construct an ESPN-style R32 event on the SAME UTC day with REAL teams.
    const espnEvent: EspnResult = {
      dateUtc: r32.kickoff,
      homeName: "Argentina",
      awayName: "Croatia",
      homeAbbr: "ARG",
      awayAbbr: "CRO",
      completed: false, // teams known before kickoff; result not yet final
      outcome: null,
      detail: null,
      seasonSlug: "round-of-32",
    };

    // The structural matcher lines it up with our R32 slot by (day, stage, order).
    const resolved = matchEspnKoTeams([espnEvent], [r32]);
    expect(resolved).toEqual([
      { matchId: r32.id, home: "Argentina", away: "Croatia" },
    ]);

    // Apply it via the store seam.
    const updated = await store.setMatchTeams(
      r32.id,
      resolved[0]!.home,
      resolved[0]!.away,
    );
    expect(updated.home).toBe("Argentina");
    expect(updated.away).toBe("Croatia");
    expect(hasKnownTeams(updated)).toBe(true);

    // Now it IS predictable: real teams + future kickoff.
    predictable = await store.getPredictableMatches();
    const surfaced = predictable.find((m) => m.id === r32.id);
    expect(surfaced).toBeDefined();
    expect(surfaced!.home).toBe("Argentina");
    expect(surfaced!.away).toBe("Croatia");
  });

  it("does NOT resolve when the feed event still shows placeholders", async () => {
    const store = new FixedClockMockStore({ seedDemo: false });
    await store.seedFromOpenfootball();
    const r32 = (await store.getMatches())
      .filter((m) => m.stage === "r32")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]!;

    const placeholderEvent: EspnResult = {
      dateUtc: r32.kickoff,
      homeName: "1A", // feed still TBD — not a real team
      awayName: "2B",
      homeAbbr: null,
      awayAbbr: null,
      completed: false,
      outcome: null,
      detail: null,
      seasonSlug: "round-of-32",
    };
    expect(matchEspnKoTeams([placeholderEvent], [r32])).toEqual([]);
  });
});
