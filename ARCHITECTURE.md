# Architecture — WM 2026 Office Cup

One Next.js app. No separate backend. Everything authoritative runs server-side; it deploys to Vercel as serverless functions + a cron, with Neon Postgres for storage.

## Stack
- **Next.js 15 (App Router) + React + TypeScript (strict)** — UI + server logic (Server Actions / Route Handlers).
- **Tailwind CSS v4 + Motion** — the "friendly neo-brutalist" design system (`app/globals.css` tokens; `components/ui/*`).
- **Drizzle ORM + Neon Postgres** — persistence. A `DataStore` interface (`lib/data.ts`) has two implementations: an **in-memory MockStore** (used when `DATABASE_URL` is unset → zero-setup demo) and a **DrizzleStore** (`db/drizzleStore.ts`, used when `DATABASE_URL` is set). Same behaviour, proven by one contract test run against both.

## Data flow
```
openfootball/worldcup.json  ──seed──▶  matches (real 104 fixtures, real kickoffs)
player ──pick winner──▶ Server Action (savePredictions) ──[server-side lock]──▶ predictions
cron (/api/cron/sync) ──ESPN → openfootball → (API-Football) → organizer──▶ results(source feed|organizer)
results + predictions ──pure scoring (lib/scoring.ts)──▶ leaderboard_user / leaderboard_department / office_consensus
```

## Key invariants (where the trust lives)
- **Server-side lock** — `savePredictions` rejects any pick where `now >= match.kickoff`, in the store itself, regardless of caller. `UNIQUE(user_id, match_id)`. (Tested by bypassing the UI.)
- **No real auth, low PII** — a generated `MP-XXXX-XXXX-XXXX` code maps to a **SHA-256-hashed** token in an httpOnly cookie; only the hash is stored. We store display name + department + picks — no email, no password, no tracking.
- **Organizer gate** — `/organizer` + the cron route require the organizer code / `CRON_SECRET`; both **fail closed** when unset.
- **Scoring is pure & idempotent** — group 1 / R32 2 / R16 3 / QF 4 / SF 5 / Final 6; department score = avg points per active member with a ≥3-member eligibility guard; recompute is a full re-derivation, so re-runs never double-count.

## Results sources (free, no human dependency)
1. **ESPN** open API (`site.api.espn.com/.../fifa.world/scoreboard`) — primary, **no key**, live + final, winner-flag (handles penalties). Any failure → fall back.
2. **openfootball** — fallback (community-edited, lagged), public domain.
3. **API-Football** — optional redundancy via env (direct or RapidAPI); its free tier likely doesn't cover WC-2026, so it's off by default.
4. **Organizer override** — manual, always wins; the safety net for a wrong/missing result.

## Dynamic departments
Seed: Energy Ops / Tech / Invoicing / CS / Finance. Players can **create a new department** at join (combobox). The race adds lanes as departments appear; the ≥3-member guard stops a one-person department gaming the standings.

## What's tested
- **vitest 59/59** — scoring, server-side lock (UI-bypassed), the store contract run against **both MockStore and a real Postgres (PGlite)** instance, and the ESPN parser/matcher against **real captured ESPN responses** (incl. penalties → advancer).
- **Playwright 30/30 + axe** — real-browser e2e of every screen (account + code, predict, scoreboard/race, organizer gate, cron auth) and accessibility (no serious/critical).
- **Real-mode check** — at today's clock the app correctly shows nothing locked + the empty scoreboard (pre-tournament reality).
- **Not yet verifiable** (deploy-time only): the live Neon connection string and live ESPN results during an actual match — the logic is proven, the live wiring is confirmed at deploy / first matchday.

## Where things live
`app/` routes + server actions · `components/` UI · `lib/` domain (types, data, auth, scoring, copy, ingest) · `db/` schema + Drizzle store + migrations · `data/worldcup-2026.json` real schedule · `e2e/` Playwright · `docs/` product spec (goal.md), copy deck, build fleet.
