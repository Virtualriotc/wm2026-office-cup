import type { Awards, AwardWinner } from "@/lib/types";
import { Card } from "@/components/ui";

// Award metadata, each with a one-line plain-English explanation so a newcomer
// gets it instantly. Result-based ones (star, hot streak) are null until the
// first matchday is scored, so they simply don't render before kickoff.
const ITEMS: {
  key: keyof Awards;
  icon: string;
  title: string;
  blurb: string;
  tint: string;
}[] = [
  {
    key: "star",
    icon: "⭐",
    title: "Star of the Matchday",
    blurb: "Most points in the latest round of games.",
    tint: "var(--color-yellow)",
  },
  {
    key: "hotStreak",
    icon: "🔥",
    title: "Hot Streak",
    blurb: "Longest run of correct picks in a row.",
    tint: "var(--color-coral)",
  },
  {
    key: "mainstream",
    icon: "📣",
    title: "Mainstream Picker",
    blurb: "Picks the office favourite most often.",
    tint: "var(--color-sky)",
  },
];

/** Primary winner + any co-winners, as one readable line. */
function winnersLine(w: AwardWinner): string {
  const all = [
    { displayName: w.displayName, departmentName: w.departmentName },
    ...w.sharedWith,
  ];
  if (all.length === 1) return `${w.displayName} · ${w.departmentName}`;
  const names = all.slice(0, 3).map((x) => x.displayName);
  const extra = all.length - names.length;
  return names.join(", ") + (extra > 0 ? ` +${extra} more` : "");
}

/**
 * A compact strip of fun "superlative" awards on the scoreboard. Renders only
 * the awards that have a winner — so before any match is played it shows just
 * the pick-based ones (or nothing). Ties show every co-winner.
 */
export function Superlatives({ awards }: { awards: Awards }) {
  const present = ITEMS.map((it) => ({ ...it, win: awards[it.key] })).filter(
    (it) => it.win !== null,
  );
  if (present.length === 0) return null;

  return (
    <Card popIn delay={0.04} className="p-5 sm:p-6">
      <h2 className="display mb-1 text-[1.4rem]">Superlatives</h2>
      <p className="mb-4 text-[0.85rem]" style={{ color: "var(--color-muted)" }}>
        A few fun ones from the office. More unlock once matches are played.
      </p>
      <ul className="flex flex-col gap-2.5">
        {present.map((it) => (
          <li
            key={it.key}
            className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
            style={{
              border: "var(--border-ink)",
              background: it.tint,
              boxShadow: "var(--shadow-hard-sm)",
            }}
          >
            <span className="text-[1.4rem] leading-none" aria-hidden>
              {it.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.92rem] font-extrabold leading-tight">
                {it.title}
              </p>
              <p
                className="text-[0.72rem] leading-snug"
                style={{ color: "var(--color-ink)", opacity: 0.7 }}
              >
                {it.blurb}
              </p>
              <p className="mt-0.5 truncate text-[0.9rem] font-bold">
                {winnersLine(it.win!)}
              </p>
            </div>
            <span
              className="tnum whitespace-nowrap rounded-full px-2.5 py-1 text-[0.76rem] font-extrabold"
              style={{ background: "var(--color-cream)", border: "2px solid var(--color-ink)" }}
            >
              {it.win!.detail}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
