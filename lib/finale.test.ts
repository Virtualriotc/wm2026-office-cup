import { describe, expect, it } from "vitest";
import { computeFinale, isTournamentOver, type FinaleInput } from "./finale";
import type { Match, Outcome, Stage } from "./types";

// --- tiny fixture builders -------------------------------------------------

function match(id: string, stage: Stage, home: string, away: string): Match {
  return {
    id,
    stage,
    home,
    away,
    kickoff: "2026-07-01T18:00:00.000Z",
    status: "final",
    group: null,
    externalRef: null,
  };
}

/** A slate with two semis, a third-place play-off, and a final. */
const SLATE: Match[] = [
  match("g1", "group", "Spain", "Cape Verde"),
  match("g2", "group", "Colombia", "Congo DR"),
  match("s1", "sf", "France", "Spain"),
  match("s2", "sf", "England", "Argentina"),
  match("s3", "sf", "France", "England"), // third-place play-off
  match("f1", "final", "Spain", "Argentina"),
];

const USERS = [
  { id: "u1", displayName: "Ana" },
  { id: "u2", displayName: "Ben" },
  { id: "u3", displayName: "Cleo" },
];

function pick(userId: string, matchId: string, p: Outcome) {
  return { userId, matchId, pick: p };
}

function input(over: boolean): FinaleInput {
  const results: { matchId: string; outcome: Outcome }[] = [
    { matchId: "g1", outcome: "draw" },
    { matchId: "g2", outcome: "home" },
    { matchId: "s1", outcome: "away" }, // Spain through
    { matchId: "s2", outcome: "away" }, // Argentina through
    { matchId: "s3", outcome: "away" }, // England take third
  ];
  if (over) results.push({ matchId: "f1", outcome: "home" }); // Spain champions
  return { matches: SLATE, results, predictions: [], users: USERS };
}

describe("isTournamentOver", () => {
  it("is false while the final has no result", () => {
    expect(isTournamentOver(SLATE, input(false).results)).toBe(false);
  });

  it("is true once the final is scored", () => {
    expect(isTournamentOver(SLATE, input(true).results)).toBe(true);
  });

  it("is false when there is no final on the slate at all", () => {
    const noFinal = SLATE.filter((m) => m.stage !== "final");
    expect(isTournamentOver(noFinal, input(true).results)).toBe(false);
  });
});

describe("computeFinale", () => {
  it("returns null while the cup is still running", () => {
    expect(computeFinale(input(false))).toBeNull();
  });

  it("names champion, runner-up and third from the results alone", () => {
    const r = computeFinale(input(true))!;
    expect(r.champion).toBe("Spain");
    expect(r.runnerUp).toBe("Argentina");
    // s3 is the only semi-stage tie contested by neither finalist.
    expect(r.third).toBe("England");
  });

  it("refuses to crown a champion when the final is stored as a draw", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      results: base.results.map((x) =>
        x.matchId === "f1" ? { ...x, outcome: "draw" as Outcome } : x,
      ),
    })!;
    // A draw is not a result we can turn into a winner — better blank than wrong.
    expect(r.champion).toBeNull();
    expect(r.runnerUp).toBeNull();
    expect(r.final.home).toBe("Spain");
  });

  it("counts office accuracy over scored matches only", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      predictions: [
        pick("u1", "g1", "draw"), // right
        pick("u1", "g2", "away"), // wrong
        pick("u2", "g1", "home"), // wrong
        pick("u3", "nonexistent-match", "home"), // unscored -> ignored entirely
      ],
    })!;
    expect(r.picks).toBe(3);
    expect(r.correct).toBe(1);
    expect(r.accuracyPct).toBe(33);
    expect(r.players).toBe(3);
  });

  it("picks the hardest call by lowest hit rate, breaking ties on sample size", () => {
    const base = input(true);
    // g1: nobody right out of 12. g2: nobody right out of 10.
    // Same 0% rate -> the bigger sample is the better story.
    const preds = [
      ...Array.from({ length: 12 }, (_, i) => pick(`x${i}`, "g1", "home")),
      ...Array.from({ length: 10 }, (_, i) => pick(`y${i}`, "g2", "away")),
    ];
    const r = computeFinale({ ...base, predictions: preds })!;
    expect(r.hardest?.matchId).toBe("g1");
    expect(r.hardest?.ok).toBe(0);
    expect(r.hardest?.n).toBe(12);
  });

  it("ignores small-sample matches when choosing hardest and banker", () => {
    const base = input(true);
    const preds = [
      // g1: a single wrong pick — 0%, but far too small to headline.
      pick("u1", "g1", "home"),
      // g2: 10 picks, 5 right.
      ...Array.from({ length: 5 }, (_, i) => pick(`a${i}`, "g2", "home")),
      ...Array.from({ length: 5 }, (_, i) => pick(`b${i}`, "g2", "away")),
    ];
    const r = computeFinale({ ...base, predictions: preds })!;
    expect(r.hardest?.matchId).toBe("g2");
    expect(r.banker?.matchId).toBe("g2");
  });

  it("scores the knockout run against every KO tie, not against picks made", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      predictions: [
        // Ana calls three of the four knockout ties, skips the fourth.
        pick("u1", "s1", "away"),
        pick("u1", "s2", "away"),
        pick("u1", "s3", "away"),
        // Ben calls all four but gets one wrong.
        pick("u2", "s1", "away"),
        pick("u2", "s2", "away"),
        pick("u2", "s3", "home"),
        pick("u2", "f1", "home"),
      ],
    })!;
    // Both landed 3 correct knockout calls out of the 4 on the slate.
    expect(r.bestKnockout).toEqual({
      names: ["Ana", "Ben"],
      more: 0,
      ok: 3,
      total: 4,
    });
  });

  it("reports how the office called the final", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      predictions: [
        pick("u1", "f1", "home"), // backed Spain — right
        pick("u2", "f1", "away"),
        pick("u3", "f1", "away"),
      ],
    })!;
    expect(r.final.winner).toBe("Spain");
    expect(r.final.ok).toBe(1);
    expect(r.final.n).toBe(3);
  });

  it("builds no personal card when signed out", () => {
    const r = computeFinale(input(true))!;
    expect(r.personal).toBeNull();
  });

  it("builds no personal card for someone who never had a pick scored", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      viewerId: "u3",
      predictions: [pick("u1", "g1", "draw")],
    })!;
    expect(r.personal).toBeNull();
  });

  it("reports the viewer's own accuracy and knockout record", () => {
    const base = input(true);
    const r = computeFinale({
      ...base,
      viewerId: "u1",
      predictions: [
        pick("u1", "g1", "draw"), // right (group)
        pick("u1", "g2", "away"), // wrong
        pick("u1", "s1", "away"), // right (KO)
        pick("u1", "f1", "home"), // right (KO)
        pick("u2", "g1", "home"), // someone else — must not leak in
      ],
    })!;
    const p = r.personal!;
    expect(p.displayName).toBe("Ana");
    expect(p.picked).toBe(4);
    expect(p.correct).toBe(3);
    expect(p.accuracyPct).toBe(75);
    expect(p.koCorrect).toBe(2);
    expect(p.koTotal).toBe(4);
  });

  it("measures the longest streak in kickoff order, not pick order", () => {
    const ordered: Match[] = [
      { ...match("m1", "group", "A", "B"), kickoff: "2026-06-11T18:00:00.000Z" },
      { ...match("m2", "group", "C", "D"), kickoff: "2026-06-12T18:00:00.000Z" },
      { ...match("m3", "group", "E", "F"), kickoff: "2026-06-13T18:00:00.000Z" },
      { ...match("m4", "group", "G", "H"), kickoff: "2026-06-14T18:00:00.000Z" },
      match("f1", "final", "Spain", "Argentina"),
    ];
    const r = computeFinale({
      matches: ordered,
      results: [
        { matchId: "m1", outcome: "home" },
        { matchId: "m2", outcome: "home" },
        { matchId: "m3", outcome: "home" },
        { matchId: "m4", outcome: "home" },
        { matchId: "f1", outcome: "home" },
      ],
      users: USERS,
      viewerId: "u1",
      // Fed in deliberately shuffled order: m4, m1, m3, m2.
      // Chronologically that is right, WRONG, right, right -> longest run 2.
      predictions: [
        pick("u1", "m4", "home"), // right
        pick("u1", "m1", "home"), // right
        pick("u1", "m3", "home"), // right
        pick("u1", "m2", "away"), // wrong
      ],
    })!;
    expect(r.personal!.longestStreak).toBe(2);
  });

  it("names the viewer's sharpest read: the correct call fewest others made", () => {
    const base = input(true);
    const preds = [
      // g1 (draw): Ana is one of only 2 who saw it, out of 12.
      pick("u1", "g1", "draw"),
      pick("u2", "g1", "draw"),
      ...Array.from({ length: 10 }, (_, i) => pick(`x${i}`, "g1", "home")),
      // g2 (home): Ana is one of 11 out of 12 — the obvious call.
      pick("u1", "g2", "home"),
      ...Array.from({ length: 10 }, (_, i) => pick(`y${i}`, "g2", "home")),
      pick("u3", "g2", "away"),
    ];
    const r = computeFinale({ ...base, viewerId: "u1", predictions: preds })!;
    expect(r.personal!.bestCall?.matchId).toBe("g1");
    expect(r.personal!.bestCall?.ok).toBe(2);
    expect(r.personal!.bestCall?.n).toBe(12);
  });

  it("survives a cup with no predictions at all", () => {
    const r = computeFinale(input(true))!;
    expect(r.picks).toBe(0);
    expect(r.accuracyPct).toBe(0);
    expect(r.hardest).toBeNull();
    expect(r.banker).toBeNull();
    expect(r.bestKnockout).toBeNull();
    expect(r.champion).toBe("Spain");
  });
});
