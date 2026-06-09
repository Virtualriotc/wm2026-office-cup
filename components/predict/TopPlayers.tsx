import Link from "next/link";
import type { LeaderboardRow, Department } from "@/lib/types";
import { Card } from "@/components/ui";

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Compact individual leaderboard for the top of the Predict page: the top 5
 * players, plus the viewer's own row pinned below if they're outside the top 5.
 * Before any match is scored there are no points, so it shows a "starts at
 * kickoff" note instead of a meaningless all-zero list.
 */
export function TopPlayers({
  rows,
  departments,
  viewerId,
}: {
  rows: LeaderboardRow[];
  departments: Department[];
  viewerId: string | null;
}) {
  if (rows.length === 0) return null;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const anyScored = rows.some((r) => r.points > 0);

  const top = rows.slice(0, 5);
  const viewer = viewerId ? rows.find((r) => r.userId === viewerId) : null;
  const viewerOutside =
    viewer !== null &&
    viewer !== undefined &&
    !top.some((r) => r.userId === viewer.userId);

  const Row = ({ r, you }: { r: LeaderboardRow; you: boolean }) => (
    <li
      className="flex items-center gap-2.5 px-1 py-1.5 text-[0.9rem]"
      style={you ? { background: "var(--color-yellow)", borderRadius: 8 } : undefined}
    >
      <span className="tnum w-7 shrink-0 text-center font-extrabold">
        {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold">
        {you ? "You · " : ""}
        {r.displayName}
        <span className="font-normal" style={{ color: "var(--color-muted)" }}>
          {" "}
          · {deptName.get(r.departmentId) ?? "—"}
        </span>
      </span>
      <span className="tnum shrink-0 font-extrabold">
        {r.points} {r.points === 1 ? "pt" : "pts"}
      </span>
    </li>
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="display text-[1.15rem]">Top players</h2>
        <Link
          href="/scoreboard"
          className="text-[0.78rem] font-extrabold no-underline"
          style={{ color: "var(--color-royal)" }}
        >
          See full board →
        </Link>
      </div>

      {!anyScored ? (
        <p className="text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
          Standings open when the first match kicks off. Get your picks in.
        </p>
      ) : (
        <ul className="flex flex-col">
          {top.map((r) => (
            <Row key={r.userId} r={r} you={r.userId === viewerId} />
          ))}
          {viewerOutside ? (
            <>
              <li
                className="my-1 text-center text-[0.7rem]"
                style={{ color: "var(--color-muted)" }}
                aria-hidden
              >
                · · ·
              </li>
              <Row r={viewer!} you />
            </>
          ) : null}
        </ul>
      )}
    </Card>
  );
}
