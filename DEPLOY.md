# Deploy — WM 2026 Office Cup → Vercel

The app runs **with zero setup on mock data** (great for a first preview deploy). To make it the real, persistent, auto-updating thing you add a free database + a couple of env vars. ~10 minutes, all free tiers.

## 0. Run it locally (sanity check)
```bash
npm install
npm run dev          # → http://localhost:3000   (mock data, nothing to configure)
```
- `SEED_DEMO=1 npm run dev` shows a **populated demo** (fake mid-tournament race) for showing colleagues.
- `ORGANIZER_CODE=test npm run dev` lets you open the Organizer area with the code `test`.

## 1. Deploy to Vercel (demo mode — works immediately)
1. Go to **vercel.com → Add New → Project** and import this GitHub repo (`VatsalEnpal/wm2026-office-cup`).
2. Framework auto-detects **Next.js**. Click **Deploy**. Done — it's live on mock data.

## 2. Make it real & persistent (add the DB + env)
**Database (free, one click):**
1. In your Vercel project → **Storage → Create Database → Neon (Postgres)**. Vercel auto-injects `DATABASE_URL`.
2. Apply the schema once (locally, with that URL):
   ```bash
   DATABASE_URL="postgres://…from Vercel…" npx drizzle-kit migrate
   ```
   Fixtures (the real 104-match 2026 schedule) seed automatically from `data/worldcup-2026.json` on first use.

**Env vars (Vercel → Settings → Environment Variables):**

| Var | Required? | Value |
|---|---|---|
| `DATABASE_URL` | for persistence | auto-set by the Neon integration |
| `CRON_SECRET` | **yes** (results cron) | any long random string. Vercel auto-sends it as `Authorization: Bearer …` on cron calls; the route fails **closed** without it. |
| `ORGANIZER_CODE` | **yes** (admin) | a password you invent — unlocks `/organizer` |
| `API_FOOTBALL_KEY` | **optional** | leave blank. Results come **free, no key** from ESPN. Only set this if you ever want API-Football as a redundant source (needs a paid plan for WC-2026). |
| `API_FOOTBALL_HOST` | optional | `v3.football.api-sports.io` (direct) or `api-football-v1.p.rapidapi.com` (RapidAPI) |

3. **Redeploy** after setting env vars.

## 3. Results — how they arrive (no key, no babysitting)
- A cron (`vercel.json` → `/api/cron/sync`) runs periodically. For each match that's **finished** (kickoff + ~3 h, +3.5 h for knockouts) and not yet recorded, it pulls the result from **ESPN's free API → openfootball → (optional API-Football) → else waits for an organizer override**, then recomputes the table.
- **Vercel Hobby caps cron at once/day.** For fresher updates either upgrade to Pro, or point a free **cron-job.org** schedule (every 3 h) at `https://<your-app>/api/cron/sync` with header `Authorization: Bearer <CRON_SECRET>`.
- **Organizer override:** if a result is ever wrong/missing, open `/organizer`, unlock with `ORGANIZER_CODE`, and set it by hand — that always wins over the feed.

## Notes
- Today (2 Jun) the tournament hasn't started, so **everything is open and nothing is locked** — correct. The scoreboard fills in once games are played (11 Jun+).
- ESPN's API is unofficial (no SLA) — the code treats any failure as "fall back," so a hiccup degrades gracefully, it doesn't break.
- This is a personal, not-company project — keep the "unofficial · no betting" framing; the disclaimer/consent strings still want a German translation + a quick legal sanity-check before a wide launch.
