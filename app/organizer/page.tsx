import type { Match, Result } from "@/lib/types";
import { getStore } from "@/lib/data";
import { requireOrganizer } from "@/lib/auth";
import { COPY } from "@/lib/copy";
import { Card } from "@/components/ui";
import { OrganizerCodeGate } from "@/components/organizer/OrganizerCodeGate";
import { MatchConfirmRow } from "@/components/organizer/MatchConfirmRow";
import { SyncHeartbeat } from "@/components/organizer/SyncHeartbeat";
import { SeedButton } from "@/components/organizer/SeedButton";

// The organizer surface is authoritative + reads request cookies, so it must be
// dynamic (never statically cached).
export const dynamic = "force-dynamic";

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Group matches into ordered (date -> matches) buckets — the "matchdays". */
function groupByDay(matches: Match[]): Array<{ key: string; matches: Match[] }> {
  const buckets = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.kickoff.slice(0, 10);
    const list = buckets.get(key);
    if (list) list.push(m);
    else buckets.set(key, [m]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, ms]) => ({ key, matches: ms }));
}

export default async function OrganizerPage() {
  // Server-side gate. The signed-in user's isOrganizer flag OR a valid organizer
  // cookie (set by unlocking with ORGANIZER_CODE) unlocks this surface; anything
  // else falls to the code gate. The code is never read from the URL.
  try {
    await requireOrganizer();
  } catch {
    return <OrganizerCodeGate />;
  }

  const store = getStore();
  const [matches, results, syncStatus] = await Promise.all([
    store.getMatches(),
    store.getResults(),
    store.getSyncStatus(),
  ]);

  const resultByMatch = new Map<string, Result>();
  for (const r of results) resultByMatch.set(r.matchId, r);

  const days = groupByDay(matches);
  let rowIndex = 0;

  return (
    <div className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="display text-[2rem]">{COPY.organizer.title}</h1>
        <p className="text-[0.95rem]" style={{ color: "var(--color-muted)" }}>
          {COPY.organizer.subhead}
        </p>
      </header>

      {/* Controls: sync heartbeat + seed. */}
      <Card className="p-4">
        <SyncHeartbeat status={syncStatus} />
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-ink)" }}>
          <SeedButton />
        </div>
      </Card>

      <p className="text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
        {COPY.organizer.recomputeNote}
      </p>

      {/* Per-matchday list. */}
      {days.length === 0 ? (
        <Card className="p-6">
          <p>{COPY.empty.noMatchesOpen}</p>
        </Card>
      ) : (
        days.map((day) => (
          <section key={day.key} className="flex flex-col gap-3">
            <h2 className="display text-[1.15rem]">{dayLabel(day.matches[0]!.kickoff)}</h2>
            <div className="flex flex-col gap-3">
              {day.matches.map((m) => {
                const delay = Math.min(rowIndex++ * 0.03, 0.3);
                return (
                  <MatchConfirmRow
                    key={m.id}
                    match={m}
                    result={resultByMatch.get(m.id) ?? null}
                    delay={delay}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
