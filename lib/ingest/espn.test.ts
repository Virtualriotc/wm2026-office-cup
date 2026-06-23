// ============================================================================
// ESPN client tests — OFFLINE only. We never hit the network here; instead we
// exercise the pure parser + matcher against REAL ESPN scoreboard JSON captured
// into __fixtures__:
//   - espn-scoreboard-20260611.json : two SCHEDULED WC2026 group matches
//     (Mexico v South Africa, South Korea v Czechia) — outcome must be null,
//     and the matcher must map them to our seeded fixtures.
//   - espn-scoreboard-20221122.json : four FINISHED 2022 group matches —
//     a home win (France 4-1 Australia), an away win (Argentina 1-2 Saudi),
//     and two draws (Denmark 0-0 Tunisia, Mexico 0-0 Poland).
//   - espn-scoreboard-20221218.json : the 2022 FINAL, decided on PENALTIES
//     (regulation 3-3, detail 'FT-Pens', Argentina winner flag true) — the
//     outcome must follow the winner flag, not the level score.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  parseEspnScoreboard,
  matchEspnToSeed,
  matchEspnResults,
  matchEspnKoTeams,
  normalizeTeamName,
  espnDateBuckets,
  type EspnResult,
} from "./espn";
import { SEED_MATCHES } from "../seed";

/** Build a minimal KO EspnResult on the given day with the given team labels. */
function koEvent(
  dateUtc: string,
  homeName: string,
  awayName: string,
): EspnResult {
  return {
    dateUtc,
    homeName,
    awayName,
    homeAbbr: null,
    awayAbbr: null,
    completed: false,
    outcome: null,
    detail: null,
    seasonSlug: "round-of-32",
  };
}

import scheduled2026 from "./__fixtures__/espn-scoreboard-20260611.json";
import finished2022 from "./__fixtures__/espn-scoreboard-20221122.json";
import final2022 from "./__fixtures__/espn-scoreboard-20221218.json";

/** Find one parsed result by either team's display name. */
function byTeam(results: EspnResult[], team: string): EspnResult {
  const found = results.find((r) => r.homeName === team || r.awayName === team);
  if (!found) throw new Error(`no parsed result involving ${team}`);
  return found;
}

describe("parseEspnScoreboard — scheduled (not yet played)", () => {
  const results = parseEspnScoreboard(scheduled2026);

  it("parses both scheduled WC2026 events", () => {
    expect(results).toHaveLength(2);
  });

  it("leaves outcome null and completed false for a scheduled match", () => {
    const mex = byTeam(results, "Mexico");
    expect(mex.completed).toBe(false);
    expect(mex.outcome).toBeNull();
    expect(mex.homeName).toBe("Mexico");
    expect(mex.awayName).toBe("South Africa");
    expect(mex.dateUtc).toBe("2026-06-11T19:00Z");
  });
});

describe("parseEspnScoreboard — finished, regulation results", () => {
  const results = parseEspnScoreboard(finished2022);

  it("maps a completed HOME win to 'home' (France 4-1 Australia)", () => {
    const fra = byTeam(results, "France");
    expect(fra.completed).toBe(true);
    expect(fra.homeName).toBe("France");
    expect(fra.outcome).toBe("home");
    expect(fra.detail).toBe("FT");
  });

  it("maps a completed AWAY win to 'away' (Argentina 1-2 Saudi Arabia)", () => {
    const arg = byTeam(results, "Argentina");
    expect(arg.completed).toBe(true);
    expect(arg.homeName).toBe("Argentina");
    expect(arg.outcome).toBe("away");
  });

  it("maps a completed level score to 'draw' (Denmark 0-0 Tunisia)", () => {
    const den = byTeam(results, "Denmark");
    expect(den.completed).toBe(true);
    expect(den.outcome).toBe("draw");
  });
});

describe("parseEspnScoreboard — penalties (winner flag over score)", () => {
  const results = parseEspnScoreboard(final2022);

  it("follows the winner flag, not the level regulation score (FT-Pens)", () => {
    expect(results).toHaveLength(1);
    const fin = results[0]!;
    expect(fin.completed).toBe(true);
    expect(fin.detail).toBe("FT-Pens");
    expect(fin.homeName).toBe("Argentina"); // home, winner flag true
    expect(fin.awayName).toBe("France"); // away, winner flag false
    // Regulation was 3-3 (level) — a naive score compare would say "draw".
    // The advancer is the home side via the winner flag.
    expect(fin.outcome).toBe("home");
  });
});

describe("parseEspnScoreboard — defensive", () => {
  it("returns [] for junk / missing events", () => {
    expect(parseEspnScoreboard(null)).toEqual([]);
    expect(parseEspnScoreboard({})).toEqual([]);
    expect(parseEspnScoreboard({ events: "nope" })).toEqual([]);
    expect(parseEspnScoreboard({ events: [{}, { competitions: [] }] })).toEqual(
      [],
    );
  });
});

describe("normalizeTeamName — alias map", () => {
  it("aligns ESPN 'Czechia' with schedule 'Czech Republic'", () => {
    expect(normalizeTeamName("Czechia")).toBe(
      normalizeTeamName("Czech Republic"),
    );
  });

  it("aligns Korea Republic / South Korea, USA / United States", () => {
    expect(normalizeTeamName("Korea Republic")).toBe(
      normalizeTeamName("South Korea"),
    );
    expect(normalizeTeamName("USA")).toBe(normalizeTeamName("United States"));
  });

  it("strips accents (Türkiye/Turkey, Curaçao)", () => {
    expect(normalizeTeamName("Türkiye")).toBe(normalizeTeamName("Turkey"));
    expect(normalizeTeamName("Curaçao")).toBe(normalizeTeamName("Curacao"));
  });

  it("aligns ESPN 'Congo DR' with schedule 'DR Congo' (verified vs live ESPN)", () => {
    expect(normalizeTeamName("Congo DR")).toBe(normalizeTeamName("DR Congo"));
  });
});

describe("matchEspnToSeed — maps real ESPN events to seeded matches", () => {
  const results = parseEspnScoreboard(scheduled2026);

  it("maps the June-11 Mexico v South Africa event to our seeded fixture", () => {
    const mex = byTeam(results, "Mexico");
    const id = matchEspnToSeed(mex, SEED_MATCHES);
    expect(id).toBe("of-matchday-1-mexico-south-africa");
  });

  it("maps South Korea v Czechia via the Czechia/Czech Republic alias", () => {
    const kor = byTeam(results, "South Korea");
    const id = matchEspnToSeed(kor, SEED_MATCHES);
    expect(id).toBe("of-matchday-1-south-korea-czech-republic");
  });

  it("returns null when no seeded match shares the date + team pair", () => {
    const phantom: EspnResult = {
      dateUtc: "2026-06-11T19:00Z",
      homeName: "Atlantis",
      awayName: "El Dorado",
      homeAbbr: "ATL",
      awayAbbr: "ELD",
      completed: false,
      outcome: null,
      detail: null,
      seasonSlug: "group-stage",
    };
    expect(matchEspnToSeed(phantom, SEED_MATCHES)).toBeNull();
  });

  it("does NOT map knockout fixtures (placeholder team names) for now", () => {
    // A made-up R32 event: real team names can't match our 'W73'-style seeds.
    const ko = SEED_MATCHES.find((m) => m.stage !== "group");
    expect(ko).toBeDefined();
    const koEvent: EspnResult = {
      dateUtc: ko!.kickoff,
      homeName: "Brazil",
      awayName: "Spain",
      homeAbbr: "BRA",
      awayAbbr: "ESP",
      completed: true,
      outcome: "home",
      detail: "FT",
      seasonSlug: "round-of-32",
    };
    expect(matchEspnToSeed(koEvent, SEED_MATCHES)).toBeNull();
  });
});

describe("matchEspnKoTeams — never resolves a slot to an ESPN descriptor", () => {
  // Use the FIRST real R32 slot from the seed so the structural (day, stage,
  // order) matcher has a real placeholder slot to line up against.
  const r32 = SEED_MATCHES.filter((m) => m.stage === "r32").sort((a, b) =>
    a.kickoff.localeCompare(b.kickoff),
  )[0]!;

  it("resolves NOTHING when ESPN serves PRE-TOURNAMENT position descriptors", () => {
    // The LIVE bug: pre-tournament ESPN shows the bracket as descriptors, not
    // teams. The resolver must reject every one and fill no slot.
    for (const [home, away] of [
      ["Group A 2nd Place", "Group C Winner"],
      ["Third Place Group A/B/C/D/F", "Group F Winner"],
      ["Runner-up Group B", "TBD"],
      ["Winner Group A", "Group B 2nd Place"],
    ] as const) {
      const ev = koEvent(r32.kickoff, home, away);
      expect(matchEspnKoTeams([ev], [r32]), `${home} vs ${away}`).toEqual([]);
    }
  });

  it("resolves the slot when ESPN serves TWO REAL teams", () => {
    const ev = koEvent(r32.kickoff, "Argentina", "Croatia");
    expect(matchEspnKoTeams([ev], [r32])).toEqual([
      { matchId: r32.id, home: "Argentina", away: "Croatia" },
    ]);
  });

  it("resolves NOTHING when only ONE side is a descriptor (need BOTH real)", () => {
    const ev = koEvent(r32.kickoff, "Argentina", "Group C Winner");
    expect(matchEspnKoTeams([ev], [r32])).toEqual([]);
  });
});

describe("matchEspnResults — only completed + matched results", () => {
  it("drops scheduled events even when they match a seeded fixture", () => {
    const scheduled = parseEspnScoreboard(scheduled2026);
    expect(matchEspnResults(scheduled, SEED_MATCHES)).toEqual([]);
  });

  it("returns (matchId, outcome) for a completed, matched result", () => {
    // Mexico 0-0 Poland on 2022-11-22 happens to share teams with seeded group
    // fixtures? No — seed is WC2026. Build a completed event on a real 2026 day
    // by reusing the scheduled fixture's teams + day but marking it final.
    const mex = byTeam(parseEspnScoreboard(scheduled2026), "Mexico");
    const completed: EspnResult = { ...mex, completed: true, outcome: "home", detail: "FT" };
    const matched = matchEspnResults([completed], SEED_MATCHES);
    expect(matched).toEqual([
      { matchId: "of-matchday-1-mexico-south-africa", outcome: "home" },
    ]);
  });
});

// ===========================================================================
// espnDateBuckets — ESPN buckets by US-Eastern day, so a 03:00-UTC kickoff is
// served under the PREVIOUS day's `dates=` call. The sync must query neighbours
// or it strands those results (this stranded real Group games for days).
// ===========================================================================
describe("espnDateBuckets — covers ESPN's US-Eastern day boundary", () => {
  it("returns the UTC day plus BOTH neighbours, in YYYYMMDD", () => {
    // A 03:00-UTC kickoff: ESPN files it under 06-22 (ET), our match's UTC day
    // is 06-23. The bucket list must include 06-22 so the result is found.
    expect(espnDateBuckets("2026-06-23T03:00:00.000Z")).toEqual([
      "20260622",
      "20260623",
      "20260624",
    ]);
  });

  it("crosses month boundaries correctly", () => {
    expect(espnDateBuckets("2026-07-01T01:00:00.000Z")).toEqual([
      "20260630",
      "20260701",
      "20260702",
    ]);
  });

  it("always includes the match's own UTC day", () => {
    for (const iso of ["2026-06-11T19:00:00Z", "2026-06-20T03:00:00Z", "2026-06-28T02:00:00Z"]) {
      const own = iso.slice(0, 10).replace(/-/g, "");
      expect(espnDateBuckets(iso)).toContain(own);
    }
  });
});
