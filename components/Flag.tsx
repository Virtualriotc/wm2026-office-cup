import { flagCode } from "@/lib/flags";

/**
 * A team's flag, as a self-hosted SVG (NOT emoji — Windows renders flag emoji as
 * letters). Real countries get their flag; knockout placeholders ("Group F
 * Winner", "Third Place …") and any unknown label get a neutral grey badge.
 *
 * Decorative: the team name is always shown as adjacent text, so the flag is
 * aria-hidden to avoid screen readers reading the country twice.
 */
export function Flag({
  team,
  size = 20,
  className = "",
}: {
  team: string;
  size?: number;
  className?: string;
}) {
  const code = flagCode(team);
  const src = `/flags/${code ?? "_placeholder"}.svg`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static same-origin SVG; next/image adds no value
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-[2px] object-cover ${className}`}
      style={{ border: "1.5px solid var(--color-ink)" }}
    />
  );
}
