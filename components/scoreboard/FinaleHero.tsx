import { Card } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { COPY, fill } from "@/lib/copy";
import { readableTextOn } from "./relative";
import { abbrOf } from "./raceModel";
import type { CalledMatch, FinaleReport } from "@/lib/finale";
import type { DepartmentStanding, LeaderboardRow } from "@/lib/types";

// ============================================================================
// FULL TIME — what the scoreboard becomes once the final is played.
//
// The race is gone on purpose. Nothing can move again, so a lane animation and
// a live heartbeat would both be theatre. What people actually want the
// morning after: who won the cup, who won the office, how did *I* do, and one
// good stat for the coffee machine. In that order.
//
// The gold treatment is deliberate continuity — the final's round ribbon on
// the predict board is gold, so the champion card wears the same colour.
// ============================================================================

const MEDAL = ["🥇", "🥈", "🥉"];

const STAGE_LABEL: Record<string, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  final: "Final",
};

/** "Brazil beat Haiti" / "Spain drew with Cape Verde" — we store an outcome,
 *  not a scoreline, so the sentence never invents a score. */
function describeMatch(c: CalledMatch): string {
  if (c.outcome === "draw") return `${c.home} drew with ${c.away}`;
  const winner = c.outcome === "home" ? c.home : c.away;
  const loser = c.outcome === "home" ? c.away : c.home;
  return `${winner} beat ${loser}`;
}

/** "not one of 51 saw it" / "only 7 of 48 called it" / "all 51 called it". */
function callRate(c: CalledMatch): string {
  if (c.ok === 0) return `not one of ${c.n} saw it coming`;
  if (c.ok === c.n) return `all ${c.n} called it`;
  return `only ${c.ok} of ${c.n} called it`;
}

/** A stat line inside the "by the numbers" card. */
function StatLine({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <li
      className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5"
      style={{ border: "var(--border-ink)", background: "var(--color-cream)" }}
    >
      <span
        className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em]"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </span>
      <span className="text-[0.95rem] font-bold leading-snug">{value}</span>
      {note ? (
        <span className="text-[0.75rem]" style={{ color: "var(--color-muted)" }}>
          {note}
        </span>
      ) : null}
    </li>
  );
}

/** One big number in the headline stat row. */
function BigStat({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="tnum display text-[clamp(1.5rem,6vw,2.2rem)] leading-none">
        {n}
      </span>
      <span
        className="mt-1 text-center text-[0.6rem] font-extrabold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-muted)" }}
      >
        {label}
      </span>
    </div>
  );
}

export function FinaleHero({
  report,
  standings,
  leaderboard,
  viewerId,
}: {
  report: FinaleReport;
  standings: DepartmentStanding[];
  leaderboard: LeaderboardRow[];
  viewerId: string | null;
}) {
  const ranked = standings
    .filter((s) => s.eligible)
    .sort((a, b) => a.rank - b.rank);
  // Departments that played but never had enough people to be ranked — named
  // rather than silently dropped, so nobody's team just disappears at the end.
  const unranked = standings.filter((s) => !s.eligible && s.activeMembers > 0);
  const winner = ranked[0] ?? null;
  const podium = leaderboard.slice(0, 3);
  const you = viewerId
    ? (leaderboard.find((r) => r.userId === viewerId) ?? null)
    : null;
  const personal = report.personal;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- 1. The champions of the world ---------- */}
      <Card
        popIn
        className="nb-card--gold p-6 text-center sm:p-8"
        // The final's round ribbon on the predict board is gold; the champion
        // card finishes that thought rather than sitting on plain cream.
        style={{
          background:
            "linear-gradient(165deg, #fff6d8 0%, var(--color-gold) 55%, #eba100 100%)",
        }}
      >
        <span
          className="inline-block rounded-full px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.14em]"
          style={{ background: "var(--color-cream)", border: "var(--border-ink)" }}
        >
          🏆 {COPY.finale.championLabel}
        </span>

        {report.champion ? (
          <>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Flag team={report.champion} size={48} />
              <h2 className="display text-[clamp(2.2rem,9vw,4rem)] leading-none">
                {report.champion}
              </h2>
            </div>
            <p className="mt-3 text-[0.95rem] font-bold">
              {fill(COPY.finale.championLine, {
                winner: report.champion,
                loser: report.runnerUp ?? "",
              })}
            </p>
          </>
        ) : (
          // Defensive: we store an outcome, not a shootout. If the final ever
          // lands as a draw we say so plainly rather than crown the wrong side.
          <p className="mt-4 text-[1.1rem] font-bold">
            {report.final.home} vs {report.final.away} — decided on the day
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {report.runnerUp ? (
            <span className="nb-pill" style={{ fontSize: "0.78rem" }}>
              🥈 {report.runnerUp}
            </span>
          ) : null}
          {report.third ? (
            <span className="nb-pill" style={{ fontSize: "0.78rem" }}>
              🥉 {report.third}
            </span>
          ) : null}
        </div>
      </Card>

      {/* ---------- 2. The office cup ---------- */}
      <Card popIn delay={0.05} className="p-5 sm:p-6">
        <h2 className="display text-[1.4rem]">{COPY.finale.officeTitle}</h2>

        {winner ? (
          <div
            className="mt-3 flex items-center gap-3 rounded-[12px] px-3.5 py-3"
            style={{
              background: "var(--color-yellow)",
              border: "var(--border-ink)",
              boxShadow: "var(--shadow-hard-sm)",
            }}
          >
            <span className="text-[1.6rem] leading-none" aria-hidden>
              🏅
            </span>
            <div className="min-w-0">
              <p className="text-[1.05rem] font-extrabold leading-tight">
                {fill(COPY.finale.officeWinnerLine, { dept: winner.name })}
              </p>
              <p className="text-[0.78rem]" style={{ color: "var(--color-ink)", opacity: 0.75 }}>
                {winner.avgPoints.toFixed(1)} average points ·{" "}
                {winner.activeMembers} player{winner.activeMembers === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ) : null}

        {/* Final department table — the race, frozen. */}
        <ul className="mt-4 flex list-none flex-col gap-1 p-0">
          {ranked.map((s) => (
            <li
              key={s.departmentId}
              className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5"
              style={
                s.rank === 1
                  ? { background: "rgba(245,179,1,0.16)", border: "var(--border-ink-thin)" }
                  : undefined
              }
            >
              <span className="tnum w-6 shrink-0 text-center text-[0.85rem] font-extrabold">
                {s.rank}
              </span>
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[0.62rem] font-extrabold"
                style={{
                  background: s.color,
                  color: readableTextOn(s.color),
                  border: "var(--border-ink-thin)",
                }}
                aria-hidden
              >
                {abbrOf(s.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.9rem] font-bold">
                {s.name}
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block text-[0.9rem] font-extrabold leading-tight">
                  {s.avgPoints.toFixed(1)}
                </span>
                <span
                  className="block text-[0.58rem] leading-tight"
                  style={{ color: "var(--color-muted)" }}
                >
                  {s.activeMembers} played
                </span>
              </span>
            </li>
          ))}
        </ul>

        {unranked.length > 0 ? (
          <p className="mt-2 text-[0.72rem]" style={{ color: "var(--color-muted)" }}>
            Also played: {unranked.map((s) => s.name).join(", ")} — too few
            players to be ranked.
          </p>
        ) : null}

        {/* The individual podium. */}
        {podium.length > 0 ? (
          <>
            <p
              className="mt-5 mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-muted)" }}
            >
              {COPY.finale.podiumLabel}
            </p>
            <ul className="flex list-none flex-col gap-1.5 p-0">
              {podium.map((r, i) => (
                <li
                  key={r.userId}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2"
                  style={{
                    border: "var(--border-ink)",
                    background:
                      i === 0 ? "var(--color-gold)" : "var(--color-cream)",
                  }}
                >
                  <span className="text-[1.1rem] leading-none" aria-hidden>
                    {MEDAL[i]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] font-extrabold">
                    {r.displayName}
                    {r.userId === viewerId ? " · you" : ""}
                  </span>
                  <span className="tnum shrink-0 text-[0.95rem] font-extrabold">
                    {r.points} pts
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>

      {/* ---------- 3. Your own tournament ---------- */}
      {personal ? (
        <Card popIn delay={0.1} className="p-5 sm:p-6">
          <h2 className="display text-[1.4rem]">{COPY.finale.yourTitle}</h2>
          <p className="mt-0.5 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
            {personal.displayName}
            {you ? ` · finished #${you.rank} of ${leaderboard.length}` : ""}
          </p>

          <div
            className="mt-4 grid grid-cols-3 gap-2 rounded-[12px] px-3 py-4"
            style={{ border: "var(--border-ink)", background: "var(--color-haze)" }}
          >
            <BigStat n={you ? `${you.points}` : `${personal.correct}`} label={you ? "points" : "correct"} />
            <BigStat n={`${personal.accuracyPct}%`} label="called right" />
            <BigStat n={`${personal.longestStreak}`} label="best streak" />
          </div>

          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            <StatLine
              label="Your picks"
              value={`${personal.correct} of ${personal.picked} correct`}
            />
            <StatLine
              label="Knockouts"
              value={`${personal.koCorrect} of ${personal.koTotal} ties called`}
            />
            {personal.bestCall ? (
              <StatLine
                label="Your sharpest read"
                value={describeMatch(personal.bestCall)}
                note={`${STAGE_LABEL[personal.bestCall.stage] ?? personal.bestCall.stage} · ${callRate(personal.bestCall)}`}
              />
            ) : null}
          </ul>
        </Card>
      ) : null}

      {/* ---------- 4. Office-wide numbers ---------- */}
      <Card popIn delay={0.15} className="p-5 sm:p-6">
        <h2 className="display text-[1.4rem]">{COPY.finale.statsTitle}</h2>

        <div
          className="mt-3 grid grid-cols-3 gap-2 rounded-[12px] px-3 py-4"
          style={{ border: "var(--border-ink)", background: "var(--color-pitch)" }}
        >
          <BigStat n={`${report.players}`} label="players" />
          <BigStat n={report.picks.toLocaleString("en-GB")} label="picks made" />
          <BigStat n={`${report.accuracyPct}%`} label="called right" />
        </div>

        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {report.hardest ? (
            <StatLine
              label="Hardest call of the cup"
              value={describeMatch(report.hardest)}
              note={`${STAGE_LABEL[report.hardest.stage] ?? report.hardest.stage} · ${callRate(report.hardest)}`}
            />
          ) : null}
          {report.banker ? (
            <StatLine
              label="The banker"
              value={describeMatch(report.banker)}
              note={`${STAGE_LABEL[report.banker.stage] ?? report.banker.stage} · ${callRate(report.banker)}`}
            />
          ) : null}
          {report.final.n > 0 ? (
            <StatLine
              label="The final"
              value={
                report.champion
                  ? `${report.final.ok} of ${report.final.n} backed ${report.champion}`
                  : `${report.final.n} picked the final`
              }
            />
          ) : null}
          {report.bestKnockout ? (
            <StatLine
              label="Best knockout run"
              value={`${report.bestKnockout.ok} of ${report.bestKnockout.total} ties called`}
              note={
                report.bestKnockout.names.join(", ") +
                (report.bestKnockout.more > 0
                  ? ` +${report.bestKnockout.more} more`
                  : "")
              }
            />
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

/** The sign-off, rendered at the very bottom of the finale page. */
export function ThankYou({ players }: { players: number }) {
  return (
    <Card popIn delay={0.2} className="p-6 text-center sm:p-8">
      <span className="text-[2rem] leading-none" aria-hidden>
        👏
      </span>
      <h2 className="display mt-2 text-[1.6rem]">{COPY.finale.thanksTitle}</h2>
      <p
        className="mx-auto mt-2 max-w-[32rem] text-[0.92rem] leading-relaxed"
        style={{ color: "var(--color-muted)" }}
      >
        {COPY.finale.thanksBody}
      </p>
      <p className="mt-3 text-[0.85rem] font-bold">
        All {players} of you. Same again in 2030?
      </p>
    </Card>
  );
}
