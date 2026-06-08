"use server";

import { headers } from "next/headers";
import { getStore } from "@/lib/data";
import { rateLimit, clientIpFrom } from "@/lib/rateLimit";

// Throttle this PUBLIC, unauthenticated read the same way the other public
// actions are (see account.ts). Without it, a tight loop of count() calls would
// keep waking Neon and could burn the free-tier compute budget — a cost-DoS.
// 120/min/IP mirrors the login/create ceiling: generous for a real office (the
// badge fetches once per full page load), a brake on a script. Per-process /
// in-memory (lib/rateLimit.ts), same honest trade the rest of the app accepts.
const COUNT_LIMIT = 120;
const COUNT_WINDOW_MS = 60_000;

/**
 * Public, read-only player count for the live badge in the nav. Returns 0 on a
 * rate-limit trip or any error, so the badge degrades to hidden rather than
 * throwing. The query itself is a single cheap COUNT(*), fetched once per page
 * load (no polling), so it doesn't keep the Neon compute awake.
 */
export async function getPlayerCount(): Promise<number> {
  try {
    let ip = "";
    try {
      ip = clientIpFrom(await headers());
    } catch {
      ip = "";
    }
    if (!rateLimit("player-count", ip, COUNT_LIMIT, COUNT_WINDOW_MS).ok) {
      return 0;
    }
    return await getStore().getUserCount();
  } catch {
    return 0;
  }
}
