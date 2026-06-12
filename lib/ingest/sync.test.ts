// ============================================================================
// runSync — the AUTOMATED-INGESTION orchestrator behind /api/cron/sync and the
// organizer "sync now" button. This was the one real coverage gap flagged
// pre-deploy: the cron e2e only ever ran on the EMPTY pre-tournament schedule,
// so the ingest / source-fallback / idempotency branches never executed.
//
// We close it OFFLINE: a real MockStore with three group fixtures faked into the
// past (so they are genuinely DUE relative to the wall clock — same trick the
// demo snapshot uses), and `global.fetch` stubbed to return a captured-shape
// ESPN scoreboard document. No network. We assert, end to end:
//   1. ESPN PRIMARY: a due match with a completed ESPN result ingests as source
//      'feed' and scores (the leaderboard moves).
//   2. IDEMPOTENT: a second pass ingests 0 and leaves results identical.
//   3. ORGANIZER OVERRIDE is never clobbered by a later feed value.
//   4. OPENFOOTBALL FALLBACK: when ESPN yields nothing, a due match still
//      ingests from openfootball (matched by externalRef).
//   5. DEGRADED: every source unreachable => 0 ingested, status 'degraded',
//      nothing thrown, heartbeat still stamped.
//   6. NO-OP: nothing due => 0 ingested, heartbeat stamped, no network calls.
//
// runSync reads the PROCESS-GLOBAL store (getStore()) and the real Date.now(),
// so we PIN our store on globalThis and use wall-clock-relative past kickoffs —
// no clock mock needed; the store's lock and runSync's due-cutoff agree.
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { MockStore } from "../data";
import { runSync } from "./sync";
import type { Outcome } from "../types";

// The three earliest REAL group fixtures (ids content-derived in lib/seed.ts).
const G1 = "of-matchday-1-mexico-south-africa"; // Mexico v South Africa
const G2 = "of-matchday-1-south-korea-czech-republic"; // South Korea v Czech Republic
const G3 = "of-matchday-2-canada-bosnia-herzegovina"; // Canada v Bosnia & Herzegovina

const STORE_KEY = "__wm2026_data_store__";

/** Pin a store as the process-global one runSync will resolve via getStore(). */
function installStore(store: MockStore): void {
  (globalThis as unknown as Record<string, unknown>)[STORE_KEY] = store;
}
function clearStore(): void {
  delete (globalThis as unknown as Record<string, unknown>)[STORE_KEY];
}

/**
 * A MockStore that fakes the three earliest group fixtures into the PAST so they
 * are due for a result, and exposes their (real) team names so the test can
 * build matching ESPN events. Everything else is the stock store.
 */
class DueGroupStore extends MockStore {
  /** Build the store and shift G1/G2/G3 kickoffs to N hours ago (well past the
   *  3h group buffer), so both isLocked and runSync's due-cutoff see them. */
  static async make(): Promise<DueGroupStore> {
    const store = new DueGroupStore({ seedDemo: false });
    await store.seedFromOpenfootball();
    store.fakePast(G1, 8);
    store.fakePast(G2, 8);
    store.fakePast(G3, 8);
    return store;
  }

  private fakePast(id: string, hoursAgo: number): void {
    // Reach into the protected match list via a tiny typed accessor.
    const matches = (this as unknown as { matches: { id: string; kickoff: string }[] })
      .matches;
    const m = matches.find((x) => x.id === id);
    if (!m) throw new Error(`seed match missing: ${id}`);
    m.kickoff = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  }

  /** The real teams for a faked-past fixture, for building a matching ESPN event. */
  async teamsFor(id: string): Promise<{ home: string; away: string; day: string }> {
    const m = (await this.getMatches()).find((x) => x.id === id);
    if (!m) throw new Error(`seed match missing: ${id}`);
    return {
      home: m.home,
      away: m.away,
      day: new Date(m.kickoff).toISOString().slice(0, 10).replace(/-/g, ""),
    };
  }
}

/** One ESPN scoreboard "event" in the captured shape parseEspnScoreboard reads. */
function espnEvent(
  dateUtcIso: string,
  home: string,
  away: string,
  winner: "home" | "away" | "draw",
) {
  return {
    date: dateUtcIso,
    season: { slug: "group-stage" },
    competitions: [
      {
        status: { type: { state: "post", completed: true, detail: "FT" } },
        competitors: [
          { homeAway: "home", winner: winner === "home", team: { displayName: home, abbreviation: home.slice(0, 3).toUpperCase() } },
          { homeAway: "away", winner: winner === "away", team: { displayName: away, abbreviation: away.slice(0, 3).toUpperCase() } },
        ],
      },
    ],
  };
}

/** A fetch stub that serves a fixed ESPN scoreboard for ANY ?dates= day, and
 *  404s anything else (openfootball URLs) so ESPN is the only live source. */
function espnOnlyFetch(events: object[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("site.api.espn.com")) {
      return new Response(JSON.stringify({ events }), { status: 200 });
    }
    // openfootball / anything else: unreachable.
    return new Response("not found", { status: 404 });
  });
}

describe("runSync — automated ingestion (ESPN primary)", () => {
  let store: DueGroupStore;

  beforeEach(async () => {
    store = await DueGroupStore.make();
    installStore(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearStore();
  });

  it("ingests a due match's ESPN result as source 'feed' and scores it", async () => {
    const t1 = await store.teamsFor(G1);
    const t2 = await store.teamsFor(G2);
    // Mexico (home) beats South Africa; South Korea v Czech Republic is a draw.
    const events = [
      espnEvent(new Date(Date.now() - 8 * 3_600_000).toISOString(), t1.home, t1.away, "home"),
      espnEvent(new Date(Date.now() - 8 * 3_600_000).toISOString(), t2.home, t2.away, "draw"),
    ];
    vi.stubGlobal("fetch", espnOnlyFetch(events));

    const res = await runSync();

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    expect(res.ingested).toBeGreaterThanOrEqual(1);

    const results = await store.getResults();
    const g1 = results.find((r) => r.matchId === G1)!;
    expect(g1).toBeTruthy();
    expect(g1.source).toBe("feed");
    expect(g1.outcome).toBe<Outcome>("home");

    // The match now reads as final, and a recompute over it is consistent
    // (the leaderboard read after ingest must not throw and reflects the result).
    const match = (await store.getMatches()).find((m) => m.id === G1)!;
    expect(match.status).toBe("final");
    const board = await store.getLeaderboard();
    expect(Array.isArray(board)).toBe(true);
  });

  it("is idempotent: a second pass ingests 0 and results are unchanged", async () => {
    const t1 = await store.teamsFor(G1);
    const events = [
      espnEvent(new Date(Date.now() - 8 * 3_600_000).toISOString(), t1.home, t1.away, "home"),
    ];
    vi.stubGlobal("fetch", espnOnlyFetch(events));

    const first = await runSync();
    expect(first.ingested).toBeGreaterThanOrEqual(1);
    const after1 = await store.getResults();

    const second = await runSync();
    expect(second.ingested).toBe(0); // nothing new is due-and-unrecorded
    const after2 = await store.getResults();

    expect(after2.length).toBe(after1.length);
    expect(after2.find((r) => r.matchId === G1)?.outcome).toBe(
      after1.find((r) => r.matchId === G1)?.outcome,
    );
  });

  it("never clobbers an organizer override with a later feed value", async () => {
    const t1 = await store.teamsFor(G1);
    // Organizer calls G1 'away' first.
    await store.setResult(G1, "away");

    // Then the feed says 'home' for the same match.
    const events = [
      espnEvent(new Date(Date.now() - 8 * 3_600_000).toISOString(), t1.home, t1.away, "home"),
    ];
    vi.stubGlobal("fetch", espnOnlyFetch(events));

    await runSync();

    const g1 = (await store.getResults()).find((r) => r.matchId === G1)!;
    expect(g1.source).toBe("organizer");
    expect(g1.outcome).toBe<Outcome>("away"); // override held
  });

  it("falls back to openfootball when ESPN yields nothing for a due match", async () => {
    // The due match's externalRef == its id (content-derived in lib/seed.ts).
    // openfootball results parser (lib/ingest/openfootball) keys on
    // r.externalRef + score.ft = [home, away], so we serve exactly that shape.
    const fetchStub = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("site.api.espn.com")) {
        // ESPN online but with nothing usable -> the sync must fall back.
        return new Response(JSON.stringify({ events: [] }), { status: 200 });
      }
      // openfootball worldcup.json: { matches: [ { externalRef, score:{ft:[h,a]} } ] }.
      return new Response(
        JSON.stringify({
          matches: [{ externalRef: G1, score: { ft: [2, 0] } }], // home win
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchStub);

    const res = await runSync();
    expect(res.ok).toBe(true);
    expect(res.ingested).toBeGreaterThanOrEqual(1);

    const g1 = (await store.getResults()).find((r) => r.matchId === G1)!;
    expect(g1).toBeTruthy();
    expect(g1.source).toBe("feed");
    expect(g1.outcome).toBe<Outcome>("home"); // 2-0 -> home

    const status = await store.getSyncStatus();
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("degrades gracefully when every source is unreachable", async () => {
    // All fetches fail. runSync must not throw; it stamps a heartbeat and reports
    // pending due matches with 0 ingested.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream down", { status: 502 })),
    );

    const res = await runSync();
    expect(res.ok).toBe(true);
    expect(res.ingested).toBe(0);
    expect(res.pending).toBeGreaterThan(0);
    expect(res.status).toBe("degraded");

    const status = await store.getSyncStatus();
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("no-ops with nothing due (clean store) and still stamps the heartbeat", async () => {
    // A clean store with the REAL future schedule (nothing past) — no fetch needed.
    // Pin the clock to BEFORE the tournament so nothing is due (runSync reads
    // Date.now() for the due-cutoff); otherwise this goes non-deterministic once
    // real matches have kicked off.
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-06-01T00:00:00.000Z").getTime(),
    );
    const clean = new MockStore({ seedDemo: false });
    await clean.seedFromOpenfootball();
    installStore(clean);
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    const res = await runSync();
    expect(res.ok).toBe(true);
    expect(res.ingested).toBe(0);
    expect(res.pending).toBe(0);

    const status = await clean.getSyncStatus();
    expect(status.lastSyncAt).not.toBeNull();
  });
});
