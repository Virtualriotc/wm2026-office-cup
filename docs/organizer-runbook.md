# Organizer runbook — WM 2026 Office Cup

Short version: **the group stage runs itself. Your one real job is confirming knockout results (from ~28 June), especially penalty shootouts.**

## Getting in

- Go to `/organizer` and enter the **organizer code**.
- The code lives in Vercel → Project → Settings → Environment Variables as `ORGANIZER_CODE`. It is never shown in the app and never stored in the database (only a hash of it is checked). Keep it private — anyone with it can change results.
- Five wrong attempts a minute are blocked. Use the lock button (or clear cookies) to lock the screen again on a shared computer.

## What happens automatically (no action from you)

- **Group-stage results auto-ingest from ESPN**, about 3 hours after kickoff, picked up by the once-a-day sync at **05:00 UTC**.
- **Late matches lag overnight.** A match ending ~21:00 shows as "result pending" until the next morning's sync (~05:00 UTC). This is expected — the scoreboard says "pending", it is not broken. Tell colleagues results for evening games land the next morning.
- The scoreboard shows a **countdown** until the first kickoff (11 June), then automatically flips to the live department race.

## Your real job: knockout results (from ~28 June)

- Group-stage results are reliable and hands-off. **Knockouts are not fully automatic.**
- For each knockout result, open the match's **Override** control and set the winner. This is essential for **penalty shootouts**: the backup results feed only sees the level full-time score and cannot tell who advanced, so a shootout will not auto-resolve correctly. You decide it on the Override row.
- An **organizer override always beats the feed** and is never overwritten by a later sync. So it is also how you fix any wrong or missing result at any stage.

## Other controls

- **Sync now** — runs the same job as the daily cron immediately (use it to pull results without waiting for 05:00 UTC).
- **Seed fixtures** — reloads the schedule from openfootball. Rarely needed; the 104 fixtures are already bundled in the app.

## Things v1 does NOT do (so you are not surprised)

- **No "delete participant" button on this screen.** A person can remove themselves via **Account → "Delete my data"**. Removing someone else (e.g. a fake or duplicate entry) currently requires a direct database delete — ask whoever holds the Neon database access. Impersonation is only cosmetic: every account is its own private code, so a fake just adds a leaderboard row, it cannot take over a real person's entry.
- **No "forgot my code" recovery.** Codes are shown once at sign-up and only a hash is stored. If a colleague loses their code they cannot resume that entry — they rejoin as a new one. Remind everyone to save their `MP-XXXX-XXXX-XXXX` code.
