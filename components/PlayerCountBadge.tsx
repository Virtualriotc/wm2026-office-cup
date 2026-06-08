"use client";

import { useEffect, useState } from "react";
import { getPlayerCount } from "@/app/actions/stats";

/**
 * Live player-count badge for the top nav: a softly pulsing green dot + the
 * number of registered players. Fetches ONCE on mount (no polling) so it never
 * holds the Neon compute awake — the count is fresh on every full page load,
 * which is enough for a vanity counter. Renders nothing until the count is known
 * (and stays hidden if it's 0 or the read fails), so it never flashes a wrong
 * or empty number.
 */
export function PlayerCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getPlayerCount()
      .then((n) => {
        if (alive) setCount(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!count || count < 1) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-extrabold"
      style={{
        background: "var(--color-cream)",
        border: "2px solid var(--color-ink)",
        boxShadow: "var(--shadow-hard-sm)",
      }}
      title={`${count} players have joined`}
    >
      <span className="live-dot" aria-hidden />
      {count} playing
    </span>
  );
}
