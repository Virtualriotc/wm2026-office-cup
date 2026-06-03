import Link from "next/link";
import { getStore, isMockStore } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { COPY, fill } from "@/lib/copy";
import { Button, Card, Tag } from "@/components/ui";
import { buildRelativeView } from "@/components/scoreboard/relative";
import { buildRaceModel } from "@/components/scoreboard/raceModel";
import { DepartmentRace } from "@/components/scoreboard/DepartmentRace";
import { Leaderboard } from "@/components/scoreboard/Leaderboard";
import { Countdown } from "@/components/scoreboard/Countdown";
import {
  computeFirstKickoff,
  isPreTournament,
  hasScoredResult,
} from "@/components/scoreboard/scoreboardState";
import type { Consensus, Department, Match } from "@/lib/types";

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
  const [leaderboard, standings, matches, results, departments, { user, isDemoViewer }] =
    await Promise.all([
      store.getLeaderboard(),
      store.getDepartmentStandings(),
      store.getMatches(),
      store.getResults(),
      store.getDepartments(),
      resolveViewer(),
    ]);

  // Time-based switch: before the EARLIEST kickoff we show a countdown hero;
  // from kickoff on, the live race. Purely server-rendered per request (the
  // page is force-dynamic), no manual flag.
  const firstKickoff = computeFirstKickoff(matches);
  if (isPreTournament(firstKickoff, new Date()) && firstKickoff) {
    const firstMatch = matches.find((m) => m.kickoff === firstKickoff) ?? matches[0]!;
    return <CountdownHero target={firstKickoff} firstMatch={firstMatch} departments={departments} />;
  }

  const view = buildRelativeView(leaderboard, departments, user?.id ?? null);
  const raceModel = buildRaceModel(standings, user?.departmentId ?? null);
  // Gate the mover/streak badge on a real scored result: never on a pre-launch
  // or all-zero board, even if the model synthesizes a demo overtake.
  const showMover = hasScoredResult(results, standings);

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
          {showMover && raceModel.mover ? (
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

/**
 * Pre-tournament hero: a live countdown to the first kickoff, the opening
 * fixture, the departments lined up at the start, and a primary CTA into the
 * group-stage picks. This is the pre-launch surface colleagues land on before
 * any ball is kicked — it replaces the empty 0-0 race entirely.
 */
function CountdownHero({
  target,
  firstMatch,
  departments,
}: {
  target: string;
  firstMatch: Match;
  departments: Department[];
}) {
  const fixtureDate = new Date(target).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const fixtureLine = fill(COPY.countdown.firstFixtureLine, {
    home: firstMatch.home,
    away: firstMatch.away,
    date: fixtureDate,
  });

  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <p
          className="text-[0.72rem] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-muted)" }}
        >
          {COPY.race.sectionEyebrow}
        </p>
        <h1 className="display text-[clamp(2rem,7vw,3.25rem)]">{COPY.race.header}</h1>
      </div>

      <Card popIn className="flex flex-col items-center gap-5 p-6 text-center sm:p-8">
        <span className="nb-pill" style={{ fontSize: "0.72rem" }}>
          {COPY.countdown.eyebrow}
        </span>

        <h2 className="display text-[clamp(1.6rem,5.5vw,2.6rem)]">{COPY.countdown.heading}</h2>

        <Countdown target={target} />

        <div className="mt-1 flex flex-col items-center gap-1">
          <span
            className="text-[0.66rem] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-muted)" }}
          >
            {COPY.countdown.firstFixtureLabel}
          </span>
          <p className="text-[1.05rem] font-bold">{fixtureLine}</p>
        </div>

        <Link href="/predict" className="no-underline">
          <Button>{COPY.countdown.picksCta}</Button>
        </Link>

        <p className="max-w-[26rem] text-[0.82rem]" style={{ color: "var(--color-muted)" }}>
          {COPY.countdown.picksOpenSubline}
        </p>
      </Card>

      {departments.length > 0 ? (
        <Card delay={0.06} className="p-5 sm:p-6">
          <p
            className="mb-3 text-[0.66rem] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-muted)" }}
          >
            {COPY.countdown.lineupLabel}
          </p>
          <ul className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <li key={d.id}>
                <span
                  className="nb-pill"
                  style={{ fontSize: "0.78rem", fontWeight: 700 }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: d.color, border: "1.5px solid var(--color-ink)" }}
                    aria-hidden
                  />
                  {d.name}
                </span>
              </li>
            ))}
          </ul>
        </Card>
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
