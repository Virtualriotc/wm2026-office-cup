# WM 2026 Office Cup — Goal

> **Vision (one line):** *Pick winners, talk smack, watch your department climb — the World Cup office pool that takes 2 minutes a round and looks like a broadcast title sequence.*

A fun, motion-graphics-heavy web app where a few hundred Enpal colleagues predict FIFA World Cup 2026 matches (11 Jun – 19 Jul 2026). Each person joins under a self-chosen name + their department, picks **who wins** each match, and their points roll up into a live **department-vs-department race**. One prize for the top individual at the end; bragging rights for the top department.

This document is the product goal + the locked decisions. It is grounded in five research tracks (data, motion stack, office-pool UX, German GDPR/gambling law, Vercel architecture) plus a PM/strategy + competitor + engagement-mechanics pass, each adversarially fact-checked. Sources live in the research outputs; the load-bearing claims are footnoted inline.

---

## 0. The decisions (locked unless Vatsal vetoes)

| # | Decision | Why |
|---|----------|-----|
| 1 | **No real login.** Self-chosen display name + department + a private bookmarkable link (secret token). No password, no email, no SSO. | Lowest friction, lowest GDPR surface, **zero Enpal IT/compliance involvement**. A pseudonym + department is still personal data, so we owe a short privacy note — but nothing heavy. |
| 2 | **Pick-the-winner (W / D / L), not exact scores.** | Both the UX and PM research land here hard: exact-score entry across 104 matches is the #1 driver of mid-tournament drop-off. One tap per match → a casual colleague finishes a matchday in under a minute. |
| 3 | **Free to enter. A modest non-cash gift for the winner(s).** | Free entry is the single lever that keeps this clearly outside German gambling law (Glücksspiel needs a stake *and* predominant chance; a free skill game fails both). |
| 4 | **No betting odds. Ever.** Internal "office consensus" (what colleagues picked) is the only crowd signal, and it's optional. | Compliance + the owner said no odds. Consensus is fun and zero-risk because we compute it ourselves. |
| 5 | **The Department Race is the hero.** Every other screen is a clean, fast list. | It's the one thing that turns an individual chore into a team sport with a visible, screenshot-able, emotional payoff. Concentrate the motion budget here. |
| 6 | **Admin enters match winners by hand; this is the source of truth.** Optional API sync later. | Because v1 only needs each match's *winner* (not a scoreline), manual entry is ~5 min per matchday. This **kills the biggest risk** (results pipeline) without depending on any flaky free API. |
| 7 | **Stack:** Next.js (App Router) + TypeScript on Vercel, Neon Postgres + Drizzle, Motion (`motion/react`) for animation. | Fewest moving parts; all free-tier-friendly; one repo, one DB, one deploy. |

---

## 1. The game & scoring

**You predict the winner of each match** (Group: Home / Draw / Away. Knockout: which team advances — no draws). One tap. Pick a whole matchday in advance ("set and forget").

**Scoring — deliberately simple, knockouts weighted higher** (so latecomers and the back half of the table stay alive — this single rule does the retention heavy-lifting):

| Stage | Correct pick |
|-------|--------------|
| Group match | **1 pt** |
| Round of 32 | **2 pts** |
| Round of 16 | **3 pts** |
| Quarter-final | **4 pts** |
| Semi-final | **5 pts** |
| Final | **6 pts** |

- **No pick before lock = 0 pts** for that match, shown as "missed". No penalty beyond the zero.
- **Tie-breakers** (fixed, stated up front): (1) most correct knockout picks, (2) most correct picks overall, (3) earliest join. Pick one and never change it.
- **Optional, post-v1 depth (COULD):** a **double-down joker** (one per stage, doubles points on a chosen match — this is the comeback + agency lever in one) and an optional **exact-score bonus** (+1) for the hardcore. Both are off in v1.

**Department score = average points per *active* member** (members who made ≥1 pick), **not** sum — sum lets the biggest department win automatically and demotivates small teams. Guard against a tiny team gaming it with a minimum-participants rule (e.g. ≥3 active members to appear on the race, or "average of top N").

**Lock:** each match locks **at kickoff**, enforced **server-side** (reject any write where `now() >= match.kickoff`). The moment a match locks, everyone's picks for it become visible (transparency kills cheating suspicion). The colleague's spec used kickoff − 12h; we use kickoff for v1 because it's friendlier and simpler — trivially configurable later.

---

## 2. Screens (v1)

Five surfaces, mobile-first. Nav via a bottom tab bar.

1. **Landing / Join** — kinetic hero ("WM 2026 OFFICE CUP" + animated ball/trophy) → enter display name, pick department from a dropdown, tick the consent/18+ box → in. Stores identity in a cookie + a DB row, hands back the private link. First pick possible in < 60s.
2. **Pick** — the next open matchday as a vertical list; tap one team (or Draw) per match; a visible per-match lock countdown; batch save. No scores, no keyboard.
3. **Department Race (home / hero)** — the animated who's-winning/who's-losing track. Each department is a character that surges/stalls as results resolve, with overtakes and a "biggest mover this week". Your department is marked.
4. **Leaderboard** — **relative, never absolute**: top 3 + the few players directly above/below *you* + your percentile + your climb-delta ("up 4 this round"). A second tab for department standings. We never render "you are #47 of 50" — that's the documented pool-killer.
5. **Share** — one tap to generate a standings/race image a department captain can drop in a Teams/Slack channel. (Sharing is the growth loop.)

**Engagement (v1 = restrained):** at most **2 notifications/week**, opt-in — one "picks close in 3h, you haven't predicted" nudge and one "round results + your new rank" recap. Nothing per-match. A "this week's winner / most-improved" mini-highlight so anyone can win something regardless of overall rank.

---

## 3. Identity, compliance & disclaimer

**Posture:** GDPR-*light*, not GDPR-none. We store only a display name (nickname fine), a department, picks, and a private token. No email, no password, no tracking cookies → **no cookie banner** (only the technically-necessary session cookie). Token is a credential: long, random, stored hashed, regenerable. Department dropdown includes an "Other / prefer not to say" option to weaken re-identifiability. Delete all data ~30–60 days after the final (or self-delete via the link).

**Drafted strings** (English; **needs German translation + a German lawyer's sanity-check before launch**):

- **Header banner:** *"A friendly World Cup prediction game by colleagues, for colleagues. A private, personal project — not organised, endorsed by, or affiliated with Enpal. Just for fun. Joining is completely voluntary."*
- **Consent checkbox:** *"I'm joining for fun and on my own. I get that this is a private project, not an Enpal thing, and that Enpal isn't involved or responsible. I'm 18 or older. I'm happy with my chosen name and department on the leaderboard, and I know I can ask to be removed any time."*
- **Prize line (no betting/money language):** *"No entry fee, no stakes — pure football bragging rights. At the end, the organiser will arrange a small thank-you gift for the top predictors. A token of fun, nothing more."*
- **Footer privacy one-liner:** *"We store only the name and department you pick (a nickname is fine), your predictions, and a private link key — no email, no password, no tracking. Everything is deleted shortly after the final."*

**Non-negotiables that keep this safe:** stays free to enter; prize is a modest **non-cash** gift (well under ~€500), top few places only; no Enpal logo / no implication of endorsement; participation visibly voluntary and off the clock; ready to take down if the employer objects. *(Not legal advice — final German wording, prize tax/works-council touchpoints, and showing colleague departments should get a real review.)*

---

## 4. Data & results

- **Fixtures / bracket / kickoff times:** seed once from **`openfootball/worldcup.json`** (CC0, no key, verified to contain all 104 CAN/USA/MEX 2026 matches with kickoff times + groups + bracket).
- **Results:** **admin enters the winner of each match** via a protected `/admin` screen (one tap per match). This is the source of record. An optional API-Football sync (free tier, *unverified* for the 2026 season — must be live-tested before trusting) can pre-fill, but admin always overrides.
- **Recompute:** on each result entry/correction, **full-recompute** the leaderboard from `(predictions, results)` inside one transaction (DELETE+INSERT derived tables) so it's idempotent — re-running never double-counts. Stamp `computed_at`.

---

## 5. Architecture (minimal)

- **Next.js App Router + React + TypeScript** on **Vercel**. Logic in Route Handlers + Server Actions. No separate backend.
- **Neon Postgres** (via the Vercel Marketplace) + **Drizzle ORM**. Chosen over Supabase because Neon scales to zero but **never pauses** the project — Supabase free pauses after 7 days idle, a footgun for an app quiet between matchdays.
- **Server-side lock** on every prediction write; `UNIQUE(user_id, match_id)`.
- **Cron** only matters if we add API sync: Vercel Hobby caps cron at once/day, so either Vercel Pro ($20/mo) or a free `cron-job.org` ping to a token-protected route. v1 with manual results **needs no cron at all**.
- **Motion:** `motion/react` (v12) as the primary layer via `LazyMotion` + `m` (~4.6KB initial); `canvas-confetti` for celebration bursts; optionally one Rive `.riv` for the hero character. Guardrails: animate only transform/opacity, honor `prefers-reduced-motion` (OS media query OR an in-app toggle), cap simultaneous animations, mobile-first for INP. Skip GSAP/R3F/Lottie unless a specific moment demands them.

**Minimal data model:** `departments(id, name)` · `users(id, display_name, department_id, token_hash, is_admin, joined_at)` · `matches(id, stage, group, home_team, away_team, kickoff, status, external_ref)` · `predictions(id, user_id, match_id, pick ∈ {home,draw,away}, created_at, UNIQUE(user_id,match_id))` · `results(match_id, outcome, source ∈ {admin,feed}, updated_at)` · `leaderboard_user(user_id, points, rank, computed_at)` · `leaderboard_department(department_id, avg_points, member_count, rank, computed_at)` · `office_consensus(match_id, pct_home, pct_draw, pct_away, n, computed_at)`.

**Single biggest maintenance risk:** the results/cron pipeline. Mitigated by making manual admin entry the source of truth and adding a heartbeat ("last updated 2h ago") so a frozen leaderboard is visible, not silent.

---

## 6. What we are NOT building (anti-scope-creep)

No real accounts / SSO / email. No exact-score or full-bracket prediction in v1. **No money, buy-in, payouts, or betting odds — ever.** No chat / comments / social feed. No admin CMS beyond a results-entry screen. No multiple sub-pools. No native app / push infra. No deep stats (xG, form). No Enpal branding or anything implying endorsement. No data we don't strictly need.

---

## 7. Open inputs needed from Vatsal

1. **Departments** — PROVIDED. Seed list: **Energy Ops, Energy Tech, Energy Invoicing, Energy CS, Energy Finance**. Plus: **users can add their own department** at join (a combobox — pick an existing one or type a new one, which creates it). This makes departments dynamic (not a fixed enum), so the race must handle lanes appearing over time, and the "average points per active member" scoring needs the min-participants guard to stop a one-person department gaming the standings.
2. **The prize** (kept modest + non-cash) — can be decided later, just needs to exist by the final.
3. **Cron budget choice** — only relevant if/when we add API sync: Vercel Pro ($20/mo) vs free `cron-job.org`. v1 needs neither.

---

## 8. How we'll build it (after wireframe approval)

A five-role agent fleet driven by the superpowers skill chain (brainstorm → plan → subagent-driven build with review gates), in a git worktree. Roles: **design lead** (frontend-design + motion skills), **frontend builder**, **technical-QA** (TDD + server-side-lock tests + `code-review` + silent-failure-hunter on the lock path), **visual-QA** (Playwright MCP eyes + Vercel web-interface-guidelines), and a **design critic** in the loop (the one piece we author). Full roster, tools to install, and the loop shape: see [`docs/build-fleet.md`](docs/build-fleet.md).

---

*v1 target: colleagues in and predicting by the group stage (11 Jun). Ship Must-only; add the highest-signal Should items only if week-1 retention says people want more.*
