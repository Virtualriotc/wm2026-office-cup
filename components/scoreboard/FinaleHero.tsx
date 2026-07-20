import { Card } from "@/components/ui";
import { Flag } from "@/components/Flag";
import { COPY, fill } from "@/lib/copy";
import { readableTextOn } from "./relative";
import { abbrOf } from "./raceModel";
import type { CalledMatch, FinaleReport } from "@/lib/finale";
import type { Department, DepartmentStanding, LeaderboardRow } from "@/lib/types";

// ============================================================================
// FULL TIME — what the scoreboard becomes once the final is played.
//
// The headline is ARTHUR, not Spain. Nobody needs this app to tell them who
// won the World Cup — they watched it. What only this app knows is who won the
// office: who ran who down, by how many points, and which department carried
// it. The actual tournament result is a footnote near the bottom.
//
// The race is gone on purpose. Nothing can move again, so a lane animation and
// a live heartbeat would both be theatre.
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

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

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

/** "Ana, Ben +2 more" */
function namesLine(names: string[], more: number): string {
  return names.join(", ") + (more > 0 ? ` +${more} more` : "");
}

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
  departments,
  viewerId,
}: {
  report: FinaleReport;
  standings: DepartmentStanding[];
  leaderboard: LeaderboardRow[];
  departments: Department[];
  viewerId: string | null;
}) {
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  // --- the office champion (or champions, if the top is shared) ---
  const champions = leaderboard.filter((r) => r.rank === 1);
  const top = champions[0] ?? null;
  // Margin over the next DIFFERENT score, so a tie for second doesn't read as
  // a zero-point win.
  const nextBelow = top
    ? (leaderboard.find((r) => r.points < top.points)?.points ?? null)
    : null;
  const margin = top && nextBelow !== null ? top.points - nextBelow : null;
  const runnersUp = leaderboard.filter((r) => r.rank > 1).slice(0, 2);

  // How they got there: where they sat after the group stage, and whether they
  // owned the knockouts.
  const groupRank = top ? report.groupStageRank[top.userId] : undefined;
  const cameFromBehind = groupRank !== undefined && groupRank > 1;
  const ownedKnockouts =
    top != null &&
    report.knockoutLeader != null &&
    report.knockoutLeader.names.includes(top.displayName);

  const ranked = standings
    .filter((s) => s.eligible)
    .sort((a, b) => a.rank - b.rank);
  const unranked = standings.filter((s) => !s.eligible && s.activeMembers > 0);
  const deptWinner = ranked[0] ?? null;
  const deptMargin =
    ranked.length > 1 ? ranked[0]!.avgPoints - ranked[1]!.avgPoints : null;

  const personal = report.personal;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- 1. THE CHAMPION OF THE OFFICE ---------- */}
      <Card
        popIn
        className="nb-card--gold p-6 text-center sm:p-8"
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

        {top ? (
          <>
            <h2 className="display mt-4 text-[clamp(2rem,8vw,3.6rem)] leading-none">
              {champions.map((c) => c.displayName).join(" & ")}
            </h2>
            <p className="mt-2 text-[1rem] font-extrabold">
              {top.points} points
              {deptName.get(top.departmentId)
                ? ` · ${deptName.get(top.departmentId)}`
                : ""}
            </p>
            <p className="mt-1 text-[0.9rem] font-bold">
              {champions.length > 1 || margin === null
                ? COPY.finale.championLineTied
                : fill(COPY.finale.championLineSolo, {
                    n: `${margin} point${margin === 1 ? "" : "s"}`,
                  })}
            </p>

            {/* How the cup was actually won. */}
            {cameFromBehind || ownedKnockouts ? (
              <p
                className="mx-auto mt-3 max-w-[26rem] rounded-[10px] px-3 py-2 text-[0.82rem] font-bold"
                style={{ background: "var(--color-cream)", border: "var(--border-ink-thin)" }}
              >
                {cameFromBehind
                  ? `${ordinal(groupRank!)} after the group stage`
                  : "Led from the group stage"}
                {ownedKnockouts
                  ? ` — then the best knockout run in the office (${report.knockoutLeader!.points} pts)`
                  : ""}
              </p>
            ) : null}

            {runnersUp.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {runnersUp.map((r, i) => (
                  <span key={r.userId} className="nb-pill" style={{ fontSize: "0.78rem" }}>
                    {MEDAL[i + 1]} {r.displayName} · {r.points}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-[1.1rem] font-bold">No one made a pick.</p>
        )}
      </Card>

      {/* ---------- 2. The department race ---------- */}
      <Card popIn delay={0.05} className="p-5 sm:p-6">
        <h2 className="display text-[1.4rem]">{COPY.finale.officeTitle}</h2>

        {deptWinner ? (
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
                {fill(COPY.finale.officeWinnerLine, { dept: deptWinner.name })}
              </p>
              <p className="text-[0.78rem]" style={{ color: "var(--color-ink)", opacity: 0.75 }}>
                {deptWinner.avgPoints.toFixed(1)} average points ·{" "}
                {deptWinner.activeMembers} player
                {deptWinner.activeMembers === 1 ? "" : "s"}
                {deptMargin !== null
                  ? ` · by ${deptMargin.toFixed(2)}`
                  : ""}
              </p>
            </div>
          </div>
        ) : null}

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

        {leaderboard.length >= 3 ? (
          <>
            <p
              className="mt-5 mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-muted)" }}
            >
              {COPY.finale.podiumLabel}
            </p>
            <ul className="flex list-none flex-col gap-1.5 p-0">
              {leaderboard.slice(0, 3).map((r, i) => (
                <li
                  key={r.userId}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2"
                  style={{
                    border: "var(--border-ink)",
                    background: i === 0 ? "var(--color-gold)" : "var(--color-cream)",
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
            {(() => {
              const you = leaderboard.find((r) => r.userId === personal.userId);
              return you ? ` · finished #${you.rank} of ${leaderboard.length}` : "";
            })()}
          </p>

          <div
            className="mt-4 grid grid-cols-3 gap-2 rounded-[12px] px-3 py-4"
            style={{ border: "var(--border-ink)", background: "var(--color-haze)" }}
          >
            <BigStat
              n={`${leaderboard.find((r) => r.userId === personal.userId)?.points ?? personal.correct}`}
              label="points"
            />
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
            {report.groupStageRank[personal.userId] !== undefined ? (
              <StatLine
                label="After the group stage"
                value={`${ordinal(report.groupStageRank[personal.userId]!)} in the office`}
              />
            ) : null}
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
          <BigStat
            n={report.totalPoints.toLocaleString("en-GB")}
            label="points scored"
          />
        </div>

        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {report.groupStageLeader ? (
            <StatLine
              label="Led after the group stage"
              value={namesLine(
                report.groupStageLeader.names,
                report.groupStageLeader.more,
              )}
              note={`${report.groupStageLeader.points} points from the groups`}
            />
          ) : null}
          {report.bestKnockout ? (
            <StatLine
              label="Best knockout run"
              value={`${report.bestKnockout.ok} of ${report.bestKnockout.total} ties called`}
              note={namesLine(report.bestKnockout.names, report.bestKnockout.more)}
            />
          ) : null}
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
          <StatLine
            label="Office agreement"
            value={`${report.unanimousRight} matches everyone called right`}
            note={`…and ${report.unanimousWrong} nobody saw coming`}
          />
          <StatLine
            label="Office accuracy"
            value={`${report.accuracyPct}% of all picks came in`}
            note={`${report.correct.toLocaleString("en-GB")} correct out of ${report.picks.toLocaleString("en-GB")}`}
          />
        </ul>
      </Card>

      {/* ---------- 5. The actual World Cup — a footnote, not the headline ---- */}
      <Card popIn delay={0.2} className="p-4 sm:p-5">
        <p
          className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em]"
          style={{ color: "var(--color-muted)" }}
        >
          {COPY.finale.pitchTitle}
        </p>
        {report.champion ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2 text-[1.05rem] font-extrabold">
              <Flag team={report.champion} size={26} />
              {fill(COPY.finale.pitchLine, {
                winner: report.champion,
                loser: report.runnerUp ?? "",
              })}
            </span>
            {report.third ? (
              <span className="nb-pill" style={{ fontSize: "0.72rem" }}>
                🥉 {report.third}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[1rem] font-bold">
            {report.final.home} vs {report.final.away} — decided on the day
          </p>
        )}
        {report.final.n > 0 && report.champion ? (
          <p className="mt-1.5 text-[0.8rem]" style={{ color: "var(--color-muted)" }}>
            {report.final.ok} of {report.final.n} of you backed {report.champion}.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/** The sign-off, rendered at the very bottom of the finale page. */
export function ThankYou({ players }: { players: number }) {
  return (
    <Card popIn delay={0.25} className="p-6 text-center sm:p-8">
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
      <p className="mt-3 text-[0.85rem] font-bold">All {players} of you.</p>
      <p className="mt-3 text-[0.95rem] font-extrabold">
        {COPY.finale.thanksSignature}
      </p>
    </Card>
  );
}
