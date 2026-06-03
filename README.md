# WM 2026 Office Cup

A friendly World Cup 2026 prediction pool for colleagues. Pick the winner of
each match, and your points roll up into a live **department-vs-department
race**. No money, no betting, no odds — just bragging rights and a small
thank-you gift for the top tipsters.

> WM 2026 runs **11 Jun – 19 Jul 2026**. Today's reference date in the seed
> data is **2026-06-02**.

## What this is

- **Pick the winner**, not the score. One tap per match (Group: Home / Draw /
  Away; Knockout: which team advances).
- **Scoring**, knockouts weighted: Group 1 · R32 2 · R16 3 · QF 4 · SF 5 ·
  Final 6. A missed pick is 0, no penalty.
- **Department score = average points per _active_ member** (≥1 pick), so big
  teams don't win on headcount alone.
- **Relative leaderboard**: top 3 + your neighbours + percentile + climb-delta.
  Never "you're #47 of 50".
- **No password.** You get a private code (`MP-XXXX-XXXX-XXXX`); we store only a
  hash of it. Paste it to get back in.

## Run it (zero setup)

```bash
npm install
npm run dev        # http://localhost:3000
```

With **no environment variables set**, the app runs on an in-memory **mock
store** seeded with ~12 WM2026-style fixtures, 6 departments, and a few
colleagues. No database, no API key, nothing to configure. State resets when
the server restarts — that's expected for the mock.

Other scripts:

```bash
npm run typecheck  # tsc --noEmit (strict)
npm run test       # vitest (scoring rules)
npm run build      # production build
```

## Environment

All variables are **optional for local dev** (see `.env.example`). Copy it to
`.env.local` and fill in what you need:

| Variable           | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `DATABASE_URL`      | Neon Postgres. **Unset → mock store** (zero setup). Set → Drizzle/Neon.       |
| `API_FOOTBALL_KEY`  | **Optional** redundancy. Results come from ESPN (free, no key) by default.    |
| `API_FOOTBALL_HOST` | Optional. `v3.football.api-sports.io` (direct) or the RapidAPI host. |
| `CRON_SECRET`       | Protects `/api/cron/sync` (Vercel sends it as a Bearer token).                |
| `ORGANIZER_CODE`    | Unlocks the `/organizer` results-confirmation screen.                         |

## Deploy to Vercel

1. Push the repo and import it in Vercel. It builds and runs **as-is on the
   mock store** — a working preview with zero config.
2. (Optional, for persistence) Add **Neon** via the Vercel Marketplace; it sets
   `DATABASE_URL`. Then generate + push the schema:
   ```bash
   npm run db:generate && npm run db:push
   ```
3. Set `ORGANIZER_CODE` and `CRON_SECRET` in the Vercel project env.
4. The cron in `vercel.json` (`/api/cron/sync`, daily) auto-ingests results for
   every due match from **ESPN** (free, no key — primary), falling back to
   openfootball, then API-Football if `API_FOOTBALL_KEY` is set, and warms the
   recompute. Nothing to configure for results. Vercel **Hobby caps cron at once
   per day** — the schedule respects that. For more frequent runs, use Vercel
   Pro or an external pinger (e.g. cron-job.org) hitting `/api/cron/sync` with
   the `CRON_SECRET` bearer token. The organizer can also tap **Sync now** on
   `/organizer` to run a pass on demand.

## The data model — an honest note

We want this **free, low-maintenance, and 100% accurate**. Those three pull
against each other, so here's the deal plainly:

1. **Fixtures / bracket / kickoffs** are seeded **once** from
   [`openfootball/worldcup.json`](https://github.com/openfootball/worldcup.json)
   (CC0, no key). The mock store has these baked in; production seeds them via
   `seedFromOpenfootball()`.
2. **Results auto-ingest, ESPN-first.** For every match whose result is due
   (now ≥ kickoff + buffer: 3h group / 3.5h knockout) and not yet recorded, the
   sync resolves the winner in priority order and stores it as an authoritative
   `feed` result:
   1. **ESPN** site scoreboard (`site.api.espn.com/.../fifa.world/scoreboard`) —
      **free, NO key/header**, already serving real WC2026 data. One call per
      due match-day, matched to our fixtures by UTC day + team name (with a
      small alias map, e.g. ESPN `Czechia` ↔ schedule `Czech Republic`).
      Outcome is read **only when `completed`** — on penalties (`FT-Pens`) the
      regulation score is level but the winner flag marks the advancer, so we
      trust the flag. **Knockout fixtures are skipped** for now (their seeded
      teams are bracket placeholders like `W101`); the organizer override covers
      KO until the bracket fills (see the `TODO(KO)` in `lib/ingest/espn.ts`).
   2. **openfootball** scores (free, no key) for any match ESPN didn't resolve.
   3. **API-Football** — **OPTIONAL** redundancy, only when `API_FOOTBALL_KEY`
      is set (channel-agnostic: api-sports.io direct or RapidAPI via
      `API_FOOTBALL_HOST`).
   Every source degrades to empty gracefully and never throws; the run is
   idempotent and only touches due-and-unrecorded matches.
3. **The ORGANIZER override always wins.** A one-tap organizer confirmation per
   match (source `organizer`) overrides any feed result and is never clobbered,
   so the game stays **100% accurate** even if a feed is wrong, late, or missing.

**Why ESPN as primary?** It's free, needs no key, and (verified by live test)
already serves real WC2026 fixtures and results. The owner's API-Football key is
dead and its free tier likely excludes WC2026, so API-Football is demoted to
optional redundancy. The app **degrades gracefully** at every layer (any source
unreachable → fall to the next → organizer confirms by hand), so accuracy never
depends on a single feed.

Recompute is **idempotent**: each result confirmation triggers a full recompute
of the leaderboards from `(predictions, results)` in one transaction, so
re-running never double-counts.

**Where feed suggestions live (a caveat).** A feed suggestion is an
_unconfirmed_ hint, not a result. The shared `DataStore` contract models only
confirmed results, so suggestions + the "last sync" heartbeat are held in
`lib/ingest/feedStore.ts` (server-side, **in-memory per process**). That means
they reset on restart and aren't shared across serverless instances — which is
fine: losing a suggestion just means the organizer reads the score off the TV
instead of one-tapping a pre-fill. For a durable deploy, promote these to a
`feed_source` table; the organizer-confirm path is unchanged either way.

## Lock enforcement (important)

Each match **locks at kickoff**, enforced **server-side**: `lib/data.ts`
`savePredictions` rejects any write where `now >= match.kickoff`, no matter
which UI or endpoint calls it. A greyed-out button is not the protection — the
store is. After lock, picks are published.

## What the owner must provide

- **Department list** — the race's lanes. Placeholder list: Ops, Tech, Sales,
  CS, Retention, Upsell, Invoice, Marketing, People, Finance, Other.
- **A free API-Football key** (optional redundancy only — results come from
  ESPN free/no-key by default).
- **A Neon `DATABASE_URL`** (optional, for persistence beyond the mock).
- **The prize** — modest, non-cash, top few places. Needs to exist by the final.

## Compliance posture

A private, just-for-fun game by colleagues. **Not affiliated with or endorsed
by Enpal.** Free to enter, no stakes, no betting, no odds. We store only a
nickname, department, picks, and a private code — no email, no password, no
tracking. Disclaimer/consent strings live in `lib/copy.ts` and **need a German
translation + a German lawyer's sanity-check before launch** (this is not legal
advice).

## Project map

```
app/                    Next.js App Router (layout, landing, cron routes)
app/organizer/          Organizer/admin area (gated by requireOrganizer)
app/actions/organizer.ts  Server actions: confirmResult (source of truth), seed, sync
app/api/cron/sync/      CRON_SECRET-protected feed sync (pre-fill + recompute warm)
components/organizer/   Confirm rows, sync heartbeat, seed + code-gate UI
components/ui/           Neo-brutalist primitives (Button, Card, Pill, Tag, StepBadge, Field/Input)
components/             TopNav (shared shell)
lib/ingest/espn.ts          ESPN scoreboard client + matcher (keyless PRIMARY results source)
lib/ingest/openfootball.ts  Seed fixtures from openfootball (graceful + bundled fallback)
lib/ingest/apiFootball.ts   APIFootballClient (OPTIONAL redundancy; api-sports.io or RapidAPI; null on no-key)
lib/ingest/sync.ts          Sync orchestration (ESPN → openfootball → API-Football), cron + "sync now"
lib/ingest/feedStore.ts     In-memory feed suggestions + sync heartbeat
lib/types.ts    Shared domain contracts
lib/scoring.ts  Pure rules engine (+ scoring.test.ts)
lib/auth.ts     Codes, hashing, sessions (server-only)
lib/data.ts     DataStore interface + in-memory mock + Neon stub; getStore()
lib/copy.ts     Every UI string, typed, locale-keyed
db/schema.ts    Drizzle schema (Neon)
db/client.ts    Lazy Neon/Drizzle client
```
