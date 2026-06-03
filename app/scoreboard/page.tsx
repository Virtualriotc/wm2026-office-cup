import { getStore, isMockStore } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { COPY, fill } from "@/lib/copy";
import { Card, Tag } from "@/components/ui";
import { buildRelativeView } from "@/components/scoreboard/relative";
import { buildRaceModel } from "@/components/scoreboard/raceModel";
import { DepartmentRace } from "@/components/scoreboard/DepartmentRace";
import { Leaderboard } from "@/components/scoreboard/Leaderboard";
import type { Consensus, Match } from "@/lib/types";

// The scoreboard reads live from the data store on every request. The mock
// store reflects the wall clock, so locked/upcoming matches are real relative
// to "now". Nothing here writes — it's a pure read surface.
export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  group: "Group",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  final: "Final",
};

/**
 * Resolve the viewer. Real session first. In demo (mock) mode, fall back to
 * the seeded "you" user so the relative leaderboard has a subject to frame —
 * an honest demo affordance, not a real auth bypass (mock store only).
 */
async function resolveViewer() {
  const user = await getCurrentUser();
  if (user) return { user, isDemoViewer: false };
  if (isMockStore()) {
    const demoYou = await getStore().getUserByToken("mock-hash-you");
    if (demoYou) return { user: demoYou, isDemoViewer: true };
  }
  return { user: null, isDemoViewer: false };
}

export default async function ScoreboardPage() {
  const store = getStore();
  const [leaderboard, standings, matches, { user, isDemoViewer }] = await Promise.all([
    store.getLeaderboard(),
    store.getDepartmentStandings(),
    store.getMatches(),
    resolveViewer(),
  ]);

  const view = buildRelativeView(leaderboard, await store.getDepartments(), user?.id ?? null);
  const raceModel = buildRaceModel(standings, user?.departmentId ?? null);

  // Office consensus for the next open match — shown subtly, NOT as odds.
  const nextOpen: Match | undefined = matches.find((m) => m.status === "scheduled");
  let consensus: (Consensus & { match: Match }) | null = null;
  if (nextOpen) {
    const c = await store.getConsensus(nextOpen.id);
    if (c.n > 0) consensus = { ...c, match: nextOpen };
  }

  const eligibleCount = standings.filter((s) => s.eligible).length;

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Section head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
            {COPY.race.sectionEyebrow}
          </p>
          <h1 className="display text-[clamp(2rem,7vw,3.25rem)]">{COPY.race.header}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="nb-pill" style={{ fontSize: "0.72rem" }}>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-green)" }}
              aria-hidden
            />
            {COPY.app.heartbeatUpdatedNow}
          </span>
        </div>
      </div>

      {/* HERO: the department race */}
      <Card popIn className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.92rem] font-bold" style={{ color: "var(--color-ink)" }}>
            Every correct pick pushes your department down the pitch. Knockouts count for more — so it&apos;s never over.
          </p>
          {raceModel.mover ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.75rem] font-extrabold"
              style={{ background: "var(--color-yellow)", border: "2px solid var(--color-ink)" }}
            >
              <span aria-hidden>▲</span>
              {fill(COPY.race.biggestMover, { dept: raceModel.mover.name, n: raceModel.mover.jumped })}
            </span>
          ) : null}
        </div>

        {eligibleCount === 0 ? (
          <p className="py-8 text-center text-[0.95rem]" style={{ color: "var(--color-muted)" }}>
            {COPY.empty.noResultsYet}
          </p>
        ) : (
          <DepartmentRace model={raceModel} />
        )}

        <p className="mt-4 text-[0.78rem]" style={{ color: "var(--color-muted)" }}>
          {COPY.race.fairnessNote}
        </p>
      </Card>

      {/* Office consensus — subtle, never odds */}
      {consensus ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Tag>{COPY.predict.consensusLabel}</Tag>
              <span className="text-[0.72rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
                {STAGE_LABEL[consensus.match.stage] ?? consensus.match.stage}
              </span>
            </div>
            <p className="mt-1.5 text-[0.95rem] font-bold">
              {consensus.match.home} vs {consensus.match.away}
            </p>
          </div>
          <ConsensusBar c={consensus} home={consensus.match.home} away={consensus.match.away} />
        </Card>
      ) : null}

      {/* Leaderboard (tabs: You / Departments) */}
      <Card popIn delay={0.06} className="p-5 sm:p-6">
        <h2 className="display mb-1 text-[1.4rem]">Where you stand</h2>
        <p className="mb-4 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          {view.hasViewer
            ? "Your spot, who's in reach, and the leaders to chase."
            : "The leaders to chase. Join with a code to see your own climb."}
        </p>
        <Leaderboard view={view} standings={standings} youDeptId={user?.departmentId ?? null} />
      </Card>

      {isDemoViewer ? (
        <p className="nb-pill self-center" style={{ fontSize: "0.68rem" }}>
          Demo view — showing the sample player &ldquo;{user?.displayName}&rdquo;. Join with a code to track your own.
        </p>
      ) : null}
    </div>
  );
}

/** A subtle three-segment consensus bar. Percentages, NOT odds. */
function ConsensusBar({
  c,
  home,
  away,
}: {
  c: Consensus;
  home: string;
  away: string;
}) {
  return (
    <div className="w-full sm:w-[18rem]">
      <div
        className="flex w-full overflow-hidden rounded-md"
        style={{ border: "2px solid var(--color-ink)" }}
        role="img"
        aria-label={`Office consensus: ${c.pctHome}% ${home}, ${c.pctDraw}% draw, ${c.pctAway}% ${away}, from ${c.n} picks`}
      >
        {c.pctHome > 0 ? <div style={{ width: `${c.pctHome}%`, height: 12, background: "var(--color-royal)" }} /> : null}
        {c.pctDraw > 0 ? <div style={{ width: `${c.pctDraw}%`, height: 12, background: "var(--color-muted)" }} /> : null}
        {c.pctAway > 0 ? <div style={{ width: `${c.pctAway}%`, height: 12, background: "var(--color-green)" }} /> : null}
      </div>
      <div className="mt-1 flex justify-between text-[0.66rem] font-bold" style={{ color: "var(--color-muted)" }}>
        <span>
          {home} {c.pctHome}%
        </span>
        <span>Draw {c.pctDraw}%</span>
        <span>
          {away} {c.pctAway}%
        </span>
      </div>
      <p className="mt-0.5 text-[0.6rem]" style={{ color: "var(--color-muted)" }}>
        What {c.n} colleague{c.n === 1 ? "" : "s"} picked · not odds
      </p>
    </div>
  );
}
