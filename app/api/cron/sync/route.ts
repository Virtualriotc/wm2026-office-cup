import { NextResponse } from "next/server";
import { runSync } from "@/lib/ingest/sync";
import { constantTimeEqual } from "@/lib/auth";
import { getStore } from "@/lib/data";
import { summariseIntegrity } from "@/lib/integrity";
import { notifyTelegram } from "@/lib/notify";

// ============================================================================
// Cron route — AUTO-INGEST results (source of truth), then recompute.
//
// Triggered by Vercel cron (see vercel.json). Protected by CRON_SECRET: Vercel
// sends `Authorization: Bearer <CRON_SECRET>`. Anything else is rejected so the
// route can't be hit by the public.
//
// WHAT IT DOES: for every match whose result is DUE (now >= kickoff + buffer:
// 3h group / 3.5h knockout) and not yet recorded, runSync fetches the outcome
// from ESPN (free, no key — PRIMARY), then openfootball (fallback), then
// API-Football (only if API_FOOTBALL_KEY set — optional redundancy), and stores
// it as an AUTHORITATIVE feed result (source 'feed'), then recomputes the
// leaderboards and stamps the sync heartbeat. It is idempotent and frugal: only
// due-and-unrecorded matches are touched, so a re-run does no extra work.
//
// OVERRIDE, NOT CONFIRM: an organizer call (source 'organizer') always wins and
// is never clobbered (app/actions/organizer.ts). With no feed data the run
// no-ops gracefully and the organizer can confirm by hand. NO LIVE POLLING.
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  // Fail CLOSED: with no secret configured this route is publicly reachable, so
  // refuse to run rather than expose an unauthenticated endpoint in production.
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  // Constant-time compare so the secret can't be recovered byte-by-byte via a
  // response-timing oracle. A missing header fails the length check immediately
  // (its absence is not secret).
  if (!auth || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // runSync ingests due results, recomputes, and stamps the heartbeat. It never
  // throws, so the cron can't error out.
  const sync = await runSync();

  // DAILY SELF-CHECK: after every sync, diff the data against its own invariants
  // (duplicate fixtures, placeholder leaks, double-picks, stranded results…) and
  // surface the result on the organizer dashboard. On an ALARM, also ping
  // Telegram (if configured) so drift is caught by a machine in minutes — not by
  // a colleague's screenshot days later. Best-effort: never fails the cron.
  let integrity: Awaited<ReturnType<typeof runIntegrity>> | null = null;
  try {
    integrity = await runIntegrity(sync.note);
  } catch {
    /* integrity check is advisory; a failure must not break the cron */
  }

  return NextResponse.json({
    ok: true,
    koResolved: sync.koResolved,
    ingested: sync.ingested,
    pending: sync.pending,
    status: sync.status,
    note: sync.note,
    integrity: integrity ? { ok: integrity.ok, issues: integrity.issues } : null,
  });
}

/** Run the integrity check, stamp the dashboard note, alarm on any `alarm`. */
async function runIntegrity(syncNote: string) {
  const store = getStore();
  const report = await store.getIntegrityReport();
  const summary = summariseIntegrity(report);
  // Surface on the organizer dashboard alongside the sync note.
  await store.markSync(`${syncNote} · ${summary}`);
  if (!report.ok) {
    await notifyTelegram(`🚨 WM2026 ${summary}`);
  }
  return report;
}
